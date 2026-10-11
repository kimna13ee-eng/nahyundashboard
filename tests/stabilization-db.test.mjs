import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
test("격리 DB: 타이머 재시도·전환·늦은 종료 재현과 SQL010 가드, Inbox 복원·RLS", async () => {
  const db = new PGlite({ extensions: { btree_gist } });
  await db.waitReady;
  try {
    await db.exec(
      `create schema auth;create schema extensions;create role anon;create role authenticated;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated,anon;insert into auth.users values('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');`,
    );
    for (const f of [
      "001_tasks.sql",
      "002_mvp.sql",
      "003_phase2.sql",
      "004_calendar_recurrence.sql",
      "005_task_classification.sql",
      "006_personal_content.sql",
      "007_workflow.sql",
      "008_content_history.sql",
      "009_prompt_metadata.sql",
    ])
      await db.exec(await readFile(`supabase/personal/${f}`, "utf8"));
    await db.exec(
      "set role authenticated;set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111'",
    );
    const a = (
      await db.query(
        "insert into tasks(title) values('[QA 테스트] A') returning id",
      )
    ).rows[0].id;
    const b = (
      await db.query(
        "insert into tasks(title) values('[QA 테스트] B') returning id",
      )
    ).rows[0].id;
    const timer = async (cmd, task, id) =>
      (await db.query("select ops_timer($1,$2,$3,'') id", [cmd, task, id]))
        .rows[0].id;
    const { randomUUID } = await import("node:crypto");
    // PGlite queues these requests: this checks invariants, not multi-connection concurrency.
    await Promise.all([
      timer("start", a, randomUUID()),
      timer("start", b, randomUUID()),
    ]);
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from ops_work_sessions where status='ACTIVE'",
        )
      ).rows[0].n,
      1,
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from ops_session_intervals where ends_at is null",
        )
      ).rows[0].n,
      1,
    );
    let active = (
      await db.query(
        "select id,task_id from ops_work_sessions where status='ACTIVE'",
      )
    ).rows[0];
    const request = randomUUID();
    const ended = await timer("finish", active.task_id, request);
    assert.equal(await timer("finish", active.task_id, request), ended);
    await assert.rejects(
      timer("finish", active.task_id, randomUUID()),
      /No active session/,
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from ops_work_journal where session_id=$1",
          [ended],
        )
      ).rows[0].n,
      1,
    );
    for (let i = 0; i < 12; i++)
      await timer("start", i % 2 ? a : b, randomUUID());
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from ops_session_intervals a join ops_session_intervals b on a.id<b.id and tstzrange(a.starts_at,a.ends_at,'[)') && tstzrange(b.starts_at,b.ends_at,'[)')",
        )
      ).rows[0].n,
      0,
    );
    active = (
      await db.query(
        "select id,task_id from ops_work_sessions where status='ACTIVE'",
      )
    ).rows[0];
    await timer("finish", active.task_id, randomUUID());
    const newSession = await timer("start", active.task_id, randomUUID());
    assert.notEqual(newSession, active.id);
    // Existing API only binds task_id: a delayed distinct finish ends the new session.
    assert.equal(
      await timer("finish", active.task_id, randomUUID()),
      newSession,
    );
    await db.exec("reset role");
    await db.exec(
      await readFile("supabase/personal/010_stabilization.sql", "utf8"),
    );
    await db.exec("set role authenticated");
    assert.equal(
      (await db.query("select ops_timer_guard_ready() ready")).rows[0].ready,
      true,
    );
    const beforeRerun = (
      await db.query("select count(*)::int n from ops_work_sessions")
    ).rows[0].n;
    await db.exec("reset role");
    await db.exec(
      await readFile("supabase/personal/010_stabilization.sql", "utf8"),
    );
    await db.exec("set role authenticated");
    assert.equal(
      (await db.query("select count(*)::int n from ops_work_sessions")).rows[0]
        .n,
      beforeRerun,
    );
    const protectedSession = await timer("start", active.task_id, randomUUID());
    const late = (
      await db.query("select ops_timer_guarded('finish',$1,$2,$3,'','{}') id", [
        active.task_id,
        randomUUID(),
        newSession,
      ])
    ).rows[0].id;
    assert.equal(late, newSession);
    assert.equal(
      (
        await db.query("select status from ops_work_sessions where id=$1", [
          protectedSession,
        ])
      ).rows[0].status,
      "ACTIVE",
    );
    const { parseTimerRequest } = await import("../src/lib/timer-request.ts");
    const guardedFinish = async (requestId) => {
      const args = parseTimerRequest({
        command: "finish",
        task_id: active.task_id,
        request_id: requestId,
        expected_session_id: protectedSession,
        summary: "검증 요약",
      });
      return (
        await db.query("select ops_timer_guarded($1,$2,$3,$4,$5,$6) id", [
          args.p_command,
          args.p_task_id,
          args.p_request_id,
          args.p_expected_session_id,
          args.p_summary,
          JSON.stringify(args.p_context),
        ])
      ).rows[0].id;
    };
    assert.deepEqual(
      await Promise.all([
        guardedFinish(randomUUID()),
        guardedFinish(randomUUID()),
      ]),
      [protectedSession, protectedSession],
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from ops_work_journal where session_id=$1",
          [protectedSession],
        )
      ).rows[0].n,
      1,
    );
    await assert.rejects(
      db.query("select ops_timer_guarded('finish',$1,$2,null,'','{}')", [
        active.task_id,
        randomUUID(),
      ]),
      /Expected session required/,
    );
    const capture = randomUUID();
    await db.query("select ops_capture($1,'inbox',$2,'{}')", [
      capture,
      JSON.stringify({ title: "[QA 테스트] 변환" }),
    ]);
    await db.query("select ops_capture($1,'task','{}','{}')", [capture]);
    const linked = (
      await db.query("select converted_task_id from ops_inbox where id=$1", [
        capture,
      ])
    ).rows[0].converted_task_id;
    await db.query("select ops_capture($1,'archive','{}','{}')", [capture]);
    await db.query(
      "update ops_inbox set status=case when converted_task_id is null then 'inbox' else 'converted' end where id=$1 and status='archived'",
      [capture],
    );
    const restored = (
      await db.query(
        "select status,converted_task_id,is_test from ops_inbox where id=$1",
        [capture],
      )
    ).rows[0];
    assert.equal(restored.status, "converted");
    assert.equal(restored.converted_task_id, linked);
    assert.equal(restored.is_test, null);
    const rule = (
      await db.query(
        "insert into ops_recurrence(title,starts_at,ends_at,frequency,interval,until_date) values('[QA 테스트] 반복','2026-10-01T00:00:00Z','2026-10-01T01:00:00Z','daily',1,'2026-10-31') returning id",
      )
    ).rows[0].id;
    await db.query(
      "insert into ops_recurrence_runs(rule_id,original_at,title,status) values($1,'2026-10-01T00:00:00Z','[QA 테스트] 미확인','unconfirmed'),($1,'2026-10-02T00:00:00Z','[QA 테스트] 완료','completed')",
      [rule],
    );
    await db.query("update ops_recurrence set archived_at=now() where id=$1", [
      rule,
    ]);
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from ops_recurrence_runs where rule_id=$1",
          [rule],
        )
      ).rows[0].n,
      2,
    );
    await db.query("update ops_recurrence set archived_at=null where id=$1", [
      rule,
    ]);
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from ops_recurrence_runs where rule_id=$1",
          [rule],
        )
      ).rows[0].n,
      2,
    );
    assert.equal(
      (await db.query("select count(*)::int n from tasks")).rows[0].n,
      3,
    );
    await db.exec(
      "set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222'",
    );
    assert.equal(
      (await db.query("select * from ops_inbox where id=$1", [capture])).rows
        .length,
      0,
    );
    assert.equal(
      (
        await db.query(
          "update ops_inbox set status='archived' where id=$1 returning id",
          [capture],
        )
      ).rows.length,
      0,
    );
    await assert.rejects(
      db.query("select ops_timer_guarded('finish',$1,$2,$3,'','{}')", [
        active.task_id,
        randomUUID(),
        protectedSession,
      ]),
      /Expected session required/,
    );
  } finally {
    await db.close();
  }
});
