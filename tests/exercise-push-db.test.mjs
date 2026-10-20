import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";

const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const DUE = "2026-10-20T12:00:00Z";
const KEYS = { p256dh: "A".repeat(87), auth: "B".repeat(22) };
const migrationPath = "supabase/personal/019_personal_exercise_push.sql";

async function setup() {
  const db = new PGlite({ extensions: { btree_gist } });
  await db.waitReady;
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
  return db;
}

async function owner(db, id = OWNER) {
  await db.exec(
    `reset role;set role authenticated;set request.jwt.claim.sub='${id}'`,
  );
}
async function service(db) {
  await db.exec("reset role;set role service_role");
}
async function subscription(db, label = "owner") {
  return (
    await db.query(
      "insert into ops_push_subscriptions(endpoint,keys) values($1,$2::jsonb) returning *",
      [`https://web.push.apple.com/fixture-${label}`, JSON.stringify(KEYS)],
    )
  ).rows[0];
}
async function schedule(
  db,
  title = "개인 운동",
  start = "2026-10-20T09:00:00+09:00",
  category = "exercise",
  url = "https://example.invalid/yoga/today",
) {
  return (
    await db.query(
      "insert into ops_schedules(title,starts_at,ends_at,category,video_url) values($1,$2::timestamptz,$2::timestamptz+interval '30 minutes',$3,$4) returning *",
      [title, start, category, url],
    )
  ).rows[0];
}
async function claim(db, at = DUE, limit = 20) {
  return (
    await db.query(
      "select * from ops_claim_exercise_push($1,$2::timestamptz)",
      [limit, at],
    )
  ).rows;
}
async function complete(db, row, outcome, at = DUE, status = null, error = "") {
  return (
    await db.query(
      "select ops_complete_exercise_push($1,$2,$3,$4,$5,$6::timestamptz) result",
      [row.delivery_id, row.claim_token, outcome, status, error, at],
    )
  ).rows[0].result;
}

