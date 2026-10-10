import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
test("006은 기존 콘텐츠를 보존하며 개인 제작·성과 저장과 교차 소유자 차단", async () => {
  const db = new PGlite({ extensions: { btree_gist } });
  await db.waitReady;
  try {
    await db.exec(
      `create schema auth;create schema extensions;create role anon;create role authenticated;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated,anon;insert into auth.users values('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');`,
    );
    for (const file of [
      "001_tasks.sql",
      "002_mvp.sql",
      "003_phase2.sql",
      "004_calendar_recurrence.sql",
      "005_task_classification.sql",
    ])
      await db.exec(await readFile(`supabase/personal/${file}`, "utf8"));
    await db.exec(
      "set role authenticated;set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111'",
    );
    const old = (
      await db.query(
        "insert into ops_content(title,stage,approval) values('기존 보존 검증','idea','none') returning id",
      )
    ).rows[0].id;
    await db.exec("reset role");
    await db.exec(
      await readFile("supabase/personal/006_personal_content.sql", "utf8"),
    );
    await db.exec(
      await readFile("supabase/personal/006_personal_content.sql", "utf8"),
    );
    await db.exec("set role authenticated");
    assert.equal(
      (
        await db.query("select personal_details from ops_content where id=$1", [
          old,
        ])
      ).rows[0].personal_details,
      null,
    );
    const row = (
      await db.query(
        "insert into ops_content(title,stage,approval,personal_details) values('[QA 테스트] 개인 릴스','production','none',$1) returning id",
        [
          JSON.stringify({
            type: "reel",
            step: "shooting",
            review: "none",
            shoot_at: "2026-10-11T00:00:00Z",
            edit_at: "2026-10-12T00:00:00Z",
          }),
        ],
      )
    ).rows[0].id;
    await db.query(
      "update ops_content set stage='results',approval='approved',publish_at='2026-10-13T00:00:00Z',result_url='https://example.com/qa',personal_details=$1 where id=$2",
      [
        JSON.stringify({
          type: "reel",
          step: "results",
          review: "approved",
          shoot_at: "2026-10-11T00:00:00Z",
          edit_at: "2026-10-12T00:00:00Z",
          published_at: "2026-10-13T00:01:00Z",
          metrics_at: "2026-10-14T00:01:00Z",
          views: 120,
        }),
        row,
      ],
    );
    assert.equal(
      (
        await db.query("select personal_details from ops_content where id=$1", [
          row,
        ])
      ).rows[0].personal_details.views,
      120,
    );
    await assert.rejects(
      db.query("update ops_content set personal_details='[]' where id=$1", [
        row,
      ]),
    );
    await db.exec(
      "set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222'",
    );
    assert.equal((await db.query("select * from ops_content")).rows.length, 0);
    assert.equal(
      (
        await db.query(
          "update ops_content set title='침범' where id=$1 returning id",
          [row],
        )
      ).rows.length,
      0,
    );
    await assert.rejects(
      db.query(
        "insert into ops_content(owner_id,title,stage,approval) values('11111111-1111-4111-8111-111111111111','침범','idea','none')",
      ),
    );
  } finally {
    await db.close();
  }
});
