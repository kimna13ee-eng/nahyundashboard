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
    create schema auth;
    create schema extensions;
    create role anon;
    create role authenticated;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth,public to authenticated,anon;
    insert into auth.users values('11111111-1111-4111-8111-111111111111');
  `);
  for (const file of ["001_tasks.sql", "002_mvp.sql"])
    await db.exec(fs.readFileSync(`supabase/personal/${file}`, "utf8"));
  await db.exec(`
    set role authenticated;
    set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
  `);

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
        json: { configured: true, user: { email: "ux@example.invalid" } },
      }),
    );
    await page.route("**/api/workflow?*", (route) =>
      route.fulfill({ json: { ready: false, data: {} } }),
    );
    await page.route("**/api/ops?*", async (route) => {
      const request = route.request();
      if (request.method() === "GET") {
        const data = {};
        for (const [name, table] of Object.entries(tables)) {
          data[name] = (
            await db.query(
              `select * from public.${table} order by created_at desc`,
            )
          ).rows.map((row) => ({
            ...row,
            ...(row.due_date
              ? { due_date: new Date(row.due_date).toISOString().slice(0, 10) }
              : {}),
          }));
        }
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
      const value = parseResource(body.resource, body.value);
      const keys = Object.keys(value),
        values = Object.values(value);
      await db.query(
        `insert into public.${tables[body.resource]}(${keys.join(",")}) values(${keys.map((_, index) => `$${index + 1}`).join(",")})`,
        values,
      );
      await route.fulfill({ json: { ok: true } });
    });

    await page.goto("http://127.0.0.1:3000");
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    await page.getByRole("button", { name: "업무 등록", exact: true }).click();
    assert.equal(
      await page.getByLabel("마감일", { exact: true }).inputValue(),
      today,
    );
    await page
      .getByLabel("제목", { exact: true })
      .fill("오늘 업무 즉시 표시 검증");
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await page
      .locator("section.ops-card")
      .filter({
        has: page.getByRole("heading", { name: "오늘의 업무", exact: true }),
      })
      .getByText("오늘 업무 즉시 표시 검증", { exact: true })
      .waitFor();
    const overviewTask = (
      await db.query(
        "select due_date from public.tasks where title='오늘 업무 즉시 표시 검증'",
      )
    ).rows[0];
    assert.equal(
      new Date(overviewTask.due_date).toISOString().slice(0, 10),
      today,
    );

    const nav = page.locator(".ops-sidebar nav");
    await nav.getByRole("button", { name: "Projects", exact: true }).click();
    await page.getByRole("button", { name: "업무 등록", exact: true }).click();
    assert.equal(
      await page.getByLabel("마감일", { exact: true }).inputValue(),
      "",
    );
    await page.getByRole("button", { name: "닫기", exact: true }).click();

    await nav.getByRole("button", { name: "Overview", exact: true }).click();
    await page.getByRole("button", { name: "일정 등록", exact: true }).click();
    assert.equal(
      await page.getByLabel("시작 (서울 시간)", { exact: true }).inputValue(),
      `${today}T09:00`,
    );
    await page.getByRole("button", { name: "닫기", exact: true }).click();

    await nav.getByRole("button", { name: "Calendar", exact: true }).click();
    const selectedDay = "2026-10-31",
      nextDay = "2026-11-01";
    await page
      .getByLabel("캘린더 기준 날짜", { exact: true })
      .fill(selectedDay);
    await page.getByRole("button", { name: "일정 등록", exact: true }).click();
    const start = page.getByLabel("시작 (서울 시간)", { exact: true }),
      end = page.getByLabel("종료 (서울 시간)", { exact: true });
    assert.equal(await start.inputValue(), `${selectedDay}T09:00`);
    assert.equal(await end.inputValue(), `${selectedDay}T10:00`);
    await start.fill(`${selectedDay}T23:30`);
    assert.equal(await end.inputValue(), `${nextDay}T00:30`);
    await end.fill(`${nextDay}T01:00`);
    await start.fill(`${selectedDay}T23:45`);
    assert.equal(await end.inputValue(), `${nextDay}T01:00`);
    await end.fill(`${selectedDay}T22:00`);
    await page
      .getByRole("alert")
      .getByText("종료시간은 시작시간보다 늦어야 합니다.", { exact: true })
      .waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "저장", exact: true })
        .isDisabled(),
      true,
    );
    await end.fill(`${nextDay}T01:00`);
    await page.getByLabel("제목", { exact: true }).fill("자정 넘김 일정");
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await page.getByRole("button", { name: "목록", exact: true }).click();
    await page.getByText("자정 넘김 일정", { exact: true }).waitFor();
    await page
      .getByRole("button", { name: "자정 넘김 일정 수정", exact: true })
      .click();
    assert.equal(await start.inputValue(), `${selectedDay}T23:45`);
    assert.equal(await end.inputValue(), `${nextDay}T01:00`);

    console.log(
      "PASS: Overview 오늘 업무·일정 기본값, Calendar 선택일·자정 넘김·수동 종료 유지",
    );
  } finally {
    await browser.close();
    await db.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
