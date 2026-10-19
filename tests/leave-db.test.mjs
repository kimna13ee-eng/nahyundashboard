import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("SQL015 입사일 설정: 소유자 격리·입력 제약·재적용 보존·비로그인 차단", async () => {
  const db = new PGlite();
  await db.waitReady;
  const owner = "11111111-1111-4111-8111-111111111111";
  const other = "22222222-2222-4222-8222-222222222222";
  try {
    await db.exec(`create schema auth;create role anon;create role authenticated;
      create table auth.users(id uuid primary key);insert into auth.users values('${owner}'),('${other}');
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function public.ops_stamp() returns trigger language plpgsql as $$begin new.updated_at=now();return new;end$$;
      grant usage on schema auth,public to authenticated,anon;`);
    const migration = await readFile("supabase/personal/015_leave_accrual.sql", "utf8");
    await db.exec(migration);
    await db.exec(`set role authenticated;set request.jwt.claim.sub='${owner}'`);
    await db.exec("insert into ops_leave_settings(hire_date,prior_used,prior_used_date) values('2026-08-03',1,'2026-09-25')");
    const before = (await db.query("select * from ops_leave_settings")).rows[0];
    assert.equal(before.owner_id, owner);
    await db.exec("reset role");
    await db.exec(migration);
    assert.deepEqual((await db.query("select * from ops_leave_settings")).rows[0], before);
    assert.equal((await db.query("select relrowsecurity,relforcerowsecurity from pg_class where oid='ops_leave_settings'::regclass")).rows[0].relforcerowsecurity, true);
    await db.exec("set role authenticated");
    for (const statement of [
      "update ops_leave_settings set prior_used=-0.5",
      "update ops_leave_settings set prior_used=0.1",
      "update ops_leave_settings set prior_used=366",
      "update ops_leave_settings set prior_used='NaN'",
      "update ops_leave_settings set prior_used='Infinity'",
      "update ops_leave_settings set prior_used_date='2026-07-01'",
      "update ops_leave_settings set prior_used=0",
      "update ops_leave_settings set hire_date='1899-01-01'",
    ]) await assert.rejects(db.query(statement));
    await db.exec("update ops_leave_settings set prior_used=0.5,prior_used_date=null");
    assert.equal(Number((await db.query("select prior_used from ops_leave_settings")).rows[0].prior_used), 0.5);
    await db.exec(`set request.jwt.claim.sub='${other}'`);
    assert.equal((await db.query("select * from ops_leave_settings")).rows.length, 0);
    assert.equal((await db.query("update ops_leave_settings set prior_used=2 returning owner_id")).rows.length, 0);
    await assert.rejects(db.query("insert into ops_leave_settings(owner_id,hire_date) values($1,'2026-01-01')", [owner]), /row-level security/i);
    await db.exec("insert into ops_leave_settings(hire_date) values('2026-01-01')");
    await db.exec("reset role;set role anon");
    await assert.rejects(db.query("select * from ops_leave_settings"), /permission denied/i);
    await assert.rejects(db.query("insert into ops_leave_settings(hire_date) values('2026-01-01')"), /permission denied/i);
  } finally { await db.close(); }
});