test("SQL019 기기 등록: 소유자 격리·공개 발송 차단·입력 검증·재적용 보존", async () => {
  const db = await setup();
  try {
    await owner(db);
    const sub = await subscription(db);
    const item = await schedule(db);
    await db.query(
      "update ops_push_subscriptions set last_test_at=$1 where id=$2",
      [DUE, sub.id],
    );
    for (const column of ["id", "owner_id", "created_at", "updated_at"])
      await assert.rejects(
        db.query(
          `update ops_push_subscriptions set ${column}=${column} where id=$1`,
          [sub.id],
        ),
        /permission denied/i,
      );
    for (const endpoint of [
      "http://web.push.apple.com/x",
      "https://127.0.0.1/private",
      "https://fcm.googleapis.com.evil.test/x",
      "https://user@web.push.apple.com/x",
      "https://web.push.apple.com:8443/x",
      "https://web.push.apple.com/x\n",
    ])
      await assert.rejects(
        db.query(
          "insert into ops_push_subscriptions(endpoint,keys) values($1,$2::jsonb)",
          [endpoint, JSON.stringify(KEYS)],
        ),
      );
    for (const keys of [
      {},
      [],
      { ...KEYS, extra: "not subscription data" },
      { ...KEYS, auth: "short" },
      { ...KEYS, p256dh: null },
    ])
      await assert.rejects(
        db.query(
          "update ops_push_subscriptions set keys=$1::jsonb where id=$2",
          [JSON.stringify(keys), sub.id],
        ),
      );
    await assert.rejects(claim(db), /permission denied/i);
    await assert.rejects(
      db.query("select ops_complete_exercise_push($1,$1,'sent')", [sub.id]),
      /permission denied/i,
    );
    await assert.rejects(
      db.query("select * from ops_exercise_push_deliveries"),
      /permission denied/i,
    );
    await owner(db, OTHER);
    assert.equal(
      (
        await db.query("select * from ops_push_subscriptions where id=$1", [
          sub.id,
        ])
      ).rows.length,
      0,
    );
    assert.equal(
      (
        await db.query(
          "update ops_push_subscriptions set enabled=false where id=$1 returning id",
          [sub.id],
        )
      ).rows.length,
      0,
    );
    await assert.rejects(
      db.query(
        "insert into ops_push_subscriptions(owner_id,endpoint,keys) values($1,$2,$3::jsonb)",
        [
          OWNER,
          "https://web.push.apple.com/foreign-owner",
          JSON.stringify(KEYS),
        ],
      ),
      /row-level security/i,
    );
    await assert.rejects(
      db.query(
        "insert into ops_push_subscriptions(endpoint,keys) values($1,$2::jsonb)",
        [sub.endpoint, JSON.stringify(KEYS)],
      ),
      /unique constraint/i,
    );
    const otherSub = await subscription(db, "other");
    await service(db);
    const [delivery] = await claim(db);
    assert.equal(delivery.owner_id, OWNER);
    assert.equal(delivery.schedule_id, item.id);
    assert.equal(delivery.subscription_id, sub.id);
    await assert.rejects(
      db.query(
        "insert into ops_exercise_push_deliveries(owner_id,schedule_id,subscription_id,exercise_day,due_at,next_attempt_at) values($1,$2,$3,'2026-10-20',$4,$4)",
        [OTHER, item.id, otherSub.id, DUE],
      ),
      /foreign key constraint/i,
    );
    const before = {
      subscriptions: (
        await db.query("select * from ops_push_subscriptions order by id")
      ).rows,
      deliveries: (
        await db.query("select * from ops_exercise_push_deliveries order by id")
      ).rows,
      schedule: (
        await db.query("select * from ops_schedules where id=$1", [item.id])
      ).rows,
    };
    await db.exec("reset role");
    // Historical column grants must not weaken identity or delivery protection.
    await db.exec(
      "grant update(owner_id,created_at) on ops_push_subscriptions to authenticated;grant select(endpoint) on ops_push_subscriptions to anon;grant select(claim_token),update(state) on ops_exercise_push_deliveries to authenticated;",
    );
    await db.exec(await readFile(migrationPath, "utf8"));
    await service(db);
    assert.deepEqual(
      (await db.query("select * from ops_push_subscriptions order by id")).rows,
      before.subscriptions,
    );
    assert.deepEqual(
      (await db.query("select * from ops_exercise_push_deliveries order by id"))
        .rows,
      before.deliveries,
    );
    assert.deepEqual(
      (await db.query("select * from ops_schedules where id=$1", [item.id]))
        .rows,
      before.schedule,
    );
    await owner(db);
    await assert.rejects(
      db.query("update ops_push_subscriptions set owner_id=owner_id"),
      /permission denied/i,
    );
    await assert.rejects(
      db.query("select claim_token from ops_exercise_push_deliveries"),
      /permission denied/i,
    );
    await db.exec("reset role;set role anon");
    await assert.rejects(
      db.query("select endpoint from ops_push_subscriptions"),
      /permission denied/i,
    );
    await assert.rejects(claim(db), /permission denied/i);
    await db.exec("reset role");
    assert.deepEqual(
      (
        await db.query(
          "select proname,prosecdef from pg_proc where proname in ('ops_claim_exercise_push','ops_complete_exercise_push') order by proname",
        )
      ).rows.map((row) => row.prosecdef),
      [false, false],
    );
    assert.equal(
      (
        await db.query(
          "select bool_and(relrowsecurity and relforcerowsecurity) enabled from pg_class where oid in ('ops_push_subscriptions'::regclass,'ops_exercise_push_deliveries'::regclass)",
        )
      ).rows[0].enabled,
      true,
    );
    await owner(db);
    await db.query("delete from ops_push_subscriptions where id=$1", [sub.id]);
    await service(db);
    assert.equal(
      (
        await db.query(
          "select count(*)::int count from ops_exercise_push_deliveries",
        )
      ).rows[0].count,
      0,
    );
    assert.equal(
      (await db.query("select id from ops_push_subscriptions")).rows[0].id,
      otherSub.id,
    );
  } finally {
    await db.close();
  }
});

