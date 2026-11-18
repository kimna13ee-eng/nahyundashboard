import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("shooting memos preserve whitespace, isolate owners and reject stale edits", async () => {
  const db = new PGlite();
  const owner = "11111111-1111-4111-8111-111111111111";
  const other = "22222222-2222-4222-8222-222222222222";
  const id = "33333333-3333-4333-8333-333333333333";
  const q = async (sql, params = []) => (await db.query(sql, params)).rows;
  const become = (user) =>
    db.exec(
      `reset role; set role authenticated; set request.jwt.claim.sub='${user}'`,
    );
  try {
    await db.exec(`create schema auth; create role anon; create role authenticated;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth,public to authenticated,anon;`);
    await q("insert into auth.users values ($1),($2)", [owner, other]);
    const ddl = await readFile(
      "supabase/personal/032_shooting_skills.sql",
      "utf8",
    );
    await db.exec(ddl);
    await db.exec(ddl);
    await become(owner);
    const content = "  조명 45도\n\n카메라  고정\n";
    const [first] = await q(
      "insert into ops_shooting_skills(id,title,content) values($1,$2,$3) returning content,updated_at::text as stamp",
      [id, "실내 촬영", content],
    );
    assert.equal(first.content, content);
    await become(other);
    assert.deepEqual(await q("select * from ops_shooting_skills"), []);
    assert.deepEqual(
      await q("delete from ops_shooting_skills where id=$1 returning id", [id]),
      [],
    );
    await assert.rejects(
      q(
        "insert into ops_shooting_skills(owner_id,id,title,content) values($1,$2,$3,$4)",
        [owner, id, "침입", "내용"],
      ),
      /permission denied/,
    );
    await become(owner);
    await assert.rejects(
      q("update ops_shooting_skills set content='   ' where id=$1", [id]),
      /check constraint/,
    );
    const [updated] = await q(
      "update ops_shooting_skills set title=$1 where id=$2 and updated_at=$3 returning updated_at::text as stamp",
      ["촬영 설정", id, first.stamp],
    );
    assert.notEqual(updated.stamp, first.stamp);
    assert.deepEqual(
      await q(
        "update ops_shooting_skills set title=$1 where id=$2 and updated_at=$3 returning id",
        ["이전 수정", id, first.stamp],
      ),
      [],
    );
    assert.equal(
      (
        await q(
          "delete from ops_shooting_skills where id=$1 and updated_at=$2 returning id",
          [id, updated.stamp],
        )
      ).length,
      1,
    );
  } finally {
    await db.close();
  }
});
