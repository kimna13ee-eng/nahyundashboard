import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

const owner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const migration = await readFile(
  "supabase/personal/025_blog_keywords.sql",
  "utf8",
);

test("blog keyword storage isolates owners, validates fields and cannot permanently delete", async () => {
  const db = new PGlite();
  await db.waitReady;
  const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
  const become = (id) =>
    db.exec(
      `reset role;set role authenticated;set request.jwt.claim.sub='${id}'`,
    );
  try {
    await db.exec(`create schema auth;create role anon;create role authenticated;
      create table auth.users(id uuid primary key);insert into auth.users values('${owner}'),('${other}');
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth,public to authenticated,anon;
      create table unrelated_fixture(id integer primary key,body text);insert into unrelated_fixture values(1,'original');`);
    await db.exec(migration);
    await become(owner);
    const id = randomUUID();
    const row = await one(
      "insert into ops_blog_keywords(id,keyword) values($1,'출근 메이크업') returning *",
      [id],
    );
    assert.equal(row.owner_id, owner);
    assert.equal(row.used, false);
    assert.equal(row.deleted_at, null);
    for (const field of [
      "owner_id",
      "used",
      "deleted_at",
      "created_at",
      "updated_at",
    ])
      await assert.rejects(
        db.query(
          `insert into ops_blog_keywords(id,keyword,${field}) values($1,'forged',default)`,
          [randomUUID()],
        ),
        /permission denied/i,
      );
    for (const field of [
      "id",
      "owner_id",
      "keyword",
      "created_at",
      "updated_at",
    ])
      await assert.rejects(
        db.query(`update ops_blog_keywords set ${field}=${field} where id=$1`, [
          id,
        ]),
        /permission denied/i,
      );
    await assert.rejects(
      db.query("delete from ops_blog_keywords where id=$1", [id]),
      /permission denied/i,
    );
    await assert.rejects(
      db.query(
        "update ops_blog_keywords set deleted_at=clock_timestamp() where id=$1",
        [id],
      ),
      /check constraint/i,
    );
    for (const keyword of [
      "",
      " ",
      "\u00a0",
      "\u2003leading",
      "trailing\ufeff",
      "가".repeat(201),
    ])
      await assert.rejects(
        db.query("insert into ops_blog_keywords(id,keyword) values($1,$2)", [
          randomUUID(),
          keyword,
        ]),
        /check constraint/i,
      );
    await one(
      "insert into ops_blog_keywords(id,keyword) values($1,$2) returning id",
      [randomUUID(), "😀".repeat(200)],
    );
    await become(other);
    assert.equal(
      (await db.query("select * from ops_blog_keywords")).rows.length,
      0,
    );
    assert.equal(
      (
        await db.query(
          "update ops_blog_keywords set used=true where id=$1 returning id",
          [id],
        )
      ).rows.length,
      0,
    );
    await db.exec("reset role;set role anon");
    await assert.rejects(
      db.query("select * from ops_blog_keywords"),
      /permission denied/i,
    );
    await assert.rejects(
      db.query("select * from ops_blog_keywords_set_deleted('[]',true)"),
      /permission denied/i,
    );
    await db.exec("reset role");
    const before = (
      await db.query("select * from ops_blog_keywords order by id")
    ).rows;
    await db.exec(migration);
    assert.deepEqual(
      (await db.query("select * from ops_blog_keywords order by id")).rows,
      before,
    );
    assert.equal(
      (await one("select body from unrelated_fixture")).body,
      "original",
    );
    assert.deepEqual(
      await one(
        "select relrowsecurity,relforcerowsecurity from pg_class where oid='ops_blog_keywords'::regclass",
      ),
      { relrowsecurity: true, relforcerowsecurity: true },
    );
    assert.equal(
      (
        await one(
          "select prosecdef from pg_proc where oid='ops_blog_keywords_set_deleted(jsonb,boolean)'::regprocedure",
        )
      ).prosecdef,
      false,
    );
  } finally {
    await db.close();
  }
});

