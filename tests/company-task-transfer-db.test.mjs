import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import {
  buildCompanyTaskExport,
  buildCompanyTaskImport,
  buildCompanyTaskVerification,
  buildCompanyTaskFinalize,
  transferFingerprints,
  transferTables,
  validateCompanyTaskExport,
} from "../scripts/company-task-transfer.mjs";

const source = "11111111-1111-4111-8111-111111111111";
const target = "22222222-2222-4222-8222-222222222222";
const id = (number) =>
  `aaaaaaaa-aaaa-4aaa-8aaa-${String(number).padStart(12, "0")}`;
const taskIds = Array.from({ length: 10 }, (_, index) => id(index + 1));
const parkedId = id(101);
const endedId = id(102);
const qaTaskId = id(999);
const qaSessionId = id(998);
const manifest = {
  format_version: 1,
  source_owner: source,
  target_owner: target,
  task_ids: taskIds,
  expected_parked_session_ids: [parkedId],
};
const stamp = "2026-10-18T01:02:03+00:00";

function task(taskId, index = 0) {
  return {
    id: taskId,
    owner_id: source,
    title: `Fixture company task ${index}`,
    notes: "고객's 원문\n두 번째 줄 $transfer$",
    status: index === 0 ? "completed" : index === 1 ? "running" : "pending",
    priority: "normal",
    due_date: "2026-10-23",
    created_at: "2026-10-10T01:02:03+00:00",
    project_id: null,
    tool: "",
    assignee: "",
    result_url: "https://example.invalid/result",
    estimated_minutes: 0,
    approval: "none",
    updated_at: stamp,
    work_kind: "planned",
    follow_up_at: null,
    contact_status: "none",
    is_test: null,
    task_category: "content",
    process_steps: [
      { id: "draft", title: "초안", done: true },
      { id: "review", title: "검수", done: false },
    ],
    completed_at: index === 0 ? stamp : null,
  };
}

function payloadFixture() {
  const noteId = id(201);
  const tables = {
    tasks: taskIds.map(task),
    task_notes: [
      {
        id: noteId,
        owner_id: source,
        task_id: taskIds[0],
        body: "현재 원문",
        kind: "next_action",
        pinned: true,
        done: false,
        converted_task_id: taskIds[2],
        created_at: stamp,
        updated_at: stamp,
      },
    ],
    note_versions: [0, 1].map((index) => ({
      id: id(210 + index),
      owner_id: source,
      note_id: noteId,
      body: index ? "현재 원문" : "이전 원문",
      kind: "next_action",
      pinned: true,
      done: false,
      created_at: stamp,
    })),
    work_sessions: [
      {
        id: parkedId,
        owner_id: source,
        task_id: taskIds[1],
        status: "PARKED",
        summary: "중단 맥락",
        created_at: stamp,
        updated_at: stamp,
        ended_at: null,
      },
      {
        id: endedId,
        owner_id: source,
        task_id: taskIds[0],
        status: "ENDED",
        summary: "완료 요약",
        created_at: stamp,
        updated_at: stamp,
        ended_at: "2026-10-18T03:00:00+00:00",
      },
    ],
    session_intervals: [
      {
        id: id(301),
        owner_id: source,
        session_id: parkedId,
        starts_at: "2026-10-18T01:00:00+00:00",
        ends_at: "2026-10-18T01:30:00+00:00",
        created_at: stamp,
      },
      {
        id: id(302),
        owner_id: source,
        session_id: endedId,
        starts_at: "2026-10-18T02:00:00+00:00",
        ends_at: "2026-10-18T03:00:00+00:00",
        created_at: stamp,
      },
    ],
    session_events: [
      {
        id: id(401),
        owner_id: source,
        request_id: id(411),
        session_id: parkedId,
        previous_session_id: qaSessionId,
        kind: "pause",
        created_at: stamp,
      },
      {
        id: id(402),
        owner_id: source,
        request_id: id(412),
        session_id: endedId,
        previous_session_id: parkedId,
        kind: "finish",
        created_at: stamp,
      },
    ],
    work_journal: [
      {
        id: id(501),
        owner_id: source,
        session_id: endedId,
        work_date: "2026-10-18",
        summary: "실제 일지 원문",
        created_at: stamp,
      },
    ],
    parked_context: [
      {
        id: id(601),
        owner_id: source,
        session_id: parkedId,
        payload: {
          last_stage: "초안",
          last_note: "저장한 원문",
          issues: [],
          next_actions: [],
          next_action: "검수",
          last_file: "",
          result_url: "",
          tool: "",
          paused_at: stamp,
          reason: "업무 전환",
        },
        created_at: stamp,
      },
    ],
  };
  return {
    format_version: 1,
    source_owner: source,
    target_owner: target,
    selected_task_ids: taskIds,
    generated_at: stamp,
    counts: Object.fromEntries(
      Object.entries(tables).map(([key, rows]) => [key, rows.length]),
    ),
    tables,
  };
}

