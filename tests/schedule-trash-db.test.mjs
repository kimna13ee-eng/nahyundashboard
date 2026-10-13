import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";

const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

test("격리 DB: 일정 soft delete·12시간 복구·소유권·purge 재시도", async () => {
  const db = new PGlite({ extensions: { btree_gist } });
  await db.waitReady;
  try {
    await db.exec(`
      create schema auth;
      create schema extensions;
      create role anon;
      create role authenticated;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth,public to authenticated,anon;
      insert into auth.users values('${OWNER}'),('${OTHER}');
    `);
    for (const file of ["001_tasks.sql", "002_mvp.sql"])
      await db.exec(await readFile(`supabase/personal/${file}`, "utf8"));

    await db.exec(
      `set role authenticated;set request.jwt.claim.sub='${OWNER}'`,
    );
    const project = (
      await db.query(
        "insert into ops_projects(title) values('복구 프로젝트') returning id",
      )
    ).rows[0].id;
    const schedule = (
      await db.query(
        "insert into ops_schedules(title,notes,starts_at,ends_at,project_id) values('복구 일정','원문 보존','2026-10-13T23:30:00+09:00','2026-10-14T00:30:00+09:00',$1) returning id",
        [project],
      )
    ).rows[0].id;

    await db.exec("reset role");
    await db.exec(
      await readFile("supabase/personal/011_schedule_trash.sql", "utf8"),
    );
    assert.deepEqual(
      (
        await db.query(
          "select deleted_at,purge_after from ops_schedules where id=$1",
          [schedule],
        )
      ).rows[0],
      { deleted_at: null, purge_after: null },
    );

    await db.exec(
      `set role authenticated;set request.jwt.claim.sub='${OWNER}'`,
    );
    assert.equal(
      (await db.query("select ops_schedule_soft_delete($1) status", [schedule]))
        .rows[0].status,
      "deleted",
    );
    const firstDelete = (
      await db.query(
        "select deleted_at,purge_after,title,notes,project_id,starts_at,ends_at from ops_schedules where id=$1",
        [schedule],
      )
    ).rows[0];
    assert.equal(
      Date.parse(firstDelete.purge_after) - Date.parse(firstDelete.deleted_at),
      12 * 60 * 60 * 1000,
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int count from ops_schedules where deleted_at is null",
        )
      ).rows[0].count,
      0,
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int count from ops_schedules where deleted_at is not null and purge_after>clock_timestamp()",
        )
      ).rows[0].count,
      1,
    );
    await assert.rejects(
      db.query("delete from ops_schedules where id=$1", [schedule]),
      /permission denied/i,
    );
    await assert.rejects(
      db.query("update ops_schedules set deleted_at=null where id=$1", [
        schedule,
      ]),
      /permission denied/i,
    );

    assert.equal(
      (await db.query("select ops_schedule_soft_delete($1) status", [schedule]))
        .rows[0].status,
      "already_deleted",
    );
    const duplicateDelete = (
      await db.query(
        "select deleted_at,purge_after from ops_schedules where id=$1",
        [schedule],
      )
    ).rows[0];
    assert.equal(
      new Date(duplicateDelete.deleted_at).toISOString(),
      new Date(firstDelete.deleted_at).toISOString(),
    );
    assert.equal(
      new Date(duplicateDelete.purge_after).toISOString(),
      new Date(firstDelete.purge_after).toISOString(),
    );

    await db.exec(`set request.jwt.claim.sub='${OTHER}'`);
    assert.equal(
      (await db.query("select ops_schedule_soft_delete($1) status", [schedule]))
        .rows[0].status,
      "not_found",
    );
    assert.equal(
      (await db.query("select ops_schedule_restore($1) status", [schedule]))
        .rows[0].status,
      "not_found",
    );
    assert.equal(
      (await db.query("select count(*)::int count from ops_schedules")).rows[0]
        .count,
      0,
    );

    await db.exec(`set request.jwt.claim.sub='${OWNER}'`);
    assert.equal(
      (await db.query("select ops_schedule_restore($1) status", [schedule]))
        .rows[0].status,
      "restored",
    );
    assert.equal(
      (await db.query("select ops_schedule_restore($1) status", [schedule]))
        .rows[0].status,
      "already_active",
    );
    const restored = (
      await db.query(
        "select title,notes,project_id,starts_at,ends_at,deleted_at,purge_after from ops_schedules where id=$1",
        [schedule],
      )
    ).rows[0];
    assert.equal(restored.title, "복구 일정");
    assert.equal(restored.notes, "원문 보존");
    assert.equal(restored.project_id, project);
    assert.equal(
      new Date(restored.starts_at).toISOString(),
      "2026-10-13T14:30:00.000Z",
    );
    assert.equal(
      new Date(restored.ends_at).toISOString(),
      "2026-10-13T15:30:00.000Z",
    );
    assert.equal(restored.deleted_at, null);
    assert.equal(restored.purge_after, null);

    await db.query("select ops_schedule_soft_delete($1)", [schedule]);
    await db.exec("reset role");
    await db.query(
      `update ops_schedules
       set deleted_at=stamp.value,
           purge_after=stamp.value+interval '12 hours'
       from (select clock_timestamp()-interval '13 hours' value) stamp
       where id=$1`,
      [schedule],
    );
    await db.exec(
      `set role authenticated;set request.jwt.claim.sub='${OWNER}'`,
    );
    assert.equal(
      (await db.query("select ops_schedule_restore($1) status", [schedule]))
        .rows[0].status,
      "expired",
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int count from ops_schedules where deleted_at is not null and purge_after>clock_timestamp()",
        )
      ).rows[0].count,
      0,
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int count from ops_schedules where id=$1",
          [schedule],
        )
      ).rows[0].count,
      1,
    );
    await assert.rejects(
      db.query("select ops_purge_expired_schedules()"),
      /permission denied/i,
    );

    // A missed Cron run leaves the expired row available for the next retry.
    await db.exec("reset role");
    assert.equal(
      (await db.query("select ops_purge_expired_schedules() count")).rows[0]
        .count,
      1,
    );
    assert.equal(
      (await db.query("select ops_purge_expired_schedules() count")).rows[0]
        .count,
      0,
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int count from ops_schedules where id=$1",
          [schedule],
        )
      ).rows[0].count,
      0,
    );
  } finally {
    await db.close();
  }
});

