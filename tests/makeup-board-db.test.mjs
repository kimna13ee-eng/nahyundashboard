import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("private photo bytes and week picks are isolated; photo creation, retry and removal stay consistent", async () => {
  const db = new PGlite();
  const migration = await readFile(
    "supabase/personal/026_makeup_board.sql",
    "utf8",
  );
  const owner = "11111111-1111-4111-8111-111111111111";
  const other = "22222222-2222-4222-8222-222222222222";
  const id = "33333333-3333-4333-8333-333333333333";
  const second = "44444444-4444-4444-8444-444444444444";
  const monday = "2026-11-16",
    next = "2026-11-23";
  const sql = (query, args = []) => db.query(query, args).then((r) => r.rows);
  const become = (user) =>
    db.exec(
      "reset role; set role authenticated; set request.jwt.claim.sub='" +
        user +
        "'",
    );
  const create = (look, week, title = "피치 룩") =>
    sql(
      "select * from ops_create_makeup_look($1,$2,decode('ffd8ff','hex'),null,$3)",
      [look, title, week],
    );
  const list = (week, picked) =>
    sql("select * from ops_list_makeup_looks($1,$2,0)", [week, picked]);
  const pick = (look, week) =>
    sql(
      "insert into ops_makeup_week_picks(look_id,week_start) values($1,$2) on conflict(owner_id,week_start,look_id) do nothing",
      [look, week],
    );
  try {
    await db.exec(
      "create schema auth; create role anon; create role authenticated; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth,public to authenticated,anon",
    );
    await sql("insert into auth.users values($1),($2)", [owner, other]);
    await db.exec(migration);
    await db.exec(migration);
    await become(owner);
    assert.equal((await create(id, monday))[0].picked, true);
    await pick(id, next);
    await pick(id, next);
    assert.deepEqual(
      (await list(next, true)).map((r) => r.id),
      [id],
    );
    await sql(
      "delete from ops_makeup_week_picks where look_id=$1 and week_start=$2",
      [id, monday],
    );
    assert.equal((await create(id, monday))[0].picked, false);
    await assert.rejects(create(id, monday, "다른 사진"), /already used/i);
    await assert.rejects(create(second, "2026-11-18"), /check constraint/i);
    assert.deepEqual(
      (await list(monday, false)).map((r) => r.id),
      [id],
    );
    assert.deepEqual(await list(monday, true), []);
    await become(other);
    assert.deepEqual(await list(next, false), []);
    assert.deepEqual(await sql("select image from ops_makeup_looks"), []);
    await assert.rejects(pick(id, next), /foreign key/i);
    await sql("delete from ops_makeup_looks where id=$1", [id]);
    await create(id, monday, "내 사진");
    await become(owner);
    assert.equal((await list(next, true))[0].title, "피치 룩");
    await sql("delete from ops_makeup_looks where id=$1", [id]);
    assert.deepEqual(await sql("select * from ops_makeup_week_picks"), []);
    await become(other);
    assert.equal((await list(monday, true))[0].title, "내 사진");
    await db.exec("reset role; set role anon");
    await assert.rejects(list(monday, false), /permission denied/i);
    await assert.rejects(
      sql("select image from ops_makeup_looks"),
      /permission denied/i,
    );
  } finally {
    await db.close();
  }
});
