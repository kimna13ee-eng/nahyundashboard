import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
test("reordering is persistent, owner scoped, and preserves memo contents", async () => {
  const db = new PGlite();
  const owner = "11111111-1111-4111-8111-111111111111",
    other = "22222222-2222-4222-8222-222222222222";
  const ids = [1, 2, 3].map((n) => `33333333-3333-4333-8333-33333333333${n}`);
  const q = async (s, p = []) => (await db.query(s, p)).rows;
  try {
    await db.exec(
      `create schema auth; create role anon; create role authenticated; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth,public to authenticated,anon;`,
    );
    await q("insert into auth.users values($1),($2)", [owner, other]);
    for (const path of [
      "032_shooting_skills.sql",
      "033_shooting_skill_order.sql",
      "033_shooting_skill_order.sql",
    ])
      await db.exec(await readFile("supabase/personal/" + path, "utf8"));
    await db.exec(
      `set role authenticated; set request.jwt.claim.sub='${owner}'`,
    );
    for (const [i, id] of ids.entries())
      await q(
        "insert into ops_shooting_skills(id,title,content) values($1,$2,$3)",
        [id, "메모" + i, "원문\n  그대로"],
      );
    const list = async () =>
      (
        await q(
          "select id from ops_shooting_skills order by sort_order,created_at desc,id desc",
        )
      ).map((x) => x.id);
    assert.deepEqual(await list(), [ids[2], ids[1], ids[0]]);
    await q("select ops_move_shooting_skill($1,$2,false)", [ids[0], ids[2]]);
    assert.deepEqual(await list(), [ids[0], ids[2], ids[1]]);
    await q("select ops_move_shooting_skill($1,$2,true)", [ids[0], ids[1]]);
    assert.deepEqual(await list(), [ids[2], ids[1], ids[0]]);
    assert.ok(
      (await q("select content from ops_shooting_skills")).every(
        (x) => x.content === "원문\n  그대로",
      ),
    );
    await db.exec(`set request.jwt.claim.sub='${other}'`);
    await assert.rejects(
      q("select ops_move_shooting_skill($1,$2,true)", [ids[0], ids[1]]),
      /Memo missing/,
    );
  } finally {
    await db.close();
  }
});