async function database() {
  const db = new PGlite({ extensions: { btree_gist } });
  await db.waitReady;
  await db.exec(`create schema auth;create schema extensions;create role anon;create role authenticated;
    create table auth.users(id uuid primary key);insert into auth.users values('${source}'),('${target}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth,public to authenticated,anon;`);
  for (const file of [
    "001_automation_results.sql",
    "002_work_check_results.sql",
    "003_core_workspace.sql",
  ])
    await db.exec(await readFile(`supabase/frengle/${file}`, "utf8"));
  await db.query("insert into ops_company_members(user_id) values($1)", [
    target,
  ]);
  return db;
}

async function insertRows(db, key, rows) {
  const { table, columns } = transferTables[key];
  await db.query(
    `insert into public.${table}(${columns.join(",")}) select ${columns.join(",")} from jsonb_populate_recordset(null::public.${table},$1::jsonb)`,
    [JSON.stringify(rows)],
  );
}

async function seedSource(db) {
  const fixture = payloadFixture();
  await db.exec(
    "alter table tasks disable trigger task_completion_stamp;alter table ops_task_notes disable trigger note_version;create table ops_personal_sheet_sources(owner_id uuid primary key)",
  );
  await insertRows(db, "tasks", [
    ...fixture.tables.tasks,
    { ...task(qaTaskId), is_test: true },
  ]);
  await insertRows(db, "work_sessions", [
    {
      id: qaSessionId,
      owner_id: source,
      task_id: qaTaskId,
      status: "ENDED",
      summary: "QA excluded",
      created_at: stamp,
      updated_at: stamp,
      ended_at: stamp,
    },
  ]);
  for (const key of Object.keys(transferTables).filter(
    (key) => key !== "tasks",
  ))
    await insertRows(db, key, fixture.tables[key]);
  return fixture;
}

function receiptFixture(payload) {
  return {
    format_version: 1,
    verified: true,
    source_owner: source,
    target_owner: target,
    task_ids: taskIds,
    ...transferFingerprints(payload, manifest),
    counts: payload.counts,
    verified_at: new Date().toISOString(),
  };
}

