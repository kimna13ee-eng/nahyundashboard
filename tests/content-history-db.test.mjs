import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
test("008 콘텐츠 수정·재검수·승인 이력과 단계 Task 연결", async () => {
  const db = new PGlite({ extensions: { btree_gist } });
  await db.waitReady;
  try {
    await db.exec(
      `create schema auth;create schema extensions;create role anon;create role authenticated;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated,anon;insert into auth.users values('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');`,
    );
    for (const f of [
      "001_tasks.sql",
      "002_mvp.sql",
      "003_phase2.sql",
      "004_calendar_recurrence.sql",
      "005_task_classification.sql",
      "006_personal_content.sql",
      "007_workflow.sql",
      "008_content_history.sql",
    ])
      await db.exec(await readFile(`supabase/personal/${f}`, "utf8"));
    await db.exec(
      "set role authenticated;set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111'",
    );
    const content = (
      await db.query(
        "insert into ops_content(title,stage,approval,personal_details) values('[QA] 제작','production','none','{\"type\":\"reel\",\"step\":\"editing\"}') returning id",
      )
    ).rows[0].id;
    const update = async (stage, approval, details) =>
      db.query(
        "update ops_content set stage=$1,approval=$2,personal_details=$3 where id=$4",
        [stage, approval, JSON.stringify(details), content],
      );
    await update("review", "pending", {
      type: "reel",
      step: "review",
      review: "pending",
      reviewer: "테스트 검수자",
      review_notes: "검수 대기",
    });
    await update("review", "pending", {
      type: "reel",
      step: "revision",
      review: "revision",
      change_reason: "자막 수정",
      review_notes: "가독성 개선",
    });
    await assert.rejects(
      update("published", "pending", { step: "published", review: "revision" }),
    );
    await update("production", "pending", {
      type: "reel",
      step: "editing",
      review: "revision",
      change_reason: "자막 수정",
    });
    await update("review", "pending", {
      type: "reel",
      step: "review",
      review: "pending",
      review_notes: "재검수",
    });
    await update("approval", "approved", {
      type: "reel",
      step: "scheduled",
      review: "approved",
      reviewed_at: "2026-10-10T09:00:00Z",
      reviewer: "테스트 검수자",
    });
    await update("results", "approved", {
      type: "reel",
      step: "results",
      review: "approved",
      published_at: "2026-10-10T10:00:00Z",
      metrics_at: "2026-10-11T10:00:00Z",
      views: 120,
    });
    const versions = (
      await db.query(
        "select version,snapshot from ops_content_versions where content_id=$1 order by version",
        [content],
      )
    ).rows;
    assert.equal(versions.length, 7);
    assert.equal(
      versions[2].snapshot.personal_details.change_reason,
      "자막 수정",
    );
    assert.equal(versions[6].snapshot.personal_details.views, 120);
    const task = (
      await db.query("select ops_content_task($1,'editing') id", [content])
    ).rows[0].id;
    assert.equal(
      (await db.query("select ops_content_task($1,'editing') id", [content]))
        .rows[0].id,
      task,
    );
    await db.query("select ops_timer('start',$1,gen_random_uuid(),'')", [task]);
    await db.query(
      "select ops_timer('finish',$1,gen_random_uuid(),'편집 테스트')",
      [task],
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from ops_content_tasks c join ops_work_sessions s on c.owner_id=s.owner_id and c.task_id=s.task_id where c.content_id=$1",
          [content],
        )
      ).rows[0].n,
      1,
    );
    await assert.rejects(
      db.query(
        "update ops_content_versions set snapshot='{}' where content_id=$1",
        [content],
      ),
    );
    await db.exec(
      "set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222'",
    );
    assert.equal(
      (await db.query("select * from ops_content_versions")).rows.length,
      0,
    );
    assert.equal(
      (await db.query("select * from ops_content_tasks")).rows.length,
      0,
    );
    await assert.rejects(
      db.query("select ops_content_task($1,'editing')", [content]),
    );
  } finally {
    await db.close();
  }
});
