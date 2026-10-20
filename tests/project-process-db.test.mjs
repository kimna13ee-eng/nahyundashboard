import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";

for (const workspace of ["PERSONAL", "FRENGLE"]) {
  test(`${workspace} project process: atomic save, archive/restore, timer/history safety and owner isolation`, async () => {
    const db = new PGlite({ extensions: { btree_gist } });
    await db.waitReady;
    const owner = "11111111-1111-4111-8111-111111111111";
    const other = "22222222-2222-4222-8222-222222222222";
    const outsider = "33333333-3333-4333-8333-333333333333";
    const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
    const all = async (sql, args = []) => (await db.query(sql, args)).rows;
    const become = async (id) =>
      db.exec(
        `reset role;set role authenticated;set request.jwt.claim.sub='${id}'`,
      );
    const timer = async (command, task, expected = null) =>
      (
        await one("select ops_timer_guarded($1,$2,$3,$4,'','{}') id", [
          command,
          task,
          randomUUID(),
          expected,
        ])
      ).id;
    const save = async (id, steps, overrides = {}) =>
      (
        await one("select ops_project_save($1,$2,$3,$4,$5,$6,$7) id", [
          id,
          overrides.title ?? "프로젝트",
          overrides.description ?? "설명",
          overrides.status ?? "active",
          overrides.category ?? "content",
          JSON.stringify(steps),
          overrides.expected ?? null,
        ])
      ).id;
    const stamp = async (id) =>
      (
        await one(
          "select updated_at::text value from ops_projects where id=$1",
          [id],
        )
      ).value;
    const steps = [
      { id: "a", title: "자료 수집", done: false },
      { id: "b", title: "원고", done: true },
      { id: "c", title: "검토", done: false },
    ];
    try {
      await db.exec(`create schema auth;create schema extensions;create role anon;create role authenticated;
        create table auth.users(id uuid primary key);insert into auth.users values('${owner}'),('${other}'),('${outsider}');
        create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
        grant usage on schema auth,public to authenticated,anon;`);
      const files =
        workspace === "PERSONAL"
          ? [
              "001_tasks.sql",
              "002_mvp.sql",
              "003_phase2.sql",
              "004_calendar_recurrence.sql",
              "005_task_classification.sql",
              "006_personal_content.sql",
              "007_workflow.sql",
              "008_content_history.sql",
              "009_prompt_metadata.sql",
              "010_stabilization.sql",
              "014_task_process.sql",
              "017_task_completion.sql",
            ]
          : [
              "001_automation_results.sql",
              "002_work_check_results.sql",
              "003_core_workspace.sql",
            ];
      for (const file of files)
        await db.exec(
          await readFile(`supabase/${workspace.toLowerCase()}/${file}`, "utf8"),
        );
      if (workspace === "FRENGLE")
        await db.query(
          "insert into ops_company_members(user_id) values($1),($2)",
          [owner, other],
        );
      await become(owner);
      const oldProject = await one(
        "insert into ops_projects(title) values('기존 프로젝트') returning *",
      );
      const legacy = await one(
        "insert into tasks(title,notes,status,project_id,task_category,process_steps) values('기존 실업무','보존 메모','running',$1,'sales','[{\"id\":\"old\",\"title\":\"기존 체크\",\"done\":true}]') returning *",
        [oldProject.id],
      );
      const legacySession = await timer("start", legacy.id);
      const oldSession = await one(
        "select * from ops_work_sessions where id=$1",
        [legacySession],
      );
      const migration = await readFile(
        `supabase/${workspace.toLowerCase()}/${workspace === "PERSONAL" ? "020" : "004"}_project_process.sql`,
        "utf8",
      );
      await db.exec("reset role");
      await db.exec(migration);
      const locks = await all(
        "select c.relname,t.tgtype::int flags from pg_trigger t join pg_class c on c.oid=t.tgrelid where t.tgname='project_owner_lock' order by c.relname",
      );
      assert.deepEqual(locks, [
        { relname: "ops_projects", flags: 30 },
        { relname: "ops_session_intervals", flags: 30 },
        { relname: "ops_work_sessions", flags: 30 },
        { relname: "tasks", flags: 30 },
      ]); // BEFORE STATEMENT, never row -> owner advisory lock inversion.
      await db.exec(
        "set request.jwt.claim.sub='';update tasks set notes=notes where false",
      ); // An administrative migration without a user remains a no-op.
      await become(owner);
      assert.deepEqual(
        await one("select * from tasks where id=$1", [legacy.id]),
        {
          ...legacy,
          project_step_id: null,
          project_step_order: null,
          project_step_archived_at: null,
        },
      );
      assert.deepEqual(
        await one("select * from ops_projects where id=$1", [oldProject.id]),
        { ...oldProject, project_category: "other" },
      );
      assert.deepEqual(
        await one("select * from ops_work_sessions where id=$1", [
          legacySession,
        ]),
        oldSession,
      );
      await timer("pause", legacy.id, legacySession);
      assert.equal(
        (await one("select ops_project_process_ready() ready")).ready,
        true,
      );

      const project = await save(null, steps);
      const managed = await all(
        "select * from tasks where project_id=$1 order by project_step_order",
        [project],
      );
      assert.equal(managed.length, 3);
      const [a, b, c] = managed;
      assert.equal(a.status, "pending");
      assert.equal(b.status, "completed");
      assert.ok(b.completed_at);
      await db.query(
        "insert into ops_task_notes(task_id,body,kind) values($1,'단계 메모 원문','general')",
        [a.id],
      );
      const session = await timer("start", a.id);
      await timer("pause", a.id, session);
      const history = async () => ({
        sessions: await all(
          "select * from ops_work_sessions where task_id=$1 order by id",
          [a.id],
        ),
        notes: await all(
          "select * from ops_task_notes where task_id=$1 order by id",
          [a.id],
        ),
        versions: await all(
          "select v.* from ops_note_versions v join ops_task_notes n on n.id=v.note_id where n.task_id=$1 order by v.id",
          [a.id],
        ),
        intervals: await all(
          "select * from ops_session_intervals where session_id=$1 order by id",
          [session],
        ),
        events: await all(
          "select * from ops_session_events where session_id=$1 order by id",
          [session],
        ),
        contexts: await all(
          "select * from ops_parked_context where session_id=$1 order by id",
          [session],
        ),
      });
      const priorHistory = await history();
      await db.query("update tasks set status='running' where id=$1", [a.id]);
      await db.query(
        "update tasks set status='failed',notes='실패 메모 유지' where id=$1",
        [c.id],
      );
      await save(
        project,
        [steps[2], { ...steps[0], title: "수집 내용 정리" }, steps[1]],
        { expected: await stamp(project), category: "development" },
      );
      assert.equal(
        (await one("select status from tasks where id=$1", [c.id])).status,
        "failed",
      );
      assert.equal(
        (await one("select status from tasks where id=$1", [a.id])).status,
        "running",
      );
      assert.equal(
        (
          await one("select completed_at from tasks where id=$1", [b.id])
        ).completed_at.getTime(),
        b.completed_at.getTime(),
      );
      assert.deepEqual(await history(), priorHistory);
      assert.equal(
        (
          await one("select created_at from tasks where id=$1", [a.id])
        ).created_at.getTime(),
        a.created_at.getTime(),
      );
      await save(project, [steps[2], steps[1]]);
      const archived = await one(
        "select project_step_archived_at from tasks where id=$1",
        [a.id],
      );
      assert.ok(archived.project_step_archived_at);
      assert.deepEqual(await history(), priorHistory);
      await assert.rejects(timer("start", a.id), /Archived or completed/);
      await assert.rejects(
        db.query(
          "update ops_session_intervals set ends_at=null where session_id=$1",
          [session],
        ),
        /Archived or completed/,
      );
      if (workspace === "PERSONAL") {
        await assert.rejects(
          db.query("select ops_timer('start',$1,$2,'')", [a.id, randomUUID()]),
          /Archived or completed/,
        );
        await assert.rejects(
          db.query("select ops_timer_context('start',$1,$2,'','{}')", [
            a.id,
            randomUUID(),
          ]),
          /Archived or completed/,
        );
      }
      await save(project, steps);
      assert.equal(
        (
          await one(
            "select id from tasks where project_id=$1 and project_step_id='a'",
            [project],
          )
        ).id,
        a.id,
      );
      assert.equal(
        (
          await one("select project_step_archived_at from tasks where id=$1", [
            a.id,
          ])
        ).project_step_archived_at,
        null,
      );
      assert.deepEqual(await history(), priorHistory);
      assert.equal(
        (await one("select status from tasks where id=$1", [c.id])).status,
        "failed",
      );
      const resumed = await timer("start", a.id);
      assert.equal(resumed, session);
      const beforeRejected = await all(
        "select * from tasks where project_id=$1 order by id",
        [project],
      );
      const projectBeforeRejected = await one(
        "select * from ops_projects where id=$1",
        [project],
      );
      await assert.rejects(
        save(project, [{ ...steps[1], title: "변하면 안 됨" }], {
          title: "변하면 안 됨",
        }),
        /active timer/,
      );
      await assert.rejects(
        save(project, [{ ...steps[0], done: true }, ...steps.slice(1)]),
        /active timer/,
      );
      await assert.rejects(
        save(project, steps, { status: "completed" }),
        /active timer/,
      );
      await assert.rejects(
        db.query("update tasks set status='completed' where id=$1", [a.id]),
        /active timer/,
      );
      await assert.rejects(
        db.query("delete from tasks where id=$1", [a.id]),
        /cannot be deleted/,
      );
      await assert.rejects(
        db.query("update tasks set project_id=$2 where id=$1", [
          a.id,
          oldProject.id,
        ]),
        /binding cannot be changed/,
      );
      assert.deepEqual(
        await all("select * from tasks where project_id=$1 order by id", [
          project,
        ]),
        beforeRejected,
      );
      assert.deepEqual(
        await one("select * from ops_projects where id=$1", [project]),
        projectBeforeRejected,
      );
      await timer("finish", a.id, session);
      const oldStamp = await stamp(project);
      await db.query("update tasks set status='completed' where id=$1", [a.id]);
      await assert.rejects(
        save(project, steps, { expected: oldStamp }),
        /changed since editing/,
      );
      const completedStamp = (
        await one("select completed_at from tasks where id=$1", [a.id])
      ).completed_at;
      await save(project, [{ ...steps[0], done: true }, ...steps.slice(1)], {
        expected: await stamp(project),
      });
      assert.equal(
        (
          await one("select completed_at from tasks where id=$1", [a.id])
        ).completed_at.getTime(),
        completedStamp.getTime(),
      );
      await save(project, steps);
      assert.equal(
        (await one("select status,completed_at from tasks where id=$1", [a.id]))
          .status,
        "pending",
      );
      assert.equal(
        (await one("select completed_at from tasks where id=$1", [a.id]))
          .completed_at,
        null,
      );
      await assert.rejects(
        save(project, [...steps, steps[0]]),
        /Invalid project/,
      );
      await assert.rejects(
        save(project, steps, { category: "sales" }),
        /Invalid project/,
      );
      await assert.rejects(
        db.query(
          "insert into tasks(title,project_step_id,project_step_order) values('잘못된 연결','a',0)",
        ),
        /check constraint/,
      );
      await assert.rejects(
        db.query(
          "insert into tasks(title,project_id,project_step_id,project_step_order) values('중복 단계',$1,'a',0)",
          [project],
        ),
        /unique constraint/,
      );
      assert.deepEqual(
        await one("select * from tasks where id=$1", [legacy.id]),
        {
          ...legacy,
          project_step_id: null,
          project_step_order: null,
          project_step_archived_at: null,
        },
      );
      const allBeforeReapply = await all("select * from tasks order by id");
      await db.exec("reset role");
      await db.exec(migration);
      await become(owner);
      assert.deepEqual(
        await all("select * from tasks order by id"),
        allBeforeReapply,
      );
      await become(other);
      await assert.rejects(save(project, []), /Project not found/);
      assert.equal((await all("select * from tasks")).length, 0);
      assert.equal((await all("select * from ops_projects")).length, 0);
      const otherProject = await save(null, [
        { id: "a", title: "다른 소유자의 같은 단계명", done: false },
      ]);
      assert.ok(otherProject);
      if (workspace === "FRENGLE") {
        await become(outsider);
        await assert.rejects(save(null, []), /Company membership/);
      }
      await db.exec("reset role;set role anon");
      await assert.rejects(save(null, []), /permission denied/);
      await db.exec("reset role");
      const functions = await all(
        "select prosecdef from pg_proc where proname like 'ops_project_%'",
      );
      assert.ok(functions.length >= 5);
      assert.equal(
        functions.some((fn) => fn.prosecdef),
        false,
      );
    } finally {
      await db.close();
    }
  });
}