test("read-only export selects exactly the approved task/history closure, excluding QA rows", async () => {
  const db = await database();
  try {
    const fixture = payloadFixture();
    await db.exec(
      "alter table tasks disable trigger task_completion_stamp;alter table ops_task_notes disable trigger note_version",
    );
    await insertRows(db, "tasks", [
      ...fixture.tables.tasks,
      { ...task(qaTaskId), is_test: true },
    ]);
    await insertRows(db, "work_sessions", [
      {
        id: qaSessionId,
        owner_id: source,
        task_id: qaTaskId,
        status: "ENDED",
        summary: "QA excluded",
        created_at: stamp,
        updated_at: stamp,
        ended_at: stamp,
      },
    ]);
    for (const key of Object.keys(transferTables).filter(
      (key) => key !== "tasks",
    ))
      await insertRows(db, key, fixture.tables[key]);
    const before = (
      await db.query(
        "select to_jsonb(t) row from ops_work_sessions t order by id",
      )
    ).rows;
    const exported = (await db.query(buildCompanyTaskExport(manifest))).rows[0]
      .company_task_export;
    assert.equal(exported.checks.selected_task_count, 10);
    assert.equal(exported.checks.external_previous_session_ids, 1);
    assert.equal(
      exported.tables.tasks.some((row) => row.id === qaTaskId),
      false,
    );
    assert.equal(
      exported.tables.work_sessions.some((row) => row.id === qaSessionId),
      false,
    );
    assert.deepEqual(
      (
        await db.query(
          "select to_jsonb(t) row from ops_work_sessions t order by id",
        )
      ).rows,
      before,
    );
    const normalized = validateCompanyTaskExport(exported, manifest);
    assert.equal(normalized.report.counts.tasks, 10);
    assert.equal(
      normalized.tables.work_sessions.find((row) => row.id === parkedId).status,
      "PARKED",
    );
  } finally {
    await db.close();
  }
});

test("import preserves all history and PARKED state, clears only external previous-session links and restores O/A/R/D triggers", async () => {
  const db = await database();
  try {
    await db.exec(`alter table tasks enable always trigger task_completion_stamp;
      create function public.transfer_fixture_trigger() returns trigger language plpgsql as $$begin return new;end$$;
      create trigger transfer_replica before insert on tasks for each row execute function public.transfer_fixture_trigger();
      alter table tasks enable replica trigger transfer_replica;
      create trigger transfer_disabled before insert on tasks for each row execute function public.transfer_fixture_trigger();
      alter table tasks disable trigger transfer_disabled;`);
    const triggerState = async () =>
      (
        await db.query(
          "select c.relname,t.tgname,t.tgenabled from pg_trigger t join pg_class c on c.oid=t.tgrelid where not t.tgisinternal and c.relname in('tasks','ops_task_notes') order by 1,2",
        )
      ).rows;
    const before = await triggerState();
    const fixture = payloadFixture();
    await db.exec(buildCompanyTaskImport(fixture, manifest));
    const receipt = (
      await db.query(buildCompanyTaskVerification(fixture, manifest))
    ).rows[0].company_task_transfer_verification;
    assert.equal(receipt.verified, true);
    assert.deepEqual(receipt.counts, fixture.counts);
    assert.equal(
      receipt.source_fingerprint,
      transferFingerprints(fixture, manifest).source_fingerprint,
    );
    assert.doesNotThrow(() =>
      buildCompanyTaskFinalize(fixture, manifest, receipt),
    );
    assert.deepEqual(await triggerState(), before);
    assert.equal(
      (
        await db.query("select count(*)::int n from tasks where owner_id=$1", [
          target,
        ])
      ).rows[0].n,
      10,
    );
    const completed = (
      await db.query(
        "select status,created_at,updated_at,completed_at,process_steps,notes from tasks where id=$1",
        [taskIds[0]],
      )
    ).rows[0];
    assert.equal(completed.status, "completed");
    assert.equal(
      completed.completed_at.toISOString(),
      "2026-10-18T01:02:03.000Z",
    );
    assert.equal(
      completed.updated_at.toISOString(),
      "2026-10-18T01:02:03.000Z",
    );
    assert.equal(
      completed.created_at.toISOString(),
      "2026-10-10T01:02:03.000Z",
    );
    assert.deepEqual(
      completed.process_steps,
      fixture.tables.tasks[0].process_steps,
    );
    assert.equal(completed.notes, fixture.tables.tasks[0].notes);
    assert.equal(
      (
        await db.query("select status from ops_work_sessions where id=$1", [
          parkedId,
        ])
      ).rows[0].status,
      "PARKED",
    );
    assert.equal(
      (await db.query("select count(*)::int n from ops_note_versions")).rows[0]
        .n,
      2,
    );
    assert.equal(
      (
        await db.query(
          "select previous_session_id from ops_session_events where id=$1",
          [id(401)],
        )
      ).rows[0].previous_session_id,
      null,
    );
    assert.equal(
      (
        await db.query(
          "select previous_session_id from ops_session_events where id=$1",
          [id(402)],
        )
      ).rows[0].previous_session_id,
      parkedId,
    );
    assert.deepEqual(
      (await db.query("select payload from ops_parked_context")).rows[0]
        .payload,
      fixture.tables.parked_context[0].payload,
    );
    await db.exec("begin");
    await db.query(
      "update tasks set title='changed after target copy' where id=$1",
      [taskIds[0]],
    );
    assert.equal(
      (await db.query(buildCompanyTaskVerification(fixture, manifest))).rows[0]
        .company_task_transfer_verification.verified,
      false,
    );
    await db.exec("rollback");
    for (const { table } of Object.values(transferTables))
      assert.equal(
        (
          await db.query(
            `select count(*)::int n from public.${table} where owner_id=$1`,
            [source],
          )
        ).rows[0].n,
        0,
      );
    await db.exec(
      `set role authenticated;set request.jwt.claim.sub='${target}'`,
    );
    assert.equal(
      (await db.query("select count(*)::int n from tasks")).rows[0].n,
      10,
    );
    await db.exec(
      `reset role;set role authenticated;set request.jwt.claim.sub='${source}'`,
    );
    assert.equal(
      (await db.query("select count(*)::int n from tasks")).rows[0].n,
      0,
    );
  } finally {
    await db.close();
  }
});

