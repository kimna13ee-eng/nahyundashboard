import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

test("PERSONAL records isolate owners, guard fields/dates, retain archived data and reject stale writes", async () => {
  const db = new PGlite();
  await db.waitReady;
  const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
  const become = (id) =>
    db.exec(
      `reset role;set role authenticated;set request.jwt.claim.sub='${id}'`,
    );
  const migration = await readFile(
    "supabase/personal/024_personal_records.sql",
    "utf8",
  );
  try {
    await db.exec(`create schema auth;create role anon;create role authenticated;
      create table auth.users(id uuid primary key);insert into auth.users values('${OWNER}'),('${OTHER}');
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth,public to authenticated,anon;
      create table unrelated_fixture(id integer primary key,body text);insert into unrelated_fixture values(1,'original');`);
    await db.exec(migration);
    await become(OWNER);
    const id = randomUUID();
    const row = await one(
      "insert into ops_personal_records(id,body,kind,entry_date) values($1,'오늘 할 일','todo','2026-11-09') returning *,updated_at::text token",
      [id],
    );
    assert.equal(row.owner_id, OWNER);
    assert.equal(row.done, false);
    assert.equal(row.archived_at, null);
    assert.equal(row.created_at.getTime(), row.updated_at.getTime());
    // Stable client ID makes retries unique; an insert can never overwrite existing content.
    await assert.rejects(
      db.query(
        "insert into ops_personal_records(id,body,kind,entry_date) values($1,'retry overwrite','todo','2026-11-09')",
        [id],
      ),
      /duplicate key/i,
    );
    assert.equal(
      (await one("select body from ops_personal_records where id=$1", [id]))
        .body,
      "오늘 할 일",
    );
    for (const field of ["owner_id", "archived_at", "created_at", "updated_at"])
      await assert.rejects(
        db.query(
          `insert into ops_personal_records(id,body,kind,entry_date,${field}) values($1,'forged','note','2026-11-09',default)`,
          [randomUUID()],
        ),
        /permission denied/i,
      );
    for (const field of ["id", "owner_id", "created_at", "updated_at"])
      await assert.rejects(
        db.query(
          `update ops_personal_records set ${field}=${field} where id=$1`,
          [id],
        ),
        /permission denied/i,
      );
    await assert.rejects(
      db.query("delete from ops_personal_records where id=$1", [id]),
      /permission denied/i,
    );
    for (const body of [
      "",
      " ",
      "\u00a0",
      "\u2003leading",
      "trailing\ufeff",
      "가".repeat(6001),
    ])
      await assert.rejects(
        db.query(
          "insert into ops_personal_records(id,body,kind,entry_date) values($1,$2,'note','2026-11-09')",
          [randomUUID(), body],
        ),
        /check constraint/i,
      );
    await one(
      "insert into ops_personal_records(id,body,kind,entry_date) values($1,$2,'idea','2028-02-29') returning id",
      [randomUUID(), "😀".repeat(6000)],
    );
    for (const date of [
      "2026-02-29",
      "2026-11-31",
      "infinity",
      "0001-01-01 BC",
      "10000-01-01",
    ])
      await assert.rejects(
        db.query(
          "insert into ops_personal_records(id,body,kind,entry_date) values($1,'bad date','note',$2)",
          [randomUUID(), date],
        ),
        /date|check constraint/i,
      );
    await assert.rejects(
      db.query(
        "insert into ops_personal_records(id,body,kind,entry_date,done) values($1,'not todo','note','2026-11-09',true)",
        [randomUUID()],
      ),
      /check constraint/i,
    );
    await assert.rejects(
      db.query(
        "update ops_personal_records set archived_at='infinity' where id=$1",
        [id],
      ),
      /check constraint/i,
    );

    const changed = await one(
      "update ops_personal_records set done=true where id=$1 and owner_id=$2 and updated_at=$3 and archived_at is null returning *,updated_at::text token",
      [id, OWNER, row.token],
    );
    assert.equal(changed.done, true);
    assert.notEqual(changed.token, row.token);
    assert.equal(
      (
        await db.query(
          "update ops_personal_records set body='stale overwrite' where id=$1 and updated_at=$2 returning id",
          [id, row.token],
        )
      ).rows.length,
      0,
    );
    await assert.rejects(
      db.query("update ops_personal_records set kind='note' where id=$1", [id]),
      /check constraint/i,
    );
    const converted = await one(
      "update ops_personal_records set kind='note',done=false where id=$1 and updated_at=$2 returning *,updated_at::text token",
      [id, changed.token],
    );
    const archived = await one(
      "update ops_personal_records set archived_at=clock_timestamp() where id=$1 and updated_at=$2 and archived_at is null returning *,updated_at::text token",
      [id, converted.token],
    );
    assert.ok(archived.archived_at);
    assert.equal(
      (
        await db.query(
          "update ops_personal_records set body='late edit' where id=$1 and updated_at=$2 and archived_at is null returning id",
          [id, archived.token],
        )
      ).rows.length,
      0,
    );
    const restored = await one(
      "update ops_personal_records set archived_at=null where id=$1 and updated_at=$2 and archived_at is not null returning *,updated_at::text token",
      [id, archived.token],
    );
    assert.equal(restored.body, "오늘 할 일");
    assert.equal(restored.done, false);
    assert.equal(restored.archived_at, null);
    assert.notEqual(restored.token, archived.token);

    await become(OTHER);
    assert.equal(
      (await db.query("select * from ops_personal_records")).rows.length,
      0,
    );
    assert.equal(
      (
        await db.query(
          "update ops_personal_records set body='cross owner' where id=$1 returning id",
          [id],
        )
      ).rows.length,
      0,
    );
    await one(
      "insert into ops_personal_records(id,body,kind,entry_date) values($1,'other owner','note','2026-11-09') returning id",
      [randomUUID()],
    );
    await db.exec("reset role;set role anon");
    await assert.rejects(
      db.query("select * from ops_personal_records"),
      /permission denied/i,
    );
    await assert.rejects(
      db.query(
        "insert into ops_personal_records(id,body,kind,entry_date) values($1,'anonymous','note','2026-11-09')",
        [randomUUID()],
      ),
      /permission denied/i,
    );
    await db.exec("reset role");
    const before = (
      await db.query("select * from ops_personal_records order by id")
    ).rows;
    await db.exec(migration);
    assert.deepEqual(
      (await db.query("select * from ops_personal_records order by id")).rows,
      before,
    );
    assert.equal(
      (await one("select body from unrelated_fixture")).body,
      "original",
    );
    assert.deepEqual(
      await one(
        "select relrowsecurity,relforcerowsecurity from pg_class where oid='ops_personal_records'::regclass",
      ),
      { relrowsecurity: true, relforcerowsecurity: true },
    );
    assert.equal(
      (
        await one(
          "select prosecdef from pg_proc where oid='ops_personal_record_stamp()'::regprocedure",
        )
      ).prosecdef,
      false,
    );
  } finally {
    await db.close();
  }
});
