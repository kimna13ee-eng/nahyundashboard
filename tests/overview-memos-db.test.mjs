import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";

const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const OUTSIDER = "33333333-3333-4333-8333-333333333333";

test("FRENGLE SQL005: owner/member RLS, narrow grants, microsecond CAS, archive/restore and reapply preserve real work", async () => {
  const db = new PGlite({ extensions: { btree_gist } });
  await db.waitReady;
  const one = async (sql, values = []) => (await db.query(sql, values)).rows[0];
  const become = async (id) =>
    db.exec(
      `reset role;set role authenticated;set request.jwt.claim.sub='${id}'`,
    );
  try {
    await db.exec(`create schema auth;create schema extensions;create role anon;create role authenticated;
      create table auth.users(id uuid primary key);insert into auth.users values('${OWNER}'),('${OTHER}'),('${OUTSIDER}');
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth,public to authenticated,anon;`);
    for (const file of [
      "001_automation_results.sql",
      "002_work_check_results.sql",
      "003_core_workspace.sql",
    ])
      await db.exec(await readFile(`supabase/frengle/${file}`, "utf8"));
    await db.query("insert into ops_company_members(user_id) values($1),($2)", [
      OWNER,
      OTHER,
    ]);
    await become(OWNER);
    const task = await one(
      "insert into tasks(title) values('기존 회사 업무') returning *",
    );
    const receipt = await one(
      "insert into ops_automation_results(source,run_key,title,body,source_url,reported_at) values('frengle_work_check','memos-preserve','기존 자동화','회사 원문','https://chatgpt.com/c/fixture',now()) returning *",
    );
    await db.exec("reset role");
    const originalCore = (
      await db.query(
        "select c.relname,c.relrowsecurity,c.relforcerowsecurity,c.relacl::text from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' order by c.relname",
      )
    ).rows;
    const migration = await readFile(
      "supabase/frengle/005_overview_memos.sql",
      "utf8",
    );
    await db.exec(migration);
    assert.deepEqual(
      await one(
        "select relrowsecurity,relforcerowsecurity from pg_class where oid='ops_overview_memos'::regclass",
      ),
      { relrowsecurity: true, relforcerowsecurity: true },
    );
    assert.equal(
      (
        await one(
          "select prosecdef from pg_proc where oid='ops_overview_memo_stamp()'::regprocedure",
        )
      ).prosecdef,
      false,
    );

    await become(OWNER);
    const memo = await one(
      "insert into ops_overview_memos(body) values('확인할 메모') returning *,updated_at::text as token",
    );
    assert.equal(memo.owner_id, OWNER);
    assert.equal(memo.done, false);
    assert.equal(memo.deleted_at, null);
    assert.equal(memo.created_at.getTime(), memo.updated_at.getTime());
    for (const column of [
      "id",
      "owner_id",
      "done",
      "deleted_at",
      "created_at",
      "updated_at",
    ])
      await assert.rejects(
        db.query(
          `insert into ops_overview_memos(body,${column}) values('위조',default)`,
        ),
        /permission denied/i,
      );
    for (const column of ["id", "owner_id", "created_at", "updated_at"])
      await assert.rejects(
        db.query(
          `update ops_overview_memos set ${column}=${column} where id=$1`,
          [memo.id],
        ),
        /permission denied/i,
      );
    await assert.rejects(
      db.query("delete from ops_overview_memos where id=$1", [memo.id]),
      /permission denied/i,
    );
    for (const body of [
      "",
      " ",
      "앞뒤 ",
      " 앞뒤",
      "\t",
      "\n내용",
      "내용\r\n",
      "\u00a0",
      "\u2003내용",
      "내용\ufeff",
      "가".repeat(1001),
    ])
      await assert.rejects(
        db.query("insert into ops_overview_memos(body) values($1)", [body]),
        /check constraint/i,
      );
    await assert.rejects(
      db.query("insert into ops_overview_memos(body) values(null)"),
      /not-null constraint/i,
    );
    await assert.rejects(
      db.query("update ops_overview_memos set done=null where id=$1", [
        memo.id,
      ]),
      /not-null constraint/i,
    );
    await assert.rejects(
      db.query(
        "update ops_overview_memos set deleted_at='infinity' where id=$1",
        [memo.id],
      ),
      /check constraint/i,
    );
    assert.equal(
      (
        await one(
          "insert into ops_overview_memos(body) values($1) returning length(body) n",
          ["😀".repeat(1000)],
        )
      ).n,
      1000,
    );

    const [first, competing] = await Promise.all([
      db.query(
        "update ops_overview_memos set done=true where id=$1 and owner_id=$2 and updated_at=$3::timestamptz and deleted_at is null returning updated_at::text token",
        [memo.id, OWNER, memo.token],
      ),
      db.query(
        "update ops_overview_memos set body='충돌하는 변경' where id=$1 and owner_id=$2 and updated_at=$3::timestamptz and deleted_at is null returning updated_at::text token",
        [memo.id, OWNER, memo.token],
      ),
    ]);
    assert.equal(first.rows.length, 1);
    assert.equal(competing.rows.length, 0);
    assert.equal(
      (
        await one(
          "select body,done,updated_at>$2::timestamptz advanced from ops_overview_memos where id=$1",
          [memo.id, memo.token],
        )
      ).advanced,
      true,
    );
    assert.equal(
      (await one("select body from ops_overview_memos where id=$1", [memo.id]))
        .body,
      "확인할 메모",
    );
    const archived = await one(
      "update ops_overview_memos set deleted_at=clock_timestamp() where id=$1 and updated_at=$2::timestamptz returning *,updated_at::text token",
      [memo.id, first.rows[0].token],
    );
    assert.equal(archived.done, true);
    assert.ok(archived.deleted_at);
    assert.equal(
      (
        await db.query(
          "update ops_overview_memos set deleted_at=null where id=$1 and updated_at=$2::timestamptz returning id",
          [memo.id, first.rows[0].token],
        )
      ).rows.length,
      0,
    );
    const restored = await one(
      "update ops_overview_memos set deleted_at=null where id=$1 and updated_at=$2::timestamptz and deleted_at is not null returning *,updated_at::text token",
      [memo.id, archived.token],
    );
    assert.equal(restored.deleted_at, null);
    assert.equal(restored.done, true);
    assert.equal(restored.body, "확인할 메모");
    assert.notEqual(restored.token, archived.token);
    // Even if a former token were ahead of the clock, every update advances at least 1µs.
    await db.exec(
      "reset role;alter table ops_overview_memos disable trigger overview_memo_stamp",
    );
    await db.query(
      "update ops_overview_memos set updated_at='2099-01-01T00:00:00.123456Z' where id=$1",
      [memo.id],
    );
    await db.exec(
      "alter table ops_overview_memos enable trigger overview_memo_stamp",
    );
    await become(OWNER);
    assert.equal(
      (
        await one(
          "update ops_overview_memos set done=false where id=$1 returning to_char(updated_at at time zone 'UTC','YYYY-MM-DD HH24:MI:SS.US') token",
          [memo.id],
        )
      ).token,
      "2099-01-01 00:00:00.123457",
    );
    await db.query(
      "update ops_overview_memos set deleted_at='2020-01-01' where id=$1",
      [memo.id],
    );
    assert.ok(
      (
        await one(
          "update ops_overview_memos set deleted_at=null where id=$1 returning id",
          [memo.id],
        )
      ).id,
    );

    await become(OTHER);
    assert.equal(
      (await db.query("select * from ops_overview_memos")).rows.length,
      0,
    );
    assert.equal(
      (
        await db.query(
          "update ops_overview_memos set done=true where id=$1 returning id",
          [memo.id],
        )
      ).rows.length,
      0,
    );
    await one(
      "insert into ops_overview_memos(body) values('다른 회원 메모') returning id",
    );
    await become(OUTSIDER);
    assert.equal(
      (await db.query("select * from ops_overview_memos")).rows.length,
      0,
    );
    await assert.rejects(
      db.query("insert into ops_overview_memos(body) values('비회원')"),
      /row-level security/i,
    );
    await db.exec("reset role;set role anon");
    await assert.rejects(
      db.query("select * from ops_overview_memos"),
      /permission denied/i,
    );
    await assert.rejects(
      db.query("insert into ops_overview_memos(body) values('익명')"),
      /permission denied/i,
    );

    await db.exec("reset role");
    const beforeReapply = (
      await db.query("select * from ops_overview_memos order by id")
    ).rows;
    await db.exec(migration);
    await db.exec(migration);
    assert.deepEqual(
      (await db.query("select * from ops_overview_memos order by id")).rows,
      beforeReapply,
    );
    assert.deepEqual(
      (
        await db.query(
          "select c.relname,c.relrowsecurity,c.relforcerowsecurity,c.relacl::text from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname<>'ops_overview_memos' order by c.relname",
        )
      ).rows,
      originalCore,
    );
    assert.deepEqual(
      await one("select * from tasks where id=$1", [task.id]),
      task,
    );
    assert.deepEqual(
      await one("select * from ops_automation_results where id=$1", [
        receipt.id,
      ]),
      receipt,
    );
    await db.query("delete from ops_company_members where user_id=$1", [OWNER]);
    await become(OWNER);
    assert.equal(
      (await db.query("select * from ops_overview_memos")).rows.length,
      0,
    );
    assert.equal(
      (
        await db.query(
          "update ops_overview_memos set deleted_at=now() where id=$1 returning id",
          [memo.id],
        )
      ).rows.length,
      0,
    );
    await assert.rejects(
      db.query("insert into ops_overview_memos(body) values('회원 해제')"),
      /row-level security/i,
    );
  } finally {
    await db.close();
  }
});
