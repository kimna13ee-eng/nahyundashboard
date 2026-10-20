import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";

test("FRENGLE core: member+owner isolation, guarded timers, workflow, trash, versions and preserved receipts", async () => {
  const db = new PGlite({ extensions: { btree_gist } });
  await db.waitReady;
  const owner = "11111111-1111-4111-8111-111111111111";
  const other = "22222222-2222-4222-8222-222222222222";
  const outsider = "33333333-3333-4333-8333-333333333333";
  const tables = ["tasks", "ops_projects", "ops_task_notes", "ops_note_versions", "ops_schedules", "ops_work_sessions", "ops_session_intervals", "ops_session_events", "ops_work_journal", "ops_library_items", "ops_prompt_versions", "ops_recurrence", "ops_recurrence_exceptions", "ops_inbox", "ops_parked_context", "ops_recurrence_runs"];
  const become = async (id) => { await db.exec(`reset role;set role authenticated;set request.jwt.claim.sub='${id}'`); };
  const one = async (sql, values = []) => (await db.query(sql, values)).rows[0];
  try {
    await db.exec(`create schema auth;create schema extensions;create role anon;create role authenticated;
      create table auth.users(id uuid primary key);insert into auth.users values('${owner}'),('${other}'),('${outsider}');
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth,public to authenticated,anon;`);
    for (const file of ["001_automation_results.sql", "002_work_check_results.sql"])
      await db.exec(await readFile(`supabase/frengle/${file}`, "utf8"));
    await db.query("insert into ops_company_members(user_id) values($1),($2)", [owner, other]);
    await become(owner);
    const receipt = await one("insert into ops_automation_results(source,run_key,title,body,source_url,reported_at) values('frengle_work_check','preserved-before-core','회사 결과','기존 원문','https://chatgpt.com/c/fixture',now()) returning *");
    await db.exec("reset role");
    const migration = await readFile("supabase/frengle/003_core_workspace.sql", "utf8");
    await db.exec(migration);
    assert.deepEqual((await db.query("select * from ops_automation_results")).rows, [receipt]);
    assert.equal((await db.query("select * from ops_company_members")).rows.length, 2);
    for (const table of tables) {
      assert.deepEqual(await one("select relrowsecurity,relforcerowsecurity from pg_class where oid=$1::regclass", [table]), { relrowsecurity: true, relforcerowsecurity: true });
    }
    assert.equal((await one("select count(*)::int n from pg_proc join pg_namespace n on n.oid=pronamespace where n.nspname='public' and prosecdef")).n, 0);
    for (const table of ["ops_content", "ops_inspiration", "ops_leave_entries", "ops_leave_settings", "ops_personal_sheet_sources", "ops_push_subscriptions"])
      assert.equal((await one("select to_regclass($1) name", [`public.${table}`])).name, null);
    assert.equal((await one("select to_regprocedure('public.ops_timer(text,uuid,uuid,text)') name")).name, null);

    await become(owner);
    const project = (await one("insert into ops_projects(title) values('회사 프로젝트') returning id")).id;
    const steps = [{ id: "brief", title: "자료 정리", done: true }, { id: "draft", title: "초안", done: false }];
    const task = (await one("insert into tasks(title,project_id,task_category,process_steps) values('회사 업무',$1,'content',$2) returning id", [project, JSON.stringify(steps)])).id;
    const second = (await one("insert into tasks(title) values('다음 업무') returning id")).id;
    const note = (await one("insert into ops_task_notes(task_id,body,kind) values($1,'연결할 다음 액션','next_action') returning id", [task])).id;
    const converted = (await one("select ops_note_to_task($1) id", [note])).id;
    assert.equal((await one("select ops_note_to_task($1) id", [note])).id, converted);
    assert.equal((await one("select count(*)::int n from ops_note_versions where note_id=$1", [note])).n, 2);
    const item = (await one("insert into ops_library_items(title,kind,category,body,project_id,tool) values('회사 프롬프트','prompt','운영','기존 원문',$1,'도구') returning id", [project])).id;
    await db.query("update ops_library_items set body='수정 원문',change_reason='수정 이유' where id=$1", [item]);
    assert.equal((await one("select count(*)::int n from ops_prompt_versions where item_id=$1", [item])).n, 2);
    await assert.rejects(db.query("update ops_prompt_versions set body='이력 변조'"), /permission denied/);
    await assert.rejects(db.query("update tasks set process_steps='[{}]' where id=$1", [task]), /check constraint/);
    await db.query("update tasks set status='completed' where id=$1", [task]);
    const completed = (await one("select completed_at from tasks where id=$1", [task])).completed_at;
    await db.query("update tasks set title='완료 후 수정',completed_at='2000-01-01' where id=$1", [task]);
    assert.equal((await one("select completed_at from tasks where id=$1", [task])).completed_at.getTime(), completed.getTime());
    await db.query("update tasks set status='pending' where id=$1", [task]);
    assert.equal((await one("select completed_at from tasks where id=$1", [task])).completed_at, null);

    const timer = async (command, taskId, request, expected, context = {}) => (await one("select ops_timer_guarded($1,$2,$3,$4,'',$5) id", [command, taskId, request, expected, JSON.stringify(context)])).id;
    const firstRequest = randomUUID();
    const firstSession = await timer("start", task, firstRequest, null);
    assert.equal(await timer("start", task, firstRequest, null), firstSession);
    const secondSession = await timer("start", second, randomUUID(), null, { last_stage: "검수", reason: "전환" });
    assert.equal((await one("select count(*)::int n from ops_work_sessions where status='ACTIVE'")).n, 1);
    assert.equal((await one("select count(*)::int n from ops_session_intervals where ends_at is null")).n, 1);
    assert.equal((await one("select payload from ops_parked_context where session_id=$1", [firstSession])).payload.last_stage, "검수");
    await assert.rejects(timer("finish", task, randomUUID(), firstSession), /Active session changed/);
    assert.equal((await one("select status from ops_work_sessions where id=$1", [secondSession])).status, "ACTIVE");
    const endRequest = randomUUID();
    await timer("finish", second, endRequest, secondSession);
    await timer("finish", second, endRequest, secondSession);
    assert.equal((await one("select count(*)::int n from ops_work_journal where session_id=$1", [secondSession])).n, 1);
    const captureId = randomUUID();
    const captured = (await one("select ops_capture($1,'now',$2,'{}') id", [captureId, JSON.stringify({ title: "회사 Inbox 변환", notes: "회사 맥락" })])).id;
    assert.equal((await one("select ops_capture($1,'now','{}','{}') id", [captureId])).id, captured);
    assert.equal((await one("select count(*)::int n from ops_work_sessions where status='ACTIVE'")).n, 1);

    const recurrence = (await one("insert into ops_recurrence(title,starts_at,ends_at,frequency,interval,until_date) values('회사 월간','2026-01-31T09:00:00+09:00','2026-01-31T10:00:00+09:00','monthly',1,'2026-12-31') returning id")).id;
    assert.equal((await one("select ops_recurrence_at('2026-01-31T09:00:00+09:00','monthly',1,1) at", [])).at.toISOString(), "2026-02-28T00:00:00.000Z");
    await db.query("select ops_recurrence_change($1,'2026-02-28T09:00:00+09:00','one','{}',true)", [recurrence]);
    assert.equal((await one("select count(*)::int n from ops_recurrence_exceptions where rule_id=$1", [recurrence])).n, 1);
    await db.query("insert into ops_recurrence_runs(rule_id,original_at,title,status) values($1,'2026-01-31T09:00:00+09:00','완료 회차','completed')", [recurrence]);
    await db.query("update ops_recurrence set archived_at=now() where id=$1", [recurrence]);
    assert.equal((await one("select count(*)::int n from ops_recurrence_runs where rule_id=$1", [recurrence])).n, 1);

    const schedule = (await one("insert into ops_schedules(title,starts_at,ends_at) values('회사 일정',now(),now()+interval '1 hour') returning id")).id;
    assert.equal((await one("select ops_schedule_soft_delete($1) state", [schedule])).state, "deleted");
    const deadline = await one("select deleted_at,purge_after from ops_schedules where id=$1", [schedule]);
    assert.equal(deadline.purge_after - deadline.deleted_at, 12 * 3600000);
    await db.query("update ops_schedules set deleted_at='2099-01-01',purge_after='2099-01-01T12:00:00Z' where id=$1", [schedule]);
    assert.deepEqual(await one("select deleted_at,purge_after from ops_schedules where id=$1", [schedule]), deadline);
    await assert.rejects(db.query("delete from ops_schedules where id=$1", [schedule]), /permission denied/);
    assert.equal((await one("select ops_schedule_restore($1) state", [schedule])).state, "restored");
    await db.exec("reset role;alter table ops_schedules disable trigger company_schedule_trash_stamp");
    await db.query("update ops_schedules set deleted_at=now()-interval '13 hours',purge_after=now()-interval '1 hour' where id=$1", [schedule]);
    await db.exec("alter table ops_schedules enable trigger company_schedule_trash_stamp");
    await become(owner);
    assert.equal((await one("select ops_schedule_restore($1) state", [schedule])).state, "expired");
    await assert.rejects(db.query("update ops_schedules set deleted_at=null,purge_after=null where id=$1", [schedule]), /expired/);

    await become(other);
    for (const table of tables) assert.equal((await db.query(`select * from ${table}`)).rows.length, 0);
    assert.equal((await one("select ops_schedule_soft_delete($1) state", [schedule])).state, "not_found");
    await assert.rejects(db.query("insert into tasks(title,project_id) values('교차 FK',$1)", [project]), /foreign key/);
    await assert.rejects(db.query("insert into tasks(owner_id,title) values($1,'소유권 위조')", [owner]), /row-level security/);
    await become(outsider);
    for (const table of tables) assert.equal((await db.query(`select * from ${table}`)).rows.length, 0);
    await assert.rejects(db.query("insert into tasks(title) values('비회원 쓰기')"), /row-level security/);
    await assert.rejects(db.query("select ops_timer_guard_ready()"), /Company membership/);
    await assert.rejects(db.query("select ops_capture($1,'inbox',$2,'{}')", [randomUUID(), JSON.stringify({ title: "비회원" })]), /Company membership/);
    await db.exec("reset role;set role anon");
    for (const table of tables) await assert.rejects(db.query(`select * from ${table}`), /permission denied/);
    await db.exec("reset role");
    await db.exec(migration);
    assert.deepEqual((await db.query("select * from ops_automation_results")).rows, [receipt]);
    assert.equal((await db.query("select * from tasks")).rows.length, 4);
    await db.query("delete from ops_company_members where user_id=$1", [owner]);
    await become(owner);
    for (const table of tables) assert.equal((await db.query(`select * from ${table}`)).rows.length, 0);
    await assert.rejects(db.query("select ops_note_to_task($1)", [note]), /Company membership/);
  } finally {
    await db.close();
  }
});
