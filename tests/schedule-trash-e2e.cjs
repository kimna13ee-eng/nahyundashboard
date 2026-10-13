const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE_PATH ||
    require("node:path").join(
      process.env.USERPROFILE,
      ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
    ),
);
const { PGlite } = require("@electric-sql/pglite");
const { btree_gist } = require("@electric-sql/pglite/contrib/btree_gist");
const fs = require("node:fs");
const assert = require("node:assert/strict");

(async () => {
  const db = new PGlite({ extensions: { btree_gist } });
  await db.waitReady;
  await db.exec(`
    create schema auth;create schema extensions;create role anon;create role authenticated;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth,public to authenticated,anon;
    insert into auth.users values('11111111-1111-4111-8111-111111111111');
  `);
  for (const file of ["001_tasks.sql", "002_mvp.sql", "011_schedule_trash.sql"])
    await db.exec(fs.readFileSync(`supabase/personal/${file}`, "utf8"));
  await db.exec(`
    set role authenticated;
    set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
  `);
  const project = (
    await db.query(
      "insert into ops_projects(title) values('원래 프로젝트') returning id",
    )
  ).rows[0].id;
  const schedule = (
    await db.query(
      "insert into ops_schedules(title,notes,starts_at,ends_at,project_id) values('휴지통 검증 일정','원래 메모','2026-10-13T09:00:00+09:00','2026-10-13T10:00:00+09:00',$1) returning id",
      [project],
    )
  ).rows[0].id;
  await db.query("insert into tasks(title) values('삭제 확인 유지 업무')");

  const { parseResource } = await import("../src/lib/ops.ts");
  const tables = {
    projects: "ops_projects",
    tasks: "tasks",
    task_notes: "ops_task_notes",
    note_versions: "ops_note_versions",
    schedules: "ops_schedules",
    work_sessions: "ops_work_sessions",
    session_intervals: "ops_session_intervals",
    session_events: "ops_session_events",
    work_journal: "ops_work_journal",
    library_items: "ops_library_items",
    prompt_versions: "ops_prompt_versions",
  };
  const browser = await chromium.launch({ headless: true, channel: "msedge" });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    await page.route("**/api/session", (route) =>
      route.fulfill({
        json: { configured: true, user: { email: "trash@example.invalid" } },
      }),
    );
    await page.route("**/api/workflow?*", (route) =>
      route.fulfill({ json: { ready: false, data: {} } }),
    );
    await page.route("**/api/ops?*", async (route) => {
      try {
        const request = route.request();
        if (request.method() === "GET") {
          const data = {};
          for (const [name, table] of Object.entries(tables)) {
            const where =
              name === "schedules" ? " where deleted_at is null" : "";
            data[name] = (
              await db.query(
                `select * from public.${table}${where} order by created_at desc`,
              )
            ).rows.map((row) => ({
              ...row,
              ...(row.due_date
                ? {
                    due_date: new Date(row.due_date).toISOString().slice(0, 10),
                  }
                : {}),
            }));
          }
          data.deleted_schedules = (
            await db.query(
              "select * from ops_schedules where deleted_at is not null and purge_after>clock_timestamp() order by deleted_at desc",
            )
          ).rows;
          await route.fulfill({
            json: {
              data,
              serverNow: new Date().toISOString(),
              truncated: [],
              companyConnected: false,
            },
          });
          return;
        }
        const body = request.postDataJSON();
        if (body.action === "restore_schedule") {
          const status = (
            await db.query("select ops_schedule_restore($1) status", [body.id])
          ).rows[0].status;
          await route.fulfill({ json: { ok: true, status } });
          return;
        }
        if (request.method() === "DELETE" && body.resource === "schedules") {
          const status = (
            await db.query("select ops_schedule_soft_delete($1) status", [
              body.id,
            ])
          ).rows[0].status;
          await route.fulfill({ json: { ok: true, status } });
          return;
        }
        if (request.method() === "DELETE") {
          await db.query(
            `delete from public.${tables[body.resource]} where id=$1`,
            [body.id],
          );
          await route.fulfill({ json: { ok: true } });
          return;
        }
        const value = parseResource(body.resource, body.value),
          keys = Object.keys(value),
          values = Object.values(value);
        await db.query(
          `insert into public.${tables[body.resource]}(${keys.join(",")}) values(${keys.map((_, index) => `$${index + 1}`).join(",")})`,
          values,
        );
        await route.fulfill({ json: { ok: true } });
      } catch (error) {
        await route.fulfill({
          status: 409,
          json: { error: `격리 DB 요청 실패: ${error.message}` },
        });
      }
    });

    await page.goto("http://127.0.0.1:3000");
    const nav = page.locator(".ops-sidebar nav");
    await nav.getByRole("button", { name: "Calendar", exact: true }).click();
    await page
      .getByLabel("캘린더 기준 날짜", { exact: true })
      .fill("2026-10-13");
    await page.getByRole("button", { name: "목록", exact: true }).click();
    await page.getByText("휴지통 검증 일정", { exact: true }).waitFor();
    assert.equal(await page.getByRole("dialog").count(), 0);
    await page
      .getByRole("button", {
        name: "휴지통 검증 일정 휴지통으로 이동",
        exact: true,
      })
      .click();
    await page.getByText("일정 휴지통 (1)", { exact: true }).click();
    await page
      .getByRole("button", { name: "휴지통 검증 일정 복구", exact: true })
      .waitFor();
    assert.equal(
      await page
        .getByRole("button", {
          name: "휴지통 검증 일정 휴지통으로 이동",
          exact: true,
        })
        .count(),
      0,
    );
    await page
      .getByRole("button", { name: "휴지통 검증 일정 복구", exact: true })
      .click();
    await page.getByText("일정 휴지통 (0)", { exact: true }).waitFor();
    await page
      .getByRole("button", {
        name: "휴지통 검증 일정 휴지통으로 이동",
        exact: true,
      })
      .waitFor();

    const restored = (
      await db.query(
        "select title,notes,project_id,starts_at,ends_at,deleted_at,purge_after from ops_schedules where id=$1",
        [schedule],
      )
    ).rows[0];
    assert.equal(restored.title, "휴지통 검증 일정");
    assert.equal(restored.notes, "원래 메모");
    assert.equal(restored.project_id, project);
    assert.equal(
      new Date(restored.starts_at).toISOString(),
      "2026-10-13T00:00:00.000Z",
    );
    assert.equal(
      new Date(restored.ends_at).toISOString(),
      "2026-10-13T01:00:00.000Z",
    );
    assert.equal(restored.deleted_at, null);
    assert.equal(restored.purge_after, null);

    await nav.getByRole("button", { name: "Projects", exact: true }).click();
    await page
      .getByRole("button", { name: "삭제 확인 유지 업무 삭제", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "항목을 삭제할까요?", exact: true })
      .waitFor();

    console.log(
      "PASS: Calendar 일정 즉시 soft delete·휴지통·복구 및 업무 삭제 확인 유지",
    );
  } finally {
    await browser.close();
    await db.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