test("task ID collision or missing target membership aborts the whole import without changing history/triggers", async () => {
  const db = await database();
  try {
    await db.query(
      "insert into tasks(id,owner_id,title) values($1,$2,'existing target row')",
      [taskIds[0], target],
    );
    const before = (await db.query("select to_jsonb(t) row from tasks t")).rows;
    const sql = buildCompanyTaskImport(payloadFixture(), manifest);
    await assert.rejects(db.exec(sql), /ID collision/);
    await db.exec("rollback");
    assert.deepEqual(
      (await db.query("select to_jsonb(t) row from tasks t")).rows,
      before,
    );
    assert.equal(
      (await db.query("select count(*)::int n from ops_work_sessions")).rows[0]
        .n,
      0,
    );
    assert.equal(
      (
        await db.query(
          "select tgenabled from pg_trigger where tgname='task_completion_stamp'",
        )
      ).rows[0].tgenabled,
      "O",
    );
    await db.query("delete from ops_company_members where user_id=$1", [
      target,
    ]);
    await assert.rejects(db.exec(sql), /Target company member is missing/);
    await db.exec("rollback");
    assert.deepEqual(
      (await db.query("select to_jsonb(t) row from tasks t")).rows,
      before,
    );
  } finally {
    await db.close();
  }
});

test("generator refuses unknown scope, owner, projects, converted-task FKs, active timers or credentials", () => {
  const attempts = [
    (p) => {
      p.tables.tasks[0].owner_id = target;
    },
    (p) => {
      p.tables.tasks[0].project_id = qaTaskId;
    },
    (p) => {
      p.tables.task_notes[0].converted_task_id = qaTaskId;
    },
    (p) => {
      p.tables.work_sessions[0].task_id = qaTaskId;
    },
    (p) => {
      p.tables.work_sessions[0].status = "ACTIVE";
    },
    (p) => {
      p.tables.tasks[0].notes = "password=fixture-private-value";
    },
    (p) => {
      p.tables.tasks[0].unexpected_private_column = "not permitted";
    },
    (p) => {
      p.tables.ops_leave_entries = [];
    },
    (p) => {
      p.tables.tasks.pop();
    },
    (p) => {
      p.counts.tasks = 11;
    },
  ];
  for (const mutate of attempts) {
    const payload = payloadFixture();
    mutate(payload);
    assert.throws(() => buildCompanyTaskImport(payload, manifest));
  }
  const normalized = validateCompanyTaskExport(payloadFixture(), manifest);
  assert.deepEqual(normalized.report.cleared_previous_session_links, [
    { event_id: id(401), previous_session_id: qaSessionId },
  ]);
  const sourceFixture = payloadFixture();
  validateCompanyTaskExport(sourceFixture, manifest);
  assert.equal(
    sourceFixture.tables.session_events[0].previous_session_id,
    qaSessionId,
  );
});