test("SQL019 발송 대상: 한국 날짜21시·URL있는운동·휴지통제외·소유자별활성기기", async () => {
  const db = await setup();
  try {
    await owner(db);
    const sub = await subscription(db);
    await subscription(db, "disabled");
    await db.exec(
      "update ops_push_subscriptions set enabled=false where endpoint like '%disabled'",
    );
    const midnight = await schedule(
      db,
      "한국 날짜 운동",
      "2026-10-19T15:00:00Z",
    );
    const second = await schedule(
      db,
      "다른 URL",
      "2026-10-20T13:00:00+09:00",
      "exercise",
      "https://example.invalid/yoga/second",
    );
    await schedule(db, "UTC로20일이지만한국은내일", "2026-10-20T15:00:00Z");
    await schedule(db, "어제", "2026-10-19T09:00:00+09:00");
    await schedule(db, "일반업무", undefined, "work");
    await schedule(db, "영상없는운동", undefined, "exercise", "");
    const trashed = await schedule(db, "휴지통운동");
    await db.query("select ops_schedule_soft_delete($1)", [trashed.id]);
    await owner(db, OTHER);
    const otherSub = await subscription(db, "other");
    const otherSchedule = await schedule(db, "다른 소유자 운동");
    await service(db);
    assert.equal((await claim(db, "2026-10-20T11:59:59Z")).length, 0);
    const results = await claim(db);
    assert.equal(results.length, 3);
    assert.deepEqual(
      new Set(results.map((row) => row.schedule_id)),
      new Set([midnight.id, second.id, otherSchedule.id]),
    );
    for (const row of results) {
      assert.equal(
        new Date(row.due_at).toISOString(),
        "2026-10-20T12:00:00.000Z",
      );
      assert.equal(
        row.subscription_id,
        row.owner_id === OWNER ? sub.id : otherSub.id,
      );
      assert.equal(row.attempts, 1);
      assert.deepEqual(row.keys, KEYS);
    }
    assert.equal(
      results.find((row) => row.schedule_id === second.id).video_url,
      "https://example.invalid/yoga/second",
    );
    assert.equal((await claim(db)).length, 0);
    for (const row of results)
      assert.equal(await complete(db, row, "sent", DUE, 201), "sent");
    assert.equal((await claim(db, "2026-10-20T12:29:00Z")).length, 0);
    assert.equal((await claim(db, "2026-10-20T12:30:00Z")).length, 0);
    await assert.rejects(claim(db, DUE, 0), /limit/i);
    await assert.rejects(claim(db, DUE, 51), /limit/i);
  } finally {
    await db.close();
  }
});

test("SQL019 임대·재시도: 중복claim차단·새토큰·stale완료무효·최대3회", async () => {
  const db = await setup();
  try {
    await owner(db);
    await subscription(db);
    await schedule(db);
    await service(db);
    const [first] = await claim(db);
    assert.equal((await claim(db, "2026-10-20T12:01:59Z")).length, 0);
    const [second] = await claim(db, "2026-10-20T12:02:00Z");
    assert.equal(second.delivery_id, first.delivery_id);
    assert.notEqual(second.claim_token, first.claim_token);
    assert.equal(second.attempts, 2);
    assert.equal(
      await complete(db, first, "sent", "2026-10-20T12:02:01Z", 201),
      "stale",
    );
    assert.equal(
      await complete(
        db,
        second,
        "retry",
        "2026-10-20T12:02:01Z",
        503,
        "temporary",
      ),
      "retry",
    );
    assert.equal((await claim(db, "2026-10-20T12:03:00Z")).length, 0);
    const [third] = await claim(db, "2026-10-20T12:03:01Z");
    assert.equal(third.attempts, 3);
    assert.equal(
      await complete(db, second, "failed", "2026-10-20T12:03:02Z", 500),
      "stale",
    );
    assert.equal(
      await complete(db, third, "retry", "2026-10-20T12:03:02Z", 503),
      "failed",
    );
    assert.equal((await claim(db, "2026-10-20T12:10:00Z")).length, 0);
    assert.equal(
      (
        await db.query(
          "select count(*)::int count from ops_exercise_push_deliveries",
        )
      ).rows[0].count,
      1,
    );
    assert.equal(
      (
        await db.query(
          "select attempts,state from ops_exercise_push_deliveries",
        )
      ).rows[0].attempts,
      3,
    );
    await owner(db);
    const lost = await schedule(db, "최종 발송 작업 중단");
    await service(db);
    const [lostFirst] = await claim(db, "2026-10-20T12:10:00Z");
    const [lostSecond] = await claim(db, "2026-10-20T12:12:00Z");
    const [lostThird] = await claim(db, "2026-10-20T12:14:00Z");
    assert.equal(lostFirst.schedule_id, lost.id);
    assert.equal(lostSecond.attempts, 2);
    assert.equal(lostThird.attempts, 3);
    assert.equal((await claim(db, "2026-10-20T12:16:00Z")).length, 0);
    const expired = (
      await db.query(
        "select state,last_error from ops_exercise_push_deliveries where schedule_id=$1",
        [lost.id],
      )
    ).rows[0];
    assert.deepEqual(expired, {
      state: "failed",
      last_error: "retry_limit_reached",
    });
  } finally {
    await db.close();
  }
});