test("격리 DB: 복구와 purge 경쟁의 두 직렬화 결과에서 일정이 되살아나지 않음", async () => {
  const db = new PGlite({ extensions: { btree_gist } });
  await db.waitReady;
  try {
    await db.exec(`
      create schema auth;create schema extensions;create role anon;create role authenticated;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth,public to authenticated,anon;
      insert into auth.users values('${OWNER}');
    `);
    for (const file of [
      "001_tasks.sql",
      "002_mvp.sql",
      "011_schedule_trash.sql",
    ])
      await db.exec(await readFile(`supabase/personal/${file}`, "utf8"));
    await db.exec(
      `set role authenticated;set request.jwt.claim.sub='${OWNER}'`,
    );
    const beforeDeadline = (
      await db.query(
        "insert into ops_schedules(title,starts_at,ends_at) values('복구 우선','2026-10-13T01:00Z','2026-10-13T02:00Z') returning id",
      )
    ).rows[0].id;
    await db.query("select ops_schedule_soft_delete($1)", [beforeDeadline]);
    assert.equal(
      (
        await db.query("select ops_schedule_restore($1) status", [
          beforeDeadline,
        ])
      ).rows[0].status,
      "restored",
    );
    await db.exec("reset role");
    assert.equal(
      (await db.query("select ops_purge_expired_schedules() count")).rows[0]
        .count,
      0,
    );

    await db.exec(
      `set role authenticated;set request.jwt.claim.sub='${OWNER}'`,
    );
    const purgeFirst = (
      await db.query(
        "insert into ops_schedules(title,starts_at,ends_at) values('폐기 우선','2026-10-13T03:00Z','2026-10-13T04:00Z') returning id",
      )
    ).rows[0].id;
    await db.query("select ops_schedule_soft_delete($1)", [purgeFirst]);
    await db.exec("reset role");
    await db.query(
      `update ops_schedules
       set deleted_at=stamp.value,
           purge_after=stamp.value+interval '12 hours'
       from (select clock_timestamp()-interval '13 hours' value) stamp
       where id=$1`,
      [purgeFirst],
    );
    assert.equal(
      (await db.query("select ops_purge_expired_schedules() count")).rows[0]
        .count,
      1,
    );
    await db.exec(
      `set role authenticated;set request.jwt.claim.sub='${OWNER}'`,
    );
    assert.equal(
      (await db.query("select ops_schedule_restore($1) status", [purgeFirst]))
        .rows[0].status,
      "not_found",
    );
  } finally {
    await db.close();
  }
});
