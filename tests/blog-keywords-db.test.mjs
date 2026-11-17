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
const detailsMigration = await readFile(
  "supabase/personal/028_blog_post_details.sql",
  "utf8",
);
const archiveMigration = await readFile(
  "supabase/personal/029_blog_keyword_archive.sql",
  "utf8",
);

test("collection export, snapshot-guarded clear and undo include every active status and isolate owners", async () => {
  const db = new PGlite();
  const become = (id) =>
    db.exec(
      `reset role; set role authenticated; set request.jwt.claim.sub='${id}'`,
    );
  const scalar = async (sql, args = []) =>
    (await db.query(sql, args)).rows[0].result;
  const archive = (action, snapshot = null) =>
    scalar("select ops_blog_keyword_archive($1,$2) as result", [
      action,
      snapshot,
    ]);
  const restore = (batch) =>
    scalar("select ops_blog_keyword_archive_restore($1)::int as result", [
      batch,
    ]);
  try {
    await db.exec(`create schema auth; create role anon; create role authenticated;
      create table auth.users(id uuid primary key); insert into auth.users values('${owner}'),('${other}');
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth,public to authenticated,anon;`);
    await db.exec(migration);
    await db.exec(detailsMigration);
    await become(owner);
    await db.exec(
      "insert into ops_blog_keywords(id,keyword) select gen_random_uuid(), '소재 '||n from generate_series(1,1002) n",
    );
    await db.exec(
      "update ops_blog_keywords set used=true, deleted_at=now() where keyword='소재 1'",
    );
    await db.exec("reset role");
    await db.exec(archiveMigration);
    await db.exec(archiveMigration);
    await db.exec("set role anon");
    await assert.rejects(archive("export"), /permission denied/);
    await assert.rejects(restore(randomUUID()), /permission denied/);
    await become(other);
    await db.exec(
      "insert into ops_blog_keywords(id,keyword) values(gen_random_uuid(),'다른 계정')",
    );
    await become(owner);
    const original = await archive("export");
    assert.equal(original.count, 1001);
    assert.equal(original.items.length, 1001);
    assert.ok(
      original.items.every((row) => !("id" in row) && !("owner_id" in row)),
    );
    assert.deepEqual(await archive("summary"), {
      count: 1001,
      snapshot: original.snapshot,
    });
    await assert.rejects(archive("clear", "invalid"), /invalid/i);
    await db.exec(
      "update ops_blog_keywords set is_draft=true, summary='초안' where keyword='소재 2'",
    );
    await assert.rejects(archive("clear", original.snapshot), /changed/);
    const edited = await archive("summary");
    await db.exec(
      "insert into ops_blog_keywords(id,keyword) values(gen_random_uuid(),'추가된 소재')",
    );
    await assert.rejects(archive("clear", edited.snapshot), /changed/);
    await db.exec(
      "update ops_blog_keywords set used=true where keyword='소재 3'",
    );
    const before = await archive("export");
    const batch = await archive("clear", before.snapshot);
    assert.equal(batch.count, 1002);
    assert.equal((await archive("summary")).count, 0);
    await assert.rejects(archive("clear", before.snapshot), /changed/);
    await become(other);
    assert.equal((await archive("summary")).count, 1);
    assert.equal(await restore(batch.batchId), 0);
    await become(owner);
    await db.exec(
      "insert into ops_blog_keywords(id,keyword) values(gen_random_uuid(),'삭제 후 등록')",
    );
    assert.equal(await restore(batch.batchId), 1002);
    assert.equal(await restore(batch.batchId), 0);
    const after = await archive("export");
    assert.equal(after.count, 1003);
    const columns = ({ updated_at, ...rest }) => rest;
    assert.deepEqual(
      after.items.slice(1).map(columns),
      before.items.map(columns),
    );
  } finally {
    await db.close();
  }
});

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
    // Upgrade an already populated archive without changing its ownership or edit token.
    await db.exec(detailsMigration);
    await db.exec(detailsMigration);
    await become(owner);
    const detailColumns = "keyword,board,sub_keyword,summary,is_draft,used";
    assert.deepEqual(
      await one(
        `select ${detailColumns},updated_at from ops_blog_keywords where id=$1`,
        [id],
      ),
      {
        keyword: row.keyword,
        board: null,
        sub_keyword: "",
        summary: "",
        is_draft: false,
        used: false,
        updated_at: row.updated_at,
      },
    );
    for (const board of ["블러셔 진열대", "썼어유", "보통의날"])
      assert.equal(
        (
          await one(
            "update ops_blog_keywords set board=$2 where id=$1 returning board",
            [id, board],
          )
        ).board,
        board,
      );
    for (const [field, bad] of [
      ["board", "다른게시판"],
      ["summary", "가".repeat(1001)],
      ["sub_keyword", "가".repeat(201)],
    ])
      await assert.rejects(
        db.query(`update ops_blog_keywords set ${field}=$2 where id=$1`, [
          id,
          bad,
        ]),
        /check constraint/i,
      );
    for (const field of ["id", "updated_at", "owner_id"])
      await assert.rejects(
        db.query(`update ops_blog_keywords set ${field}=${field} where id=$1`, [
          id,
        ]),
        /permission denied/i,
      );
    await become(other);
    assert.equal(
      (
        await db.query(
          "update ops_blog_keywords set is_draft=true, summary='foreign' where id=$1 returning id",
          [id],
        )
      ).rows.length,
      0,
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
    await db.exec(detailsMigration);
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
    await db.query(
      "update ops_blog_keywords set board='썼어유',summary='요약',sub_keyword='립',is_draft=true where id=$1",
      [ids[0]],
    );
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
    const restoredArticle = restored.find((row) => row.id === ids[0]);
    assert.equal(restoredArticle.is_draft, true);
    assert.equal(restoredArticle.board, "썼어유");
    assert.equal(restoredArticle.summary, "요약");
    assert.equal(restoredArticle.sub_keyword, "립");
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