test("source finalization removes only exact verified history and retains unrelated QA records", async () => {
  const db = await database();
  try {
    const fixture = await seedSource(db);
    await db.exec(
      buildCompanyTaskFinalize(fixture, manifest, receiptFixture(fixture)),
    );
    assert.deepEqual(
      (await db.query("select id from tasks order by id")).rows.map(
        (row) => row.id,
      ),
      [qaTaskId],
    );
    assert.deepEqual(
      (await db.query("select id from ops_work_sessions order by id")).rows.map(
        (row) => row.id,
      ),
      [qaSessionId],
    );
    for (const key of Object.keys(transferTables).filter(
      (key) => !["tasks", "work_sessions"].includes(key),
    ))
      assert.equal(
        (
          await db.query(
            `select count(*)::int n from ${transferTables[key].table}`,
          )
        ).rows[0].n,
        0,
      );
    assert.equal(
      (
        await db.query(
          "select relrowsecurity,relforcerowsecurity from pg_class where oid='tasks'::regclass",
        )
      ).rows[0].relforcerowsecurity,
      true,
    );
  } finally {
    await db.close();
  }
});

test("source finalization aborts for unknown CASCADE references, changed source or new children/open intervals", async () => {
  const db = await database();
  try {
    const fixture = await seedSource(db);
    const sql = buildCompanyTaskFinalize(
      fixture,
      manifest,
      receiptFixture(fixture),
    );
    await db.exec(
      "create table external_child(id uuid primary key default gen_random_uuid(),task_id uuid references tasks(id) on delete cascade)",
    );
    await db.query("insert into external_child(task_id) values($1)", [
      taskIds[0],
    ]);
    await assert.rejects(db.exec(sql), /External FK reference/);
    await db.exec("rollback");
    assert.equal(
      (await db.query("select count(*)::int n from external_child")).rows[0].n,
      1,
    );
    assert.equal(
      (await db.query("select count(*)::int n from tasks")).rows[0].n,
      11,
    );
    await db.exec("delete from external_child");
    await db.query(
      "update tasks set title='changed after export' where id=$1",
      [taskIds[0]],
    );
    await assert.rejects(
      db.exec(sql),
      /Source fingerprint\/child closure changed/,
    );
    await db.exec("rollback");
    await db.query(
      "insert into ops_task_notes(task_id,owner_id,body,kind) values($1,$2,'new child','general')",
      [taskIds[1], source],
    );
    await assert.rejects(
      db.exec(sql),
      /Source fingerprint\/child closure changed|External FK reference/,
    );
    await db.exec("rollback");
    await db.query(
      "insert into ops_session_intervals(owner_id,session_id,starts_at) values($1,$2,'2026-10-20T00:00:00Z')",
      [source, parkedId],
    );
    await assert.rejects(db.exec(sql), /Active timer\/open interval/);
    await db.exec("rollback");
    assert.equal(
      (await db.query("select count(*)::int n from tasks")).rows[0].n,
      11,
    );
    assert.equal(
      (await db.query("select count(*)::int n from ops_work_sessions")).rows[0]
        .n,
      3,
    );
  } finally {
    await db.close();
  }
});

test("finalization preparation requires fresh matching receipt; failed verification is never proof", () => {
  const fixture = payloadFixture();
  for (const mutate of [
    (receipt) => {
      receipt.verified = false;
    },
    (receipt) => {
      receipt.source_fingerprint = "0".repeat(64);
    },
    (receipt) => {
      receipt.target_owner = source;
    },
    (receipt) => {
      receipt.verified_at = "2000-01-01T00:00:00Z";
    },
  ]) {
    const receipt = receiptFixture(fixture);
    mutate(receipt);
    assert.throws(() => buildCompanyTaskFinalize(fixture, manifest, receipt));
  }
});