test("batch delete and undo are atomic across stale, unchecked, missing and foreign-owner items", async () => {
  const db = new PGlite();
  await db.waitReady;
  const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
  const become = (id) =>
    db.exec(
      `reset role;set role authenticated;set request.jwt.claim.sub='${id}'`,
    );
  const read = (id) =>
    one(
      "select *,to_char(updated_at at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') token from ops_blog_keywords where id=$1",
      [id],
    );
  const reference = (row) => ({ id: row.id, expectedUpdatedAt: row.token });
  const batch = (items, deleted = true) =>
    db.query(
      "select *,to_char(updated_at at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') token from ops_blog_keywords_set_deleted($1::jsonb,$2)",
      [JSON.stringify(items), deleted],
    );
  try {
    await db.exec(`create schema auth;create role anon;create role authenticated;
      create table auth.users(id uuid primary key);insert into auth.users values('${owner}'),('${other}');
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth,public to authenticated,anon;`);
    await db.exec(migration);
    const ids = [randomUUID(), randomUUID(), randomUUID()];
    await become(owner);
    for (const id of ids)
      await db.query(
        "insert into ops_blog_keywords(id,keyword) values($1,'개인 키워드')",
        [id],
      );
    const before = await read(ids[0]);
    await db.query("update ops_blog_keywords set used=true where id=$1", [
      ids[0],
    ]);
    await db.query("update ops_blog_keywords set used=true where id=$1", [
      ids[1],
    ]);
    const first = await read(ids[0]),
      second = await read(ids[1]),
      unchecked = await read(ids[2]);
    assert.notEqual(first.token, before.token);
    assert.equal(
      (
        await db.query(
          "update ops_blog_keywords set used=false where id=$1 and updated_at=$2 returning id",
          [ids[0], before.token],
        )
      ).rows.length,
      0,
    );
    for (const refs of [
      [reference(first), reference(before)],
      [reference(first), reference(unchecked)],
      [reference(first), { id: randomUUID(), expectedUpdatedAt: first.token }],
      [
        reference(first),
        { ...reference(second), expectedUpdatedAt: before.token },
      ],
    ]) {
      await assert.rejects(batch(refs), /selection|Duplicate/i);
      assert.equal((await read(ids[0])).deleted_at, null);
      assert.equal((await read(ids[1])).deleted_at, null);
    }
    await become(other);
    const foreignId = randomUUID();
    await db.query(
      "insert into ops_blog_keywords(id,keyword) values($1,'other owner')",
      [foreignId],
    );
    await db.query("update ops_blog_keywords set used=true where id=$1", [
      foreignId,
    ]);
    const foreign = await read(foreignId);
    await become(owner);
    await assert.rejects(
      batch([reference(first), reference(foreign)]),
      /selection changed/i,
    );
    assert.equal((await read(ids[0])).deleted_at, null);
    for (const invalid of [
      [],
      [reference(first), reference(first)],
      [{ id: first.id }],
      [{ ...reference(first), owner_id: other }],
    ])
      await assert.rejects(batch(invalid));
    const deleted = (await batch([reference(first), reference(second)])).rows;
    assert.equal(deleted.length, 2);
    assert.ok(deleted.every((row) => row.used && row.deleted_at));
    assert.equal((await read(ids[2])).deleted_at, null);
    await assert.rejects(
      batch([reference(first), reference(second)], false),
      /selection changed/i,
    );
    assert.ok((await read(ids[0])).deleted_at);
    const restored = (await batch(deleted.map(reference), false)).rows;
    assert.equal(restored.length, 2);
    assert.ok(restored.every((row) => row.used && row.deleted_at === null));
    for (const row of restored)
      assert.notEqual(
        row.token,
        deleted.find((old) => old.id === row.id).token,
      );
    await become(other);
    assert.equal((await read(foreignId)).deleted_at, null);
  } finally {
    await db.close();
  }
});
