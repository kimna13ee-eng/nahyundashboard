import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
test("개인 마이그레이션, 소유자 RLS, 원자적 타이머, 중복 방지, 메모/프롬프트 이력", async () => {
  const db = new PGlite({ extensions: { btree_gist } });
  await db.waitReady;
  try {
    await db.exec(`create schema auth;create schema extensions;create role anon;create role authenticated;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth, public to authenticated, anon;
 insert into auth.users values('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');`);
    await db.exec(await readFile("supabase/personal/001_tasks.sql", "utf8"));
    await db.exec(await readFile("supabase/personal/002_mvp.sql", "utf8"));
    await db.exec(
      `set role authenticated;set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';`,
    );
    const a = (
      await db.query(
        `insert into public.tasks(title) values('업무 A') returning id`,
      )
    ).rows[0].id;
    const b = (
      await db.query(
        `insert into public.tasks(title) values('업무 B') returning id`,
      )
    ).rows[0].id;
    const req1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const sid = (
      await db.query(`select public.ops_timer('start',$1,$2,'') as id`, [
        a,
        req1,
      ])
    ).rows[0].id;
    await db.query(`select public.ops_timer('start',$1,$2,'')`, [a, req1]);
    assert.equal(
      (
        await db.query(
          `select count(*)::int as n from public.ops_session_events`,
        )
      ).rows[0].n,
      1,
    );
    await db.query(`select public.ops_timer('start',$1,$2,'')`, [
      b,
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    ]);
    assert.equal(
      (
        await db.query(
          `select count(*)::int as n from public.ops_work_sessions where status='ACTIVE'`,
        )
      ).rows[0].n,
      1,
    );
    assert.equal(
      (
        await db.query(
          `select status from public.ops_work_sessions where id=$1`,
          [sid],
        )
      ).rows[0].status,
      "PARKED",
    );
    await assert.rejects(
      db.query(
        `insert into public.ops_work_sessions(task_id,status) values($1,'ACTIVE')`,
        [a],
      ),
    );
    await assert.rejects(
      db.query(
        `insert into public.ops_session_intervals(session_id,starts_at,ends_at) values($1,now()-interval '1 hour',now()+interval '1 hour')`,
        [sid],
      ),
    );
    await db.query(`select public.ops_timer('pause',$1,$2,'')`, [
      b,
      "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    ]);
    await db.query(`select public.ops_timer('start',$1,$2,'')`, [
      a,
      "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    ]);
    await db.query(`select public.ops_timer('finish',$1,$2,'')`, [
      a,
      "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    ]);
    assert.equal(
      (
        await db.query(
          `select count(*)::int as n from public.ops_session_intervals where ends_at is null`,
        )
      ).rows[0].n,
      0,
    );
    assert.equal(
      (await db.query(`select summary from public.ops_work_journal`)).rows[0]
        .summary,
      "",
    );
    const note = (
      await db.query(
        `insert into public.ops_task_notes(task_id,body,kind) values($1,'다음 작업','next_action') returning id`,
        [a],
      )
    ).rows[0].id;
    const next = (
      await db.query(`select public.ops_note_to_task($1) as id`, [note])
    ).rows[0].id;
    assert.equal(
      (await db.query(`select public.ops_note_to_task($1) as id`, [note]))
        .rows[0].id,
      next,
    );
    assert.equal(
      (
        await db.query(
          `select count(*)::int as n from public.ops_note_versions where note_id=$1`,
          [note],
        )
      ).rows[0].n,
      2,
    );
    const item = (
      await db.query(
        `insert into public.ops_library_items(title,kind,category,body) values('프롬프트','prompt','개발','  원문  ') returning id`,
      )
    ).rows[0].id;
    await db.query(
      `update public.ops_library_items set body='변경 원문' where id=$1`,
      [item],
    );
    assert.equal(
      (
        await db.query(
          `select count(*)::int as n from public.ops_prompt_versions where item_id=$1`,
          [item],
        )
      ).rows[0].n,
      2,
    );
    await db.exec(
      `set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';`,
    );
    assert.equal(
      (await db.query(`select count(*)::int as n from public.tasks`)).rows[0].n,
      0,
    );
    assert.equal(
      (
        await db.query(
          `update public.tasks set title='타인 수정' where id=$1 returning id`,
          [a],
        )
      ).rows.length,
      0,
    );
    assert.equal(
      (await db.query(`delete from public.tasks where id=$1 returning id`, [b]))
        .rows.length,
      0,
    );
    await assert.rejects(
      db.query(
        `insert into public.ops_task_notes(task_id,body,kind) values($1,'타인 참조','general')`,
        [a],
      ),
    );
    await assert.rejects(
      db.query(`select public.ops_timer('start',$1,$2,'')`, [
        a,
        "ffffffff-ffff-4fff-8fff-ffffffffffff",
      ]),
    );
    await db.exec("set role anon;");
    await assert.rejects(db.query("select * from public.tasks"));
  } finally {
    await db.close();
  }
});
