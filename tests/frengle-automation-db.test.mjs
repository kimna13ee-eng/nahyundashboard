import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('FRENGLE membership, owner isolation, source separation and immutable receipts', async()=>{
 const db=new PGlite(); await db.waitReady;
 const owner='11111111-1111-4111-8111-111111111111', other='22222222-2222-4222-8222-222222222222';
 try {
  await db.exec(`create schema auth; create role authenticated; create role anon;
   create table auth.users(id uuid primary key); insert into auth.users values('${owner}'),('${other}');
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth,public to authenticated,anon;`);
  await db.exec(await readFile('supabase/frengle/001_automation_results.sql','utf8'));
  const insert=(source,key)=>db.query(`insert into ops_automation_results(source,run_key,title,body,source_url,reported_at) values($1,$2,'회사 결과','내용','https://chatgpt.com/c/example',now()) returning id`,[source,key]);
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${owner}';`);
  await assert.rejects(insert('frengle_keywords','blocked'),/row-level security/i);
  await assert.rejects(db.query('insert into ops_company_members(user_id) values($1)',[owner]),/permission denied/i);
  await db.exec(`reset role; insert into ops_company_members(user_id) values('${owner}'); set role authenticated;`);
  await insert('frengle_keywords','run1');
  await insert('frengle_site_recommendations','run1');
  await assert.rejects(insert('frengle_work_check','work1'),/check constraint/i);
  await db.exec('reset role;');
  await db.exec(await readFile('supabase/frengle/002_work_check_results.sql','utf8'));
  await db.exec('set role authenticated;');
  await insert('frengle_work_check','work1');
  assert.equal((await db.query('select count(*)::int n from ops_automation_results')).rows[0].n,3);
  await assert.rejects(insert('metricool_personal','run2'),/check constraint/i);
  await assert.rejects(insert('frengle_keywords','run1'),/duplicate|unique/i);
  await assert.rejects(db.query("update ops_automation_results set body='changed'"),/permission denied/i);
  await assert.rejects(db.query('delete from ops_automation_results'),/permission denied/i);
  await db.exec(`set request.jwt.claim.sub='${other}';`);
  assert.equal((await db.query('select count(*)::int n from ops_automation_results')).rows[0].n,0);
  await assert.rejects(insert('frengle_keywords','other'),/row-level security/i);
  await db.exec(`reset role; delete from ops_company_members; set role authenticated; set request.jwt.claim.sub='${owner}';`);
  assert.equal((await db.query('select count(*)::int n from ops_automation_results')).rows[0].n,0);
  await assert.rejects(insert('frengle_keywords','revoked'),/row-level security/i);
  await db.exec('reset role; set role anon;');
  await assert.rejects(db.query('select * from ops_automation_results'),/permission denied/i);
 } finally {await db.close();}
});
