import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";

test("SQL018 일정 분류·영상 링크: 기존 데이터/휴지통/권한 보존, RLS, 재적용 안전", async () => {
  const db = new PGlite({ extensions: { btree_gist } });
  await db.waitReady;
  const owner = "11111111-1111-4111-8111-111111111111";
  const other = "22222222-2222-4222-8222-222222222222";
  try {
    await db.exec(`create schema auth;create schema extensions;create role anon;create role authenticated;
      create table auth.users(id uuid primary key);insert into auth.users values('${owner}'),('${other}');
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth,public to authenticated,anon;`);
    for (const file of ["001_tasks.sql", "002_mvp.sql", "012_schedule_trash.sql"])
      await db.exec(await readFile(`supabase/personal/${file}`, "utf8"));
    await db.exec(`set role authenticated;set request.jwt.claim.sub='${owner}'`);
    const id = (await db.query("insert into ops_schedules(title,notes,starts_at,ends_at) values('기존 일정','메모 유지','2026-10-20T18:00:00+09:00','2026-10-20T18:30:00+09:00') returning id")).rows[0].id;
    const oldRow = (await db.query("select * from ops_schedules where id=$1", [id])).rows[0];
    await db.exec("reset role");
    const rightsQuery = "select column_name,privilege_type from information_schema.column_privileges where table_schema='public' and table_name='ops_schedules' and grantee='authenticated' and column_name not in ('category','video_url') order by column_name,privilege_type";
    const oldRights = (await db.query(rightsQuery)).rows;
    const security = (await db.query("select relrowsecurity,relforcerowsecurity from pg_class where oid='ops_schedules'::regclass")).rows[0];
    const functionsQuery = "select proname,pg_get_functiondef(oid) definition from pg_proc where proname in ('ops_schedule_soft_delete','ops_schedule_restore','ops_purge_expired_schedules') order by proname";
    const functions = (await db.query(functionsQuery)).rows;
    const migration = await readFile("supabase/personal/018_schedule_categories.sql", "utf8");
    await db.exec(migration);
    await db.exec(migration);
    assert.deepEqual((await db.query(rightsQuery)).rows, oldRights);
    assert.deepEqual((await db.query(functionsQuery)).rows, functions);
    assert.deepEqual((await db.query("select relrowsecurity,relforcerowsecurity from pg_class where oid='ops_schedules'::regclass")).rows[0], security);
    assert.deepEqual((await db.query("select * from ops_schedules where id=$1", [id])).rows[0], { ...oldRow, category: "other", video_url: "" });
    await db.exec("set role authenticated");
    const url = `https://영상.example/운동/${"가".repeat(1900)}`;
    await db.query("update ops_schedules set category='exercise',video_url=$2 where id=$1", [id, url]);
    await db.query("update ops_schedules set category='work' where id=$1", [id]);
    assert.equal((await db.query("select video_url from ops_schedules where id=$1", [id])).rows[0].video_url, url);
    for (const category of ["", "meeting", null])
      await assert.rejects(db.query("update ops_schedules set category=$2 where id=$1", [id, category]));
    for (const video of [null, "https://example.com/" + "a".repeat(2000), "http://example.com/video", "javascript:alert(1)", "https://user:pass@example.com/video", "https://example.com/a b"])
      await assert.rejects(db.query("update ops_schedules set video_url=$2 where id=$1", [id, video]));
    for (const column of ["id", "owner_id", "created_at", "updated_at", "deleted_at", "purge_after"])
      await assert.rejects(db.query(`update ops_schedules set ${column}=${column} where id=$1`, [id]), /permission denied/i);
    await assert.rejects(db.query("delete from ops_schedules where id=$1", [id]), /permission denied/i);
    assert.equal((await db.query("select ops_schedule_soft_delete($1) status", [id])).rows[0].status, "deleted");
    const trashed = (await db.query("select * from ops_schedules where id=$1", [id])).rows[0];
    assert.equal(Date.parse(trashed.purge_after) - Date.parse(trashed.deleted_at), 12 * 3600000);
    assert.equal(trashed.video_url, url);
    assert.equal((await db.query("select ops_schedule_restore($1) status", [id])).rows[0].status, "restored");
    assert.equal((await db.query("select category,video_url from ops_schedules where id=$1", [id])).rows[0].video_url, url);
    await db.exec(`set request.jwt.claim.sub='${other}'`);
    assert.equal((await db.query("select * from ops_schedules where id=$1", [id])).rows.length, 0);
    assert.equal((await db.query("update ops_schedules set category='other' where id=$1 returning id", [id])).rows.length, 0);
    await assert.rejects(db.query("insert into ops_schedules(owner_id,title,starts_at,ends_at,category) values($1,'타인','2026-10-20T18:00:00Z','2026-10-20T19:00:00Z','work')", [owner]), /row-level security/i);
    await db.exec("reset role");
    await db.exec(migration);
    assert.equal((await db.query("select category,video_url from ops_schedules where id=$1", [id])).rows[0].video_url, url);
    await db.exec("set role anon");
    await assert.rejects(db.query("select category,video_url from ops_schedules"), /permission denied/i);
  } finally { await db.close(); }
});
