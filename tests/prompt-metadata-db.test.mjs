import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
test("009 프롬프트 승인 버전·원문·복원·메타데이터 소유자 경계", async () => {
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
      "009_prompt_metadata.sql",
    ])
      await db.exec(await readFile(`supabase/personal/${f}`, "utf8"));
    await db.exec(
      "set role authenticated;set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111'",
    );
    const original = "  원문\n\n코드: ${literal}\n";
    const item = (
      await db.query(
        "insert into ops_library_items(title,kind,category,body,tool,change_reason) values('[QA] 프롬프트','prompt','개발',$1,'Codex','초기') returning id",
        [original],
      )
    ).rows[0].id;
    const initial = (
      await db.query(
        "select id,body from ops_prompt_versions where item_id=$1",
        [item],
      )
    ).rows[0];
    assert.equal(initial.body, original);
    await db.query(
      "update ops_library_items set body='수정 원문',change_reason='구조 개선',approved_version_id=$1 where id=$2",
      [initial.id, item],
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from ops_prompt_versions where item_id=$1",
          [item],
        )
      ).rows[0].n,
      2,
    );
    await db.query("update ops_library_items set favorite=true where id=$1", [
      item,
    ]);
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from ops_prompt_versions where item_id=$1",
          [item],
        )
      ).rows[0].n,
      2,
    );
    await db.query(
      "update ops_library_items set body=$1,change_reason='이전 버전 복원' where id=$2",
      [initial.body, item],
    );
    assert.equal(
      (await db.query("select body from ops_library_items where id=$1", [item]))
        .rows[0].body,
      original,
    );
    await assert.rejects(
      db.query("update ops_prompt_versions set body='변조' where id=$1", [
        initial.id,
      ]),
    );
    const other = (
      await db.query(
        "insert into ops_library_items(title,kind,category) values('[QA] 다른 항목','prompt','개발') returning id",
      )
    ).rows[0].id;
    await assert.rejects(
      db.query(
        "update ops_library_items set approved_version_id=$1 where id=$2",
        [initial.id, other],
      ),
    );
    const task = (
      await db.query(
        "insert into tasks(title) values('[QA] 메모') returning id",
      )
    ).rows[0].id;
    await db.query(
      "insert into ops_task_notes(task_id,body,kind) values($1,'메모','general')",
      [task],
    );
    assert.equal(
      (await db.query("select count(*)::int n from ops_note_versions")).rows[0]
        .n,
      1,
    );
    await db.exec(
      "set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222'",
    );
    assert.equal(
      (await db.query("select * from ops_prompt_versions")).rows.length,
      0,
    );
  } finally {
    await db.close();
  }
});
