import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("SQL016 개인 시트: 소유자만 조회·앱 수정 차단·재적용 보존·잘못된 원본 거절", async () => {
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
    const migration = await readFile(
      "supabase/personal/016_personal_sheet_sources.sql",
      "utf8",
    );
    await db.exec(migration);
    await db.query(
      "insert into ops_personal_sheet_sources(owner_id,spreadsheet_id) values($1,$2)",
      [owner, "fixture_SHEET_ID_1234567890"],
    );
    const before = (await db.query("select * from ops_personal_sheet_sources"))
      .rows;
    await db.exec(migration);
    assert.deepEqual(
      (await db.query("select * from ops_personal_sheet_sources")).rows,
      before,
    );
    assert.deepEqual(
      (
        await db.query(
          "select relrowsecurity,relforcerowsecurity from pg_class where oid='ops_personal_sheet_sources'::regclass",
        )
      ).rows[0],
      {
        relrowsecurity: true,
        relforcerowsecurity: true,
      },
    );
    for (const id of [
      "",
      "short",
      "https://evil.test/valid_looking_sheet_id",
      "x".repeat(201),
    ])
      await assert.rejects(
        db.query("update ops_personal_sheet_sources set spreadsheet_id=$1", [
          id,
        ]),
        /check constraint/i,
      );
    await db.exec(
      `set role authenticated;set request.jwt.claim.sub='${owner}'`,
    );
    assert.equal(
      (await db.query("select spreadsheet_id from ops_personal_sheet_sources"))
        .rows[0].spreadsheet_id,
      "fixture_SHEET_ID_1234567890",
    );
    for (const sql of [
      "update ops_personal_sheet_sources set spreadsheet_id='other_fixture_sheet_1234567890'",
      "delete from ops_personal_sheet_sources",
      `insert into ops_personal_sheet_sources(owner_id,spreadsheet_id) values('${other}','other_fixture_sheet_1234567890')`,
    ])
      await assert.rejects(db.query(sql), /permission denied/i);
    await db.exec(`set request.jwt.claim.sub='${other}'`);
    assert.equal(
      (await db.query("select * from ops_personal_sheet_sources")).rows.length,
      0,
    );
    await db.exec("reset role;set role anon");
    await assert.rejects(
      db.query("select * from ops_personal_sheet_sources"),
      /permission denied/i,
    );
    await db.exec("reset role");
    await db.query("delete from auth.users where id=$1", [owner]);
    assert.equal(
      (await db.query("select * from ops_personal_sheet_sources")).rows.length,
      0,
    );
  } finally {
    await db.close();
  }
});
