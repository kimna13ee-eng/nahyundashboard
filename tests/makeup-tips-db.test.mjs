import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("private makeup tips keep attachments atomic and reject stale edits and create retries after deletion", async () => {
  const db = new PGlite();
  const owner = "11111111-1111-4111-8111-111111111111";
  const other = "22222222-2222-4222-8222-222222222222";
  const tip = "33333333-3333-4333-8333-333333333333";
  const second = "44444444-4444-4444-8444-444444444444";
  const sql = (query, args = []) =>
    db.query(query, args).then((res) => res.rows);
  const become = (id) =>
    db.exec(
      "reset role; set role authenticated; set request.jwt.claim.sub='" +
        id +
        "'",
    );
  const create = (id, content, image = null, thumb = null) =>
    sql(
      "select id,content,has_photo,updated_at::text as stamp from ops_create_makeup_tip($1,$2,decode($3,'hex'),decode($4,'hex'))",
      [id, content, image, thumb],
    );
  try {
    await db.exec(`create schema auth; create role anon; create role authenticated;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth, public to authenticated,anon;`);
    await sql("insert into auth.users values ($1),($2)", [owner, other]);
    const ddl = await readFile("supabase/personal/031_makeup_tips.sql", "utf8");
    await db.exec(ddl);
    await db.exec(ddl);
    await become(owner);
    await assert.rejects(create(tip, "  "), /check constraint/i);
    await assert.rejects(create(tip, "팁", "", null), /check constraint/i);
    await assert.rejects(create(tip, "팁", null, "01"), /check constraint/i);
    const [initial] = await create(tip, "", "0102", "03");
    assert.equal(initial.has_photo, true);
    assert.deepEqual(await create(tip, "", "0102", "03"), [initial]);
    await assert.rejects(create(tip, "", "ff", "03"), /Tip changed/);
    await assert.rejects(create(tip, "", "0102", "04"), /Tip changed/);
    const [memo] = await create(second, "브러시 세척");
    assert.equal(memo.has_photo, false);
    await become(other);
    assert.deepEqual(await sql("select image from ops_makeup_tips"), []);
    assert.deepEqual(
      await sql(
        "update ops_makeup_tips set content='x' where id=$1 returning id",
        [tip],
      ),
      [],
    );
    await create(tip, "다른 소유자", "05");
    await become(owner);
    const [replaced] = await sql(
      "update ops_makeup_tips set content=$3,image=decode('ff','hex'),thumbnail=null where id=$1 and updated_at=$2 returning updated_at::text as stamp",
      [tip, initial.stamp, "로즈"],
    );
    assert.notEqual(replaced.stamp, initial.stamp);
    assert.deepEqual(
      await sql(
        "update ops_makeup_tips set content='late' where id=$1 and updated_at=$2 returning id",
        [tip, initial.stamp],
      ),
      [],
    );
    assert.deepEqual(
      await sql(
        "update ops_makeup_tips set image=null,thumbnail=null where id=$1 and updated_at=$2 returning has_photo,content",
        [tip, replaced.stamp],
      ),
      [{ has_photo: false, content: "로즈" }],
    );
    await assert.rejects(
      sql("update ops_makeup_tips set content='' where id=$1", [tip]),
      /check constraint/i,
    );
    await sql(
      "update ops_makeup_tips set deleted=true,content='',image=null,thumbnail=null where id=$1",
      [tip],
    );
    assert.deepEqual(
      await sql("select id from ops_makeup_tips where not deleted"),
      [{ id: second }],
    );
    await assert.rejects(create(tip, "", "0102", "03"), /Tip changed/);
    await become(other);
    assert.deepEqual(
      await sql("select content from ops_makeup_tips where not deleted"),
      [{ content: "다른 소유자" }],
    );
    await db.exec("reset role; set role anon");
    await assert.rejects(
      sql("select * from ops_makeup_tips"),
      /permission denied/i,
    );
    await assert.rejects(create(second, "팁"), /permission denied/i);
  } finally {
    await db.close();
  }
});
