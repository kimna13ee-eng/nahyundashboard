import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
test("saved period yoga is private, validates duration and protects concurrent edits", async () => {
  const db = new PGlite();
  const owner = "11111111-1111-4111-8111-111111111111",
    other = "22222222-2222-4222-8222-222222222222",
    id = "33333333-3333-4333-8333-333333333333";
  const q = async (sql, params = []) => (await db.query(sql, params)).rows;
  try {
    await db.exec(
      `create schema auth; create role anon; create role authenticated; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth,public to authenticated,anon;`,
    );
    await q("insert into auth.users values($1),($2)", [owner, other]);
    const ddl = await readFile("supabase/personal/034_period_yoga.sql", "utf8");
    await db.exec(ddl);
    await db.exec(ddl);
    await db.exec(
      `set role authenticated;set request.jwt.claim.sub='${owner}'`,
    );
    const [created] = await q(
      "insert into ops_period_yoga(id,title,video_url,duration_minutes,notes) values($1,$2,$3,$4,$5) returning updated_at::text as stamp",
      [id, "내 요가", "https://youtu.be/example", 12, "매트 준비\n쿠션"],
    );
    await assert.rejects(
      q("update ops_period_yoga set duration_minutes=0 where id=$1", [id]),
      /check constraint/,
    );
    await db.exec(`set request.jwt.claim.sub='${other}'`);
    assert.deepEqual(await q("select * from ops_period_yoga"), []);
    assert.deepEqual(
      await q("delete from ops_period_yoga where id=$1 returning id", [id]),
      [],
    );
    await db.exec(`set request.jwt.claim.sub='${owner}'`);
    const [changed] = await q(
      "update ops_period_yoga set duration_minutes=15 where id=$1 and updated_at=$2 returning updated_at::text as stamp",
      [id, created.stamp],
    );
    assert.notEqual(changed.stamp, created.stamp);
    assert.deepEqual(
      await q(
        "update ops_period_yoga set title=$1 where id=$2 and updated_at=$3 returning id",
        ["오래된 수정", id, created.stamp],
      ),
      [],
    );
    assert.equal(
      (await q("select notes from ops_period_yoga"))[0].notes,
      "매트 준비\n쿠션",
    );
  } finally {
    await db.close();
  }
});
