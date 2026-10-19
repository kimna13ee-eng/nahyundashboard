import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";

test("SQL014: 분류·단계 검증, 소유권 격리, 기존 업무·메모·타이머 보존", async () => {
  const db = new PGlite({ extensions: { btree_gist } });
  await db.waitReady;
  const owner = "11111111-1111-4111-8111-111111111111";
  const other = "22222222-2222-4222-8222-222222222222";
  try {
    await db.exec(`
      create schema auth;create schema extensions;create role anon;create role authenticated;
      create table auth.users(id uuid primary key);
      insert into auth.users values('${owner}'),('${other}');
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth,public to authenticated,anon;
    `);
    for (const file of [
      "001_tasks.sql", "002_mvp.sql", "003_phase2.sql", "004_calendar_recurrence.sql",
      "005_task_classification.sql", "006_personal_content.sql", "007_workflow.sql",
      "008_content_history.sql", "009_prompt_metadata.sql", "010_stabilization.sql",
    ]) await db.exec(await readFile(`supabase/personal/${file}`, "utf8"));
    await db.exec(`set role authenticated;set request.jwt.claim.sub='${owner}';`);
    const legacy = (await db.query(`
      insert into tasks(title,notes,tool,assignee,estimated_minutes,contact_status,work_kind,result_url)
      values('기존 업무','기존 메모','Codex','담당자',40,'waiting','planned','https://example.com/result') returning id
    `)).rows[0].id;
    await db.query("insert into ops_task_notes(task_id,body,kind) values($1,'미완료 액션 보존','next_action')", [legacy]);
    const session = (await db.query("select ops_timer_guarded('start',$1,$2,null,'','{}') id", [legacy, randomUUID()])).rows[0].id;
    const oldTask = (await db.query("select * from tasks where id=$1", [legacy])).rows[0];
    const oldSession = (await db.query("select * from ops_work_sessions where id=$1", [session])).rows[0];
    const oldIntervals = (await db.query("select * from ops_session_intervals where session_id=$1", [session])).rows;
    const migration = await readFile("supabase/personal/014_task_process.sql", "utf8");
    await db.exec("reset role");
    await db.exec(migration);
    await db.exec(migration);
    await db.exec("set role authenticated");
    const migrated = (await db.query("select * from tasks where id=$1", [legacy])).rows[0];
    assert.deepEqual(migrated, { ...oldTask, task_category: "other", process_steps: [] });
    assert.deepEqual((await db.query("select * from ops_work_sessions where id=$1", [session])).rows[0], oldSession);
    assert.deepEqual((await db.query("select * from ops_session_intervals where session_id=$1", [session])).rows, oldIntervals);

    const steps = [{ id: "brief", title: "자료 정리", done: true }, { id: "draft", title: "초안 작성", done: false }];
    await db.query("update tasks set task_category='content',process_steps=$2 where id=$1", [legacy, JSON.stringify(steps)]);
    await db.exec("reset role");
    await db.exec(migration); // Reapplication preserves nonempty progress and the active timer.
    await db.exec("set role authenticated");
    assert.deepEqual((await db.query("select task_category,process_steps from tasks where id=$1", [legacy])).rows[0], { task_category: "content", process_steps: steps });
    for (const category of ["content", "sales", "design", "other"]) {
      const row = (await db.query("insert into tasks(title,task_category,process_steps) values('분류 검증',$1,$2) returning task_category,process_steps", [category, JSON.stringify(steps)])).rows[0];
      assert.equal(row.task_category, category);
      assert.deepEqual(row.process_steps, steps);
    }
    await assert.rejects(db.query("update tasks set task_category='unknown' where id=$1", [legacy]), /check constraint/i);
    await assert.rejects(db.query("update tasks set task_category=null where id=$1", [legacy]), /not-null/i);
    const invalid = [
      null, {}, "steps", [null], [true], [{ id: "a", title: "제목" }],
      [{ id: "a", title: "제목", done: false, extra: true }],
      [{ id: 1, title: "제목", done: false }], [{ id: "", title: "제목", done: false }],
      [{ id: "x".repeat(81), title: "제목", done: false }],
      [{ id: "a", title: null, done: false }], [{ id: "a", title: " ", done: false }],
      [{ id: "a", title: " 앞 공백", done: false }], [{ id: "a", title: "제목".repeat(61), done: false }],
      [{ id: "a", title: "제목", done: "false" }], [{ id: "a", title: "제목", done: null }],
      [{ id: "a", title: "하나", done: true }, { id: "a", title: "중복", done: false }],
      Array.from({ length: 31 }, (_, i) => ({ id: `${i}`, title: "단계", done: false })),
    ];
    for (const value of invalid) await assert.rejects(
      db.query("update tasks set process_steps=$2 where id=$1", [legacy, JSON.stringify(value)]),
      /check constraint/i,
      `invalid process_steps accepted: ${JSON.stringify(value)}`,
    );
    await assert.rejects(db.query("update tasks set process_steps=null where id=$1", [legacy]), /not-null/i);
    const fullSteps = Array.from({ length: 30 }, (_, i) => ({ id: `${i}`, title: "단계", done: false }));
    await db.query("update tasks set process_steps=$2 where id=$1", [legacy, JSON.stringify(fullSteps)]);
    // Updating checklist progress must not alter active session state or delete old context data.
    await db.query("update tasks set process_steps=$2 where id=$1", [legacy, JSON.stringify(steps)]);
    assert.deepEqual((await db.query("select * from ops_work_sessions where id=$1", [session])).rows[0], oldSession);
    assert.equal((await db.query("select body from ops_task_notes where task_id=$1", [legacy])).rows[0].body, "미완료 액션 보존");
    await db.query("select ops_timer_guarded('pause',$1,$2,$3,'','{}')", [legacy, randomUUID(), session]);
    await db.query("select ops_timer_guarded('start',$1,$2,null,'','{}')", [legacy, randomUUID()]);
    await db.query("select ops_timer_guarded('finish',$1,$2,$3,'기존 타이머 정상 종료','{}')", [legacy, randomUUID(), session]);
    assert.equal((await db.query("select status from ops_work_sessions where id=$1", [session])).rows[0].status, "ENDED");
    assert.equal((await db.query("select summary from ops_work_journal where session_id=$1", [session])).rows[0].summary, "기존 타이머 정상 종료");
    assert.deepEqual((await db.query("select process_steps from tasks where id=$1", [legacy])).rows[0].process_steps, steps);

    await db.exec(`set request.jwt.claim.sub='${other}'`);
    assert.equal((await db.query("select task_category,process_steps from tasks where id=$1", [legacy])).rows.length, 0);
    assert.equal((await db.query("update tasks set task_category='design',process_steps='[]' where id=$1 returning id", [legacy])).rows.length, 0);
    await assert.rejects(db.query("insert into tasks(owner_id,title,task_category,process_steps) values($1,'타인 쓰기','sales','[]')", [owner]), /row-level security/i);
    // Column-restricted installations receive only the new column privileges.
    await db.exec("reset role;revoke select,insert,update on tasks from authenticated;grant select(id),insert(title) on tasks to authenticated");
    await db.exec(migration);
    await db.exec("set role authenticated");
    const own = (await db.query("insert into tasks(title,task_category,process_steps) values('제한된 컬럼','sales',$1) returning id,task_category,process_steps", [JSON.stringify(steps)])).rows[0];
    assert.equal(own.task_category, "sales");
    assert.deepEqual(own.process_steps, steps);
    assert.equal((await db.query("update tasks set task_category='design',process_steps='[]' where id=$1 returning task_category", [own.id])).rows[0].task_category, "design");
    await assert.rejects(db.query("select notes from tasks"), /permission denied/i);
    await assert.rejects(db.query("update tasks set notes='권한 확대 금지' where id=$1", [own.id]), /permission denied/i);
    await db.exec("reset role;set role anon");
    await assert.rejects(db.query("select task_category,process_steps from tasks"), /permission denied/i);
    await assert.rejects(db.query("insert into tasks(title,task_category,process_steps) values('비로그인','other','[]')"), /permission denied/i);
  } finally {
    await db.close();
  }
});
