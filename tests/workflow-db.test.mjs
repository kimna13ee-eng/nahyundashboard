import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
test("007 Inbox·중단 스냅샷·후속·반복 원장 격리 검증", async () => {
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
    ])
      await db.exec(await readFile(`supabase/personal/${f}`, "utf8"));
    await db.exec(
      "set role authenticated;set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111'",
    );
    const a = (
      await db.query(
        "insert into tasks(title,tool,result_url) values('[QA] 기존','Codex','https://example.com') returning id",
      )
    ).rows[0].id;
    await db.query(
      "insert into ops_task_notes(task_id,body,kind) values($1,'중단 전 메모','general'),($1,'미완료 다음 액션','next_action')",
      [a],
    );
    const session = (
      await db.query("select ops_timer('start',$1,gen_random_uuid(),'') id", [
        a,
      ])
    ).rows[0].id;
    const capture = "33333333-3333-4333-8333-333333333333";
    await db.query("select ops_capture($1,'inbox',$2,'{}')", [
      capture,
      JSON.stringify({ title: "[QA] 돌발 아이디어" }),
    ]);
    assert.equal(
      (
        await db.query("select status from ops_work_sessions where id=$1", [
          session,
        ])
      ).rows[0].status,
      "ACTIVE",
    );
    const converted = (
      await db.query("select ops_capture($1,'now','{}',$2) id", [
        capture,
        JSON.stringify({
          last_stage: "검수",
          next_action: "수정",
          last_file: "work/a.ts",
          reason: "돌발",
        }),
      ])
    ).rows[0].id;
    assert.equal(
      (await db.query("select ops_capture($1,'now','{}','{}') id", [capture]))
        .rows[0].id,
      converted,
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from ops_work_sessions where status='ACTIVE'",
        )
      ).rows[0].n,
      1,
    );
    const payload = (
      await db.query(
        "select payload from ops_parked_context where session_id=$1",
        [session],
      )
    ).rows[0].payload;
    assert.ok(["중단 전 메모", "미완료 다음 액션"].includes(payload.last_note));
    assert.equal(payload.reason, "돌발");
    assert.equal(payload.next_actions.length, 1);
    await db.query(
      "update ops_task_notes set body='나중 메모' where task_id=$1",
      [a],
    );
    assert.equal(
      (
        await db.query(
          "select payload from ops_parked_context where session_id=$1",
          [session],
        )
      ).rows[0].payload.reason,
      "돌발",
    );
    await db.query(
      "select ops_timer('finish',$1,gen_random_uuid(),'돌발 종료')",
      [converted],
    );
    await db.query("select ops_timer('start',$1,gen_random_uuid(),'')", [a]);
    await db.query(
      "select ops_timer('finish',$1,gen_random_uuid(),'기존 종료')",
      [a],
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from ops_session_intervals a join ops_session_intervals b on a.id<b.id and a.owner_id=b.owner_id and tstzrange(a.starts_at,a.ends_at,'[)') && tstzrange(b.starts_at,b.ends_at,'[)')",
        )
      ).rows[0].n,
      0,
    );
    const scheduled = "44444444-4444-4444-8444-444444444444";
    await db.query("select ops_capture($1,'schedule',$2,'{}')", [
      scheduled,
      JSON.stringify({
        title: "[QA] 예약",
        schedule_at: "2026-10-12T09:00:00+09:00",
      }),
    ]);
    await db.query("select ops_capture($1,'schedule',$2,'{}')", [
      scheduled,
      JSON.stringify({
        title: "[QA] 예약",
        schedule_at: "2026-10-12T09:00:00+09:00",
      }),
    ]);
    assert.equal(
      (await db.query("select count(*)::int n from ops_schedules")).rows[0].n,
      1,
    );
    await db.query(
      "update tasks set contact_status='waiting',follow_up_at='2026-10-13T09:00:00+09:00' where id=$1",
      [a],
    );
    assert.equal(
      (await db.query("select contact_status from tasks where id=$1", [a]))
        .rows[0].contact_status,
      "waiting",
    );
    const rule = (
      await db.query(
        "insert into ops_recurrence(title,starts_at,ends_at,frequency,interval,until_date) values('[QA] 매일','2026-10-01T00:00:00Z','2026-10-01T01:00:00Z','daily',1,'2026-10-31') returning id",
      )
    ).rows[0].id;
    await db.query(
      "insert into ops_recurrence_runs(rule_id,original_at,title,status) values($1,'2026-10-01T00:00:00Z','[QA] 회차1','unconfirmed'),($1,'2026-10-02T00:00:00Z','[QA] 회차2','scheduled')",
      [rule],
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from ops_recurrence_runs where status='unconfirmed'",
        )
      ).rows[0].n,
      1,
    );
    await db.query(
      "update ops_recurrence_runs set status='completed',confirmed_at=now() where rule_id=$1 and status='unconfirmed'",
      [rule],
    );
    await assert.rejects(
      db.query("delete from ops_recurrence where id=$1", [rule]),
    );
    await db.exec(
      "set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222'",
    );
    for (const table of [
      "ops_inbox",
      "ops_parked_context",
      "ops_recurrence_runs",
    ])
      assert.equal((await db.query(`select * from ${table}`)).rows.length, 0);
    await assert.rejects(
      db.query("select ops_capture($1,'task',$2,'{}')", [
        capture,
        JSON.stringify({ title: "타인" }),
      ]),
    );
  } finally {
    await db.close();
  }
});
