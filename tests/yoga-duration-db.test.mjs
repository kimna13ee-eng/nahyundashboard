import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";

const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const migrationPath = "supabase/personal/021_yoga_duration.sql";

test("SQL021 요가 시간: nullable·경계값·RLS·휴지통·push·권한·재적용 보존", async () => {
  const db = new PGlite({ extensions: { btree_gist } });
  await db.waitReady;
  try {
    await db.exec(`create schema auth;create schema extensions;create role anon;create role authenticated;create role service_role bypassrls;
      create table auth.users(id uuid primary key);insert into auth.users values('${OWNER}'),('${OTHER}');
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth,public to authenticated,anon,service_role;`);
    for (const file of [
      "001_tasks.sql",
      "002_mvp.sql",
      "012_schedule_trash.sql",
      "018_schedule_categories.sql",
      "019_personal_exercise_push.sql",
    ])
      await db.exec(await readFile(`supabase/personal/${file}`, "utf8"));

    await db.exec(
      `set role authenticated;set request.jwt.claim.sub='${OWNER}'`,
    );
    const original = (
      await db.query(
        "insert into ops_schedules(title,notes,starts_at,ends_at,category,video_url) values('기존 요가','기존 메모','2026-10-20T21:00:00+09:00','2026-10-20T22:00:00+09:00','exercise','https://video.example/existing') returning *",
      )
    ).rows[0];
    const sub = (
      await db.query(
        "insert into ops_push_subscriptions(endpoint,keys) values($1,$2::jsonb) returning *",
        [
          "https://web.push.apple.com/yoga-duration-fixture",
          JSON.stringify({ p256dh: "A".repeat(87), auth: "B".repeat(22) }),
        ],
      )
    ).rows[0];
    await db.exec("reset role");
    const rightsQuery =
      "select grantee,column_name,privilege_type from information_schema.column_privileges where table_schema='public' and table_name='ops_schedules' and column_name<>'duration_minutes' order by grantee,column_name,privilege_type";
    const securityQuery =
      "select relrowsecurity,relforcerowsecurity,relacl::text from pg_class where oid='ops_schedules'::regclass";
    const policiesQuery =
      "select policyname,roles,cmd,qual,with_check from pg_policies where schemaname='public' and tablename='ops_schedules' order by policyname";
    const functionsQuery =
      "select proname,pg_get_functiondef(oid) definition,proacl::text from pg_proc where pronamespace='public'::regnamespace and proname in ('ops_schedule_soft_delete','ops_schedule_restore','ops_purge_expired_schedules','ops_claim_exercise_push','ops_complete_exercise_push','ops_exercise_push_scheduler_ready') order by proname";
    const rights = (await db.query(rightsQuery)).rows;
    const security = (await db.query(securityQuery)).rows;
    const policies = (await db.query(policiesQuery)).rows;
    const functions = (await db.query(functionsQuery)).rows;
    const migration = await readFile(migrationPath, "utf8");
    await db.exec(migration);
    await db.exec(migration);
    assert.deepEqual((await db.query(rightsQuery)).rows, rights);
    assert.deepEqual((await db.query(securityQuery)).rows, security);
    assert.deepEqual((await db.query(policiesQuery)).rows, policies);
    assert.deepEqual((await db.query(functionsQuery)).rows, functions);
    assert.deepEqual(
      (await db.query("select * from ops_schedules where id=$1", [original.id]))
        .rows[0],
      { ...original, duration_minutes: null },
    );
    assert.deepEqual(
      (
        await db.query(
          "select privilege_type from information_schema.column_privileges where table_schema='public' and table_name='ops_schedules' and column_name='duration_minutes' and grantee='authenticated' order by privilege_type",
        )
      ).rows.map((row) => row.privilege_type),
      ["INSERT", "SELECT", "UPDATE"],
    );

    await db.exec(
      `set role authenticated;set request.jwt.claim.sub='${OWNER}'`,
    );
    for (const duration of [1, 1440, null, 37]) {
      await db.query(
        "update ops_schedules set duration_minutes=$2 where id=$1",
        [original.id, duration],
      );
      assert.equal(
        (
          await db.query(
            "select duration_minutes from ops_schedules where id=$1",
            [original.id],
          )
        ).rows[0].duration_minutes,
        duration,
      );
    }
    for (const duration of [0, -1, 1441, 2147483647])
      await assert.rejects(
        db.query("update ops_schedules set duration_minutes=$2 where id=$1", [
          original.id,
          duration,
        ]),
        /check constraint/i,
      );
    const inserted = (
      await db.query(
        "insert into ops_schedules(title,starts_at,ends_at,category,video_url,duration_minutes) values('신규 요가','2026-10-20T21:00:00+09:00','2026-10-20T22:00:00+09:00','exercise','https://video.example/new',15) returning *",
      )
    ).rows[0];
    assert.equal(inserted.duration_minutes, 15);
    await db.query("update ops_schedules set title='제목만 수정' where id=$1", [
      original.id,
    ]);
    assert.equal(
      (
        await db.query(
          "select duration_minutes from ops_schedules where id=$1",
          [original.id],
        )
      ).rows[0].duration_minutes,
      37,
    );
    for (const column of [
      "id",
      "owner_id",
      "created_at",
      "updated_at",
      "deleted_at",
      "purge_after",
    ])
      await assert.rejects(
        db.query(`update ops_schedules set ${column}=${column} where id=$1`, [
          original.id,
        ]),
        /permission denied/i,
      );
    await assert.rejects(
      db.query("delete from ops_schedules where id=$1", [original.id]),
      /permission denied/i,
    );
    await assert.rejects(
      db.query("select ops_purge_expired_schedules()"),
      /permission denied/i,
    );
    assert.equal(
      (
        await db.query("select ops_schedule_soft_delete($1) status", [
          original.id,
        ])
      ).rows[0].status,
      "deleted",
    );
    const trashed = (
      await db.query(
        "select duration_minutes,deleted_at,purge_after from ops_schedules where id=$1",
        [original.id],
      )
    ).rows[0];
    assert.equal(trashed.duration_minutes, 37);
    assert.equal(
      Date.parse(trashed.purge_after) - Date.parse(trashed.deleted_at),
      12 * 3600000,
    );
    assert.equal(
      (await db.query("select ops_schedule_restore($1) status", [original.id]))
        .rows[0].status,
      "restored",
    );
    assert.deepEqual(
      (
        await db.query(
          "select duration_minutes,video_url,notes,deleted_at,purge_after from ops_schedules where id=$1",
          [original.id],
        )
      ).rows[0],
      {
        duration_minutes: 37,
        video_url: original.video_url,
        notes: original.notes,
        deleted_at: null,
        purge_after: null,
      },
    );

    await db.exec(`set request.jwt.claim.sub='${OTHER}'`);
    assert.equal(
      (
        await db.query(
          "select duration_minutes from ops_schedules where id=$1",
          [original.id],
        )
      ).rows.length,
      0,
    );
    assert.equal(
      (
        await db.query(
          "update ops_schedules set duration_minutes=10 where id=$1 returning id",
          [original.id],
        )
      ).rows.length,
      0,
    );
    await assert.rejects(
      db.query(
        "insert into ops_schedules(owner_id,title,starts_at,ends_at,duration_minutes) values($1,'타인','2026-10-20T21:00:00+09:00','2026-10-20T22:00:00+09:00',20)",
        [OWNER],
      ),
      /row-level security/i,
    );
    assert.equal(
      (await db.query("select ops_schedule_restore($1) status", [original.id]))
        .rows[0].status,
      "not_found",
    );
    await db.exec("reset role;set role anon");
    await assert.rejects(
      db.query("select duration_minutes from ops_schedules"),
      /permission denied/i,
    );

    await db.exec("reset role");
    await db.exec(migration);
    assert.equal(
      (
        await db.query(
          "select duration_minutes from ops_schedules where id=$1",
          [original.id],
        )
      ).rows[0].duration_minutes,
      37,
    );
    assert.deepEqual(
      (
        await db.query("select * from ops_push_subscriptions where id=$1", [
          sub.id,
        ])
      ).rows[0],
      sub,
    );
    await db.exec("set role service_role");
    const deliveries = (
      await db.query(
        "select * from ops_claim_exercise_push(20,'2026-10-20T12:00:00Z'::timestamptz)",
      )
    ).rows;
    const delivery = deliveries.find((row) => row.schedule_id === original.id);
    assert.ok(delivery);
    assert.equal(delivery.video_url, original.video_url);
    assert.equal(delivery.title, "제목만 수정");
    assert.equal(
      (
        await db.query(
          "select ops_complete_exercise_push($1,$2,'sent',201,'','2026-10-20T12:00:00Z'::timestamptz) status",
          [delivery.delivery_id, delivery.claim_token],
        )
      ).rows[0].status,
      "sent",
    );
  } finally {
    await db.close();
  }
});
