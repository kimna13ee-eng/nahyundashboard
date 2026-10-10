import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
test("운영 SQL·반복 예외와 원자적 분할·PERSONAL RLS", async () => {
  const db = new PGlite({ extensions: { btree_gist } });
  await db.waitReady;
  try {
    await db.exec(
      `create schema auth;create schema extensions;create role anon;create role authenticated;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated,anon;insert into auth.users values('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');`,
    );
    for (const file of ["001_tasks.sql", "002_mvp.sql", "003_phase2.sql", "004_calendar_recurrence.sql"])
      await db.exec(await readFile(`supabase/personal/${file}`, "utf8"));
    await db.exec("insert into public.tasks(owner_id,title) values('11111111-1111-4111-8111-111111111111','분류 마이그레이션 검증')");
    await db.exec(await readFile("supabase/personal/005_task_classification.sql", "utf8"));
    assert.equal((await db.query("select work_kind from public.tasks where title='분류 마이그레이션 검증'")).rows[0].work_kind, 'unclassified');
    await assert.rejects(db.query("update public.tasks set work_kind='invalid' where title='분류 마이그레이션 검증'"));
    await db.exec("delete from public.tasks where title='분류 마이그레이션 검증'");
    await db.exec(
      "set role authenticated;set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';",
    );
    const monthly = (await db.query("insert into public.ops_recurrence(title,starts_at,ends_at,frequency,interval,until_date) values('월말 테스트','2024-01-31T09:00:00+09:00','2024-01-31T10:00:00+09:00','monthly',1,'2024-04-30') returning id")).rows[0].id;
    await db.query("select public.ops_recurrence_change($1,'2024-02-29T09:00:00+09:00','one','{}',true)",[monthly]);
    await assert.rejects(db.query("select public.ops_recurrence_change($1,'2024-03-29T09:00:00+09:00','one','{}',true)",[monthly]));
    await db.query("select public.ops_recurrence_change($1,'2024-03-31T09:00:00+09:00','future','{}',true)",[monthly]);
    assert.equal((await db.query("select until_date::text value from public.ops_recurrence where id=$1",[monthly])).rows[0].value,'2024-03-30');
    const yearly = await db.query("select public.ops_recurrence_at('2024-02-29T09:00:00+09:00','yearly',1,4)= '2028-02-29T09:00:00+09:00'::timestamptz valid");
    assert.equal(yearly.rows[0].valid,true);
    await db.query("select public.ops_recurrence_change($1,'2024-01-31T09:00:00+09:00','all','{}',true)",[monthly]);
    const rule = (
      await db.query(
        "insert into public.ops_recurrence(title,starts_at,ends_at,frequency,interval,until_date) values('반복','2026-10-10T09:00:00+09:00','2026-10-10T10:00:00+09:00','daily',1,'2026-10-31') returning id",
      )
    ).rows[0].id;
    await db.query(
      "select public.ops_recurrence_change($1,'2026-10-11T09:00:00+09:00','one','{}',true)",
      [rule],
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from public.ops_recurrence_exceptions",
        )
      ).rows[0].n,
      1,
    );
    await assert.rejects(
      db.query(
        "select public.ops_recurrence_change($1,'2026-10-11T09:01:00+09:00','one','{}',true)",
        [rule],
      ),
    );
    const value = {
      title: "이후",
      notes: "",
      starts_at: "2026-10-12T11:00:00+09:00",
      ends_at: "2026-10-12T12:00:00+09:00",
      frequency: "weekly",
      interval: 1,
      until_date: "2026-11-30",
    };
    await db.query(
      "select public.ops_recurrence_change($1,'2026-10-12T09:00:00+09:00','future',$2,false)",
      [rule, JSON.stringify(value)],
    );
    assert.equal(
      (await db.query("select count(*)::int n from public.ops_recurrence"))
        .rows[0].n,
      2,
    );
    assert.equal(
      (
        await db.query(
          "select until_date::text d from public.ops_recurrence where id=$1",
          [rule],
        )
      ).rows[0].d,
      "2026-10-11",
    );
    const later = (
      await db.query("select id from public.ops_recurrence where title='이후'")
    ).rows[0].id;
    await assert.rejects(
      db.query(
        "select public.ops_recurrence_change($1,'2026-10-19T11:00:00+09:00','future',$2,false)",
        [
          later,
          JSON.stringify({ ...value, ends_at: "2026-10-12T10:00:00+09:00" }),
        ],
      ),
    );
    assert.equal(
      (
        await db.query(
          "select until_date::text d from public.ops_recurrence where id=$1",
          [later],
        )
      ).rows[0].d,
      "2026-11-30",
    );
    for (const [table, columns, values] of [
      ["ops_content", "title,stage,approval", "'콘텐츠','idea','none'"],
      ["ops_inspiration", "title,category", "'참고','개발'"],
      [
        "ops_leave_entries",
        "title,date,kind,amount",
        "'반차','2026-10-10','use',-0.5",
      ],
    ])
      await db.exec(
        `insert into public.${table}(${columns}) values(${values});`,
      );
    await db.exec(
      "set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';",
    );
    for (const table of [
      "ops_content",
      "ops_inspiration",
      "ops_leave_entries",
      "ops_recurrence",
      "ops_recurrence_exceptions",
    ]) {
      assert.equal(
        (await db.query(`select count(*)::int n from public.${table}`)).rows[0]
          .n,
        0,
      );
      assert.equal(
        (await db.query(`delete from public.${table} returning id`)).rows
          .length,
        0,
      );
    }
    await assert.rejects(
      db.query(
        "select public.ops_recurrence_change($1,'2026-10-10T09:00:00+09:00','all','{}',true)",
        [rule],
      ),
    );
    await assert.rejects(
      db.query(
        "insert into public.ops_leave_entries(owner_id,title,date,kind,amount) values('11111111-1111-4111-8111-111111111111','위조','2026-10-10','grant',1)",
      ),
    );
    await db.exec(
      "set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';",
    );
    await db.query(
      "select public.ops_recurrence_change($1,'2026-10-10T09:00:00+09:00','all','{}',true)",
      [rule],
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from public.ops_recurrence_exceptions",
        )
      ).rows[0].n,
      0,
    );
    await db.exec("set role anon;");
    await assert.rejects(db.query("select * from public.ops_leave_entries"));
  } finally {
    await db.close();
  }
});