test("SQL019 해지/수정/410: 현재설정재검증·만료기기정지·성공콜백멱등·30분창종료", async () => {
  const db = await setup();
  try {
    await owner(db);
    const sub = await subscription(db);
    const item = await schedule(db);
    await service(db);
    const [first] = await claim(db);
    assert.equal(await complete(db, first, "retry", DUE, 500), "retry");
    await owner(db);
    await db.query("update ops_schedules set video_url='' where id=$1", [
      item.id,
    ]);
    await service(db);
    assert.equal((await claim(db, "2026-10-20T12:01:00Z")).length, 0);
    await owner(db);
    await db.query(
      "update ops_schedules set video_url='https://example.invalid/yoga/changed' where id=$1",
      [item.id],
    );
    await db.query(
      "update ops_push_subscriptions set enabled=false where id=$1",
      [sub.id],
    );
    await service(db);
    assert.equal((await claim(db, "2026-10-20T12:01:00Z")).length, 0);
    await owner(db);
    await db.query(
      "update ops_push_subscriptions set enabled=true where id=$1",
      [sub.id],
    );
    await service(db);
    const [second] = await claim(db, "2026-10-20T12:01:00Z");
    assert.equal(second.video_url, "https://example.invalid/yoga/changed");
    assert.equal(
      await complete(db, second, "gone", "2026-10-20T12:01:01Z", 410),
      "gone",
    );
    assert.equal(
      (
        await db.query(
          "select enabled from ops_push_subscriptions where id=$1",
          [sub.id],
        )
      ).rows[0].enabled,
      false,
    );
    assert.equal((await claim(db, "2026-10-20T12:03:00Z")).length, 0);
    await owner(db);
    await subscription(db, "fresh");
    await service(db);
    const [fresh] = await claim(db, "2026-10-20T12:28:59Z");
    assert.equal(
      await complete(db, fresh, "sent", "2026-10-20T12:29:00Z", 201),
      "sent",
    );
    const saved = (
      await db.query("select * from ops_exercise_push_deliveries where id=$1", [
        fresh.delivery_id,
      ])
    ).rows[0];
    assert.equal(
      await complete(db, fresh, "failed", "2026-10-20T12:29:01Z", 500),
      "sent",
    );
    assert.deepEqual(
      (
        await db.query(
          "select * from ops_exercise_push_deliveries where id=$1",
          [fresh.delivery_id],
        )
      ).rows[0],
      saved,
    );
    await owner(db);
    const late = await schedule(db, "창 끝 근처 등록");
    await service(db);
    const [lateClaim] = (await claim(db, "2026-10-20T12:29:10Z")).filter(
      (row) => row.schedule_id === late.id,
    );
    assert.equal(
      await complete(db, lateClaim, "retry", "2026-10-20T12:29:11Z", 503),
      "failed",
    );
    await owner(db);
    await schedule(db, "창 끝 다음 등록");
    await service(db);
    assert.equal((await claim(db, "2026-10-20T12:30:00Z")).length, 0);
  } finally {
    await db.close();
  }
});

test("SQL019 예약 준비 상태는 선택적 Cron 메타데이터만 관리자에게 boolean으로 반환", async () => {
  const db = await setup();
  try {
    await service(db);
    const ready = async () =>
      (await db.query("select ops_exercise_push_scheduler_ready() ready"))
        .rows[0].ready;
    assert.equal(await ready(), false);
    await owner(db);
    await assert.rejects(ready(), /permission denied/i);
    await db.exec("reset role;set role anon");
    await assert.rejects(ready(), /permission denied/i);
    await db.exec(`reset role;create schema cron;
      create table cron.job(jobid bigint primary key,jobname text,active boolean);
      revoke all on cron.job from public,anon,authenticated,service_role;
      insert into cron.job values(1,'unrelated-active-job',true),(2,'ops-exercise-push-2100',false);`);
    await service(db);
    assert.equal(await ready(), false);
    await assert.rejects(
      db.query("select * from cron.job"),
      /permission denied/i,
    );
    await db.exec("reset role;update cron.job set active=true where jobid=2");
    await service(db);
    assert.equal(await ready(), true);
    await db.exec("reset role;drop table cron.job");
    await service(db);
    assert.equal(await ready(), false);
  } finally {
    await db.close();
  }
});
