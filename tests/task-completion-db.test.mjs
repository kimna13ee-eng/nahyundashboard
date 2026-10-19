import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";

test("SQL017 완료 시각: 전환 기록·수정 보존·재개 초기화·위조 거절·소유권", async () => {
  const db = new PGlite({ extensions: { btree_gist } });
  await db.waitReady;
  const owner = "11111111-1111-4111-8111-111111111111";
  const other = "22222222-2222-4222-8222-222222222222";
  try {
    await db.exec(`create schema auth;create schema extensions;create role anon;create role authenticated;
      create table auth.users(id uuid primary key);insert into auth.users values('${owner}'),('${other}');
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth,public to authenticated,anon;`);
    await db.exec(await readFile("supabase/personal/001_tasks.sql", "utf8"));
    await db.exec(await readFile("supabase/personal/002_mvp.sql", "utf8"));
    await db.exec(
      `set role authenticated;set request.jwt.claim.sub='${owner}'`,
    );
    const legacy = (
      await db.query(
        "insert into tasks(title,status,updated_at) values('기존 완료','completed','2026-10-18T04:00:00Z') returning id",
      )
    ).rows[0].id;
    const pending = (
      await db.query("insert into tasks(title) values('미완료') returning id")
    ).rows[0].id;
    const activeSession = (
      await db.query(
        "select ops_timer('start',$1,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','') as id",
        [pending],
      )
    ).rows[0].id;
    const timerSnapshot = async () => ({
      sessions: (await db.query("select * from ops_work_sessions order by id"))
        .rows,
      intervals: (
        await db.query("select * from ops_session_intervals order by id")
      ).rows,
      events: (await db.query("select * from ops_session_events order by id"))
        .rows,
    });
    const beforeTimers = await timerSnapshot();
    const migration = await readFile(
      "supabase/personal/017_task_completion.sql",
      "utf8",
    );
    await db.exec("reset role");
    await db.exec(migration);
    await db.exec(migration);
    await db.exec("set role authenticated");
    const get = async (id) =>
      (await db.query("select * from tasks where id=$1", [id])).rows[0];
    assert.equal(
      (await get(legacy)).completed_at.toISOString(),
      "2026-10-18T04:00:00.000Z",
    );
    assert.equal(
      (await get(legacy)).updated_at.toISOString(),
      "2026-10-18T04:00:00.000Z",
    );
    assert.deepEqual(await timerSnapshot(), beforeTimers);
    assert.equal(
      (
        await db.query(
          "select tgenabled from pg_trigger where tgrelid='tasks'::regclass and tgname='tasks_stamp'",
        )
      ).rows[0].tgenabled,
      "O",
    );
    assert.equal((await get(pending)).completed_at, null);
    await db.query(
      "update tasks set status='completed',completed_at='1990-01-01Z' where id=$1",
      [pending],
    );
    const first = (await get(pending)).completed_at;
    assert.ok(first.getTime() > Date.parse("2026-01-01Z"));
    await db.query(
      "update tasks set title='수정 완료',updated_at='2099-01-01Z',completed_at='2099-01-01Z' where id=$1",
      [pending],
    );
    assert.deepEqual((await get(pending)).completed_at, first);
    const beforeReapply = await get(pending);
    await db.exec("reset role");
    await db.exec(migration);
    await db.exec("set role authenticated");
    assert.deepEqual(await get(pending), beforeReapply);
    await db.query(
      "update tasks set status='pending',completed_at='2099-01-01Z' where id=$1",
      [pending],
    );
    assert.equal((await get(pending)).completed_at, null);
    await db.query("update tasks set status='completed' where id=$1", [
      pending,
    ]);
    assert.ok((await get(pending)).completed_at.getTime() >= first.getTime());
    const inserted = (
      await db.query(
        "insert into tasks(title,status,completed_at) values('즉시 완료','completed','1990-01-01Z') returning completed_at",
      )
    ).rows[0];
    assert.ok(inserted.completed_at.getTime() > Date.parse("2026-01-01Z"));
    assert.equal(
      (
        await db.query(
          "insert into tasks(title,completed_at) values('미완료 위조','2099-01-01Z') returning completed_at",
        )
      ).rows[0].completed_at,
      null,
    );
    const completedBeforeTimerFinish = (await get(pending)).completed_at;
    await db.query(
      "select ops_timer('finish',$1,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','기존 타이머 정상 종료')",
      [pending],
    );
    assert.equal(
      (
        await db.query("select status from ops_work_sessions where id=$1", [
          activeSession,
        ])
      ).rows[0].status,
      "ENDED",
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int as count from ops_session_intervals where ends_at is null",
        )
      ).rows[0].count,
      0,
    );
    assert.deepEqual(
      (await get(pending)).completed_at,
      completedBeforeTimerFinish,
    );
    await db.exec(`set request.jwt.claim.sub='${other}'`);
    assert.equal(
      (
        await db.query(
          "update tasks set status='completed' where id=$1 returning id",
          [pending],
        )
      ).rows.length,
      0,
    );
    assert.equal(
      (await db.query("select completed_at from tasks where id=$1", [pending]))
        .rows.length,
      0,
    );
    await db.exec("reset role;set role anon");
    await assert.rejects(
      db.query("select completed_at from tasks"),
      /permission denied/i,
    );
  } finally {
    await db.close();
  }
});

for (const [state, command] of [
  ["A", "enable always"],
  ["R", "enable replica"],
  ["D", "disable"],
]) {
  test(`SQL017 backfill은 tasks_stamp ${state} 상태와 기존 편집 시각을 보존`, async () => {
    const db = new PGlite();
    await db.waitReady;
    try {
      await db.exec(`create schema auth;create role anon;create role authenticated;
        create table auth.users(id uuid primary key);
        insert into auth.users values('11111111-1111-4111-8111-111111111111');
        create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`);
      await db.exec(await readFile("supabase/personal/001_tasks.sql", "utf8"));
      await db.exec(`alter table tasks add column updated_at timestamptz not null default now();
        create function public.ops_stamp() returns trigger language plpgsql set search_path='' as $$begin new.updated_at=now();return new;end$$;
        create trigger tasks_stamp before update on public.tasks for each row execute function public.ops_stamp();
        alter table public.tasks ${command} trigger tasks_stamp;
        insert into tasks(owner_id,title,status,updated_at) values('11111111-1111-4111-8111-111111111111','기존 완료','completed','2026-01-01T00:00:00Z');`);
      const migration = await readFile(
        "supabase/personal/017_task_completion.sql",
        "utf8",
      );
      await db.exec(migration);
      const first = (await db.query("select * from tasks")).rows[0];
      assert.equal(first.updated_at.toISOString(), "2026-01-01T00:00:00.000Z");
      assert.deepEqual(first.completed_at, first.updated_at);
      assert.equal(
        (
          await db.query(
            "select tgenabled from pg_trigger where tgrelid='tasks'::regclass and tgname='tasks_stamp'",
          )
        ).rows[0].tgenabled,
        state,
      );
      await db.exec(migration);
      assert.deepEqual((await db.query("select * from tasks")).rows[0], first);
      assert.equal(
        (
          await db.query(
            "select tgenabled from pg_trigger where tgrelid='tasks'::regclass and tgname='tasks_stamp'",
          )
        ).rows[0].tgenabled,
        state,
      );
    } finally {
      await db.close();
    }
  });
}
