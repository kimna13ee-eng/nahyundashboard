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
  const categoryMigration = await readFile(
    "supabase/personal/027_makeup_look_category.sql",
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
    await db.exec("reset role");
    await db.exec(categoryMigration);
    await db.exec(categoryMigration);
    await db.exec(
      await readFile(
        "supabase/personal/030_makeup_delete_selected.sql",
        "utf8",
      ),
    );
    await become(owner);
    const filtered = (category, picked = false, offset = 0) =>
      sql("select * from ops_list_makeup_looks($1,$2,$3,$4)", [
        next,
        picked,
        offset,
        category,
      ]);
    const classified = (category) =>
      sql(
        "select * from ops_create_makeup_look($1,'스모키',decode('ffd8ff','hex'),null,$2,$3)",
        [second, next, category],
      );
    const changeCategory = (look, category) =>
      sql(
        "update ops_makeup_looks set category=$2 where id=$1 returning id, category",
        [look, category],
      );
    assert.equal((await filtered("unclassified", true))[0].id, id);
    assert.equal((await filtered(null))[0].category, null);
    await assert.rejects(classified("invalid"), /check constraint/i);
    assert.equal((await classified("male"))[0].category, "male");
    await changeCategory(second, "female");
    assert.equal((await classified("male"))[0].category, "female");
    assert.deepEqual(
      (await filtered("female", true)).map((r) => r.id),
      [second],
    );
    assert.deepEqual(await filtered("male", true), []);
    await changeCategory(id, "male");
    // A look on a later unfiltered page must appear on page one for its category.
    await sql(
      "insert into ops_makeup_looks(id,title,image,category) select gen_random_uuid(),'룩',decode('ff','hex'),'female' from generate_series(1,42)",
    );
    assert.equal((await filtered("female")).length, 41);
    assert.equal((await filtered("female", false, 40)).length, 3);
    assert.deepEqual(
      (await filtered("male")).map((r) => r.id),
      [id],
    );
    await changeCategory(id, null);
    assert.equal((await filtered("unclassified", true))[0].id, id);
    await become(other);
    assert.deepEqual(await filtered("unclassified"), []);
    assert.deepEqual(await changeCategory(id, "female"), []);
    await become(owner);
    assert.equal((await filtered("unclassified", true))[0].id, id);
    await sql("delete from ops_makeup_looks where id <> $1", [id]);
    await become(other);
    assert.deepEqual(await list(next, false), []);
    assert.deepEqual(await sql("select image from ops_makeup_looks"), []);
    await assert.rejects(pick(id, next), /foreign key/i);
    await sql("delete from ops_makeup_looks where id=$1", [id]);
    await create(id, monday, "내 사진");
    await become(owner);
    assert.equal((await list(next, true))[0].title, "피치 룩");
    await create(second, next, "두 번째 룩");
    const kept = "55555555-5555-4555-8555-555555555555";
    await create(kept, null, "남길 사진");
    const removeSelected = () =>
      sql("select ops_delete_selected_makeup_looks($1) as count", [
        [id, second, id],
      ]);
    assert.deepEqual(await removeSelected(), [{ count: 2 }]);
    assert.deepEqual(await removeSelected(), [{ count: 0 }]);
    assert.deepEqual(await sql("select * from ops_makeup_week_picks"), []);
    assert.deepEqual(
      (await list(monday, false)).map((row) => row.id),
      [kept],
    );
    await become(other);
    assert.equal((await list(monday, true))[0].title, "내 사진");
    await db.exec("reset role; set role anon");
    await assert.rejects(removeSelected(), /permission denied/i);
    await assert.rejects(list(monday, false), /permission denied/i);
    await assert.rejects(
      sql("select image from ops_makeup_looks"),
      /permission denied/i,
    );
  } finally {
    await db.close();
  }
});
