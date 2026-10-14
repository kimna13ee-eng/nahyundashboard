import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";
test("자동화 결과 RLS·수신시각·재시도 중복·기존 결과 보존",async()=>{
 const db=new PGlite();await db.waitReady;
 const owner="11111111-1111-4111-8111-111111111111",other="22222222-2222-4222-8222-222222222222";
 try{
  await db.exec(`create schema auth;create role authenticated;create role anon;
    create table auth.users(id uuid primary key);insert into auth.users values('${owner}'),('${other}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth,public to authenticated,anon;`);
  await db.exec(await readFile("supabase/personal/013_automation_results.sql","utf8"));
  await db.exec(`set role authenticated;set request.jwt.claim.sub='${owner}';`);
  const sql="insert into ops_automation_results(source,run_key,title,body,source_url,reported_at) values('metricool_personal','run1','개인 결과','원본','https://chatgpt.com/c/example','2026-10-14T00:00Z') returning *";
  const row=(await db.query(sql)).rows[0];assert.equal(row.owner_id,owner);assert.ok(row.received_at);
  await assert.rejects(db.query(sql),/unique|duplicate/i);
  await assert.rejects(db.query("update ops_automation_results set body='덮어쓰기'"),/permission denied/i);
  await assert.rejects(db.query("delete from ops_automation_results"),/permission denied/i);
  await assert.rejects(db.query("insert into ops_automation_results(source,run_key,title,body,source_url,reported_at) values('frengle_keywords','run2','회사','원본','https://chatgpt.com/c/example',now())"),/check constraint/i);
  await db.exec(`set request.jwt.claim.sub='${other}';`);
  assert.equal((await db.query("select count(*)::int n from ops_automation_results")).rows[0].n,0);
  await assert.rejects(db.query("insert into ops_automation_results(owner_id,source,run_key,title,body,source_url,reported_at) values($1,'metricool_personal','run3','타인','원본','https://chatgpt.com/c/example',now())",[owner]),/row-level security/i);
  await db.exec("reset role;set role anon;");
  await assert.rejects(db.query("select * from ops_automation_results"),/permission denied/i);
 }finally{await db.close();}
});
