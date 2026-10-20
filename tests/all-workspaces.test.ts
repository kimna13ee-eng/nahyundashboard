import assert from "node:assert/strict";
import test from "node:test";
import {
  emptyWorkspaceSnapshot,
  loadWorkspaceSnapshot,
  workspaceCalendarItems,
} from "../src/lib/all-workspaces.ts";
import { weeklyScheduleRows } from "../src/lib/overview-summary.ts";

function reader(
  routes: Record<string, { status?: number; body: unknown }>,
  requests: { url: string; init?: RequestInit }[] = [],
) {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    requests.push({ url, init });
    const route = routes[url];
    return new Response(
      JSON.stringify(route?.body ?? { error: "missing route" }),
      {
        status: route?.status ?? (route ? 200 : 404),
        headers: { "content-type": "application/json" },
      },
    );
  }) as typeof fetch;
}

test("ALL reads both existing sessions and storage routes independently using GET only", async () => {
  const requests: { url: string; init?: RequestInit }[] = [];
  const read = reader(
    {
      "/api/session": {
        body: { configured: true, user: { email: "personal@example.com" } },
      },
      "/api/frengle/session": {
        body: { configured: true, user: { email: "company@example.com" } },
      },
      "/api/ops?workspace=PERSONAL": {
        body: {
          workspace: "PERSONAL",
          data: {
            tasks: [{ id: "same-id", title: "개인 업무" }],
            schedules: [],
          },
          truncated: [],
        },
      },
      "/api/ops?workspace=FRENGLE": {
        body: {
          workspace: "FRENGLE",
          data: {
            tasks: [{ id: "same-id", title: "회사 업무" }],
            schedules: [],
          },
          truncated: [],
        },
      },
      "/api/automation-results": { body: { ready: true, results: [] } },
      "/api/frengle/results": { body: { ready: true, results: [] } },
    },
    requests,
  );
  const [personal, company] = await Promise.all([
    loadWorkspaceSnapshot("PERSONAL", new AbortController().signal, read),
    loadWorkspaceSnapshot("FRENGLE", new AbortController().signal, read),
  ]);
  assert.equal(personal.tasks?.[0].title, "개인 업무");
  assert.equal(company.tasks?.[0].title, "회사 업무");
  assert.equal(requests.length, 6);
  assert.ok(
    requests.every(
      ({ init }) =>
        init?.method === "GET" &&
        init.credentials === "same-origin" &&
        init.cache === "no-store" &&
        !init.body,
    ),
  );
});

test("missing company login never queries its data or substitutes personal data", async () => {
  const requests: { url: string; init?: RequestInit }[] = [];
  const result = await loadWorkspaceSnapshot(
    "FRENGLE",
    new AbortController().signal,
    reader(
      { "/api/frengle/session": { body: { configured: true, user: null } } },
      requests,
    ),
  );
  assert.equal(result.status, "signed-out");
  assert.equal(result.tasks, null);
  assert.equal(result.schedules, null);
  assert.equal(result.results, null);
  assert.deepEqual(
    requests.map(({ url }) => url),
    ["/api/frengle/session"],
  );
});

test("unconfigured workspace remains explicitly unavailable instead of displaying zero counts", async () => {
  const result = await loadWorkspaceSnapshot(
    "PERSONAL",
    new AbortController().signal,
    reader({ "/api/session": { body: { configured: false, user: null } } }),
  );
  assert.equal(result.status, "unconfigured");
  assert.equal(result.tasks, null);
});

test("mismatched ops response cannot be displayed under a different workspace", async () => {
  const result = await loadWorkspaceSnapshot(
    "FRENGLE",
    new AbortController().signal,
    reader({
      "/api/frengle/session": { body: { configured: true, user: {} } },
      "/api/ops?workspace=FRENGLE": {
        body: {
          workspace: "PERSONAL",
          data: { tasks: [{ id: "p", title: "개인 자료" }], schedules: [] },
        },
      },
      "/api/frengle/results": { body: { ready: true, results: [] } },
    }),
  );
  assert.equal(result.tasks, null);
  assert.equal(result.schedules, null);
  assert.ok(result.opsError);
  assert.deepEqual(result.results, []);
});

test("permission failures clear the entire affected workspace snapshot", async () => {
  const result = await loadWorkspaceSnapshot(
    "FRENGLE",
    new AbortController().signal,
    reader({
      "/api/frengle/session": { body: { configured: true, user: {} } },
      "/api/ops?workspace=FRENGLE": {
        body: {
          workspace: "FRENGLE",
          data: { tasks: [{ id: "t" }], schedules: [] },
        },
      },
      "/api/frengle/results": {
        status: 403,
        body: { error: "membership required" },
      },
    }),
  );
  assert.equal(result.status, "signed-out");
  assert.equal(result.tasks, null);
  assert.equal(result.results, null);
});

test("storage failure clears only failed data; automation source scopes remain enforced", async () => {
  const result = await loadWorkspaceSnapshot(
    "PERSONAL",
    new AbortController().signal,
    reader({
      "/api/session": { body: { configured: true, user: {} } },
      "/api/ops?workspace=PERSONAL": {
        status: 503,
        body: { error: "unavailable" },
      },
      "/api/automation-results": {
        body: {
          ready: true,
          results: [
            { id: "company", source: "frengle_keywords" },
            { id: "mine", source: "metricool_personal" },
          ],
        },
      },
    }),
  );
  assert.equal(result.tasks, null);
  assert.ok(result.opsError);
  assert.deepEqual(
    result.results?.map((row) => row.id),
    ["mine"],
  );
});

test("archived and deleted rows are excluded and API row-limit warnings are retained", async () => {
  const result = await loadWorkspaceSnapshot(
    "PERSONAL",
    new AbortController().signal,
    reader({
      "/api/session": { body: { configured: true, user: {} } },
      "/api/ops?workspace=PERSONAL": {
        body: {
          workspace: "PERSONAL",
          data: {
            tasks: [
              { id: "live" },
              {
                id: "old",
                project_id: "p",
                project_step_id: "s",
                project_step_archived_at: "2026-10-19",
              },
            ],
            schedules: [
              { id: "live" },
              { id: "trash", deleted_at: "2026-10-19" },
            ],
          },
          truncated: ["tasks"],
        },
      },
      "/api/automation-results": { body: { ready: false, results: [] } },
    }),
  );
  assert.deepEqual(
    result.tasks?.map((row) => row.id),
    ["live"],
  );
  assert.deepEqual(
    result.schedules?.map((row) => row.id),
    ["live"],
  );
  assert.equal(result.partial, true);
  assert.equal(result.results, null);
  assert.ok(result.resultsError);
});

test("calendar keeps workspace identity and excludes malformed dates without inventing occurrences", () => {
  const personal = {
    ...emptyWorkspaceSnapshot("PERSONAL", "ready"),
    tasks: [
      { id: "same", title: "개인 마감", due_date: "2026-10-20" },
      { id: "bad", due_date: "2026-02-30" },
    ],
    schedules: [
      {
        id: "overnight",
        title: "자정 일정",
        starts_at: "2026-10-19T23:30:00+09:00",
        ends_at: "2026-10-20T01:00:00+09:00",
      },
      { id: "bad", starts_at: "invalid", ends_at: "invalid" },
    ],
    results: [],
  };
  const company = {
    ...emptyWorkspaceSnapshot("FRENGLE", "ready"),
    tasks: [{ id: "same", title: "회사 마감", due_date: "2026-10-20" }],
    schedules: [],
    results: [],
  };
  const before = JSON.stringify(personal);
  const items = [
    ...workspaceCalendarItems(personal),
    ...workspaceCalendarItems(company),
  ];
  const tuesday = weeklyScheduleRows(items, "2026-10-20").find(
    (day) => day.day === "2026-10-20",
  )!;
  assert.equal(items.length, 3);
  assert.deepEqual(
    tuesday.items.map((row) => [row.title, row.workspace]),
    [
      ["자정 일정", "PERSONAL"],
      ["개인 마감", "PERSONAL"],
      ["회사 마감", "FRENGLE"],
    ],
  );
  assert.equal(JSON.stringify(personal), before);
  assert.deepEqual(
    workspaceCalendarItems(emptyWorkspaceSnapshot("FRENGLE", "signed-out")),
    [],
  );
});

test("aborted authentication requests return empty recoverable state", async () => {
  const controller = new AbortController();
  controller.abort();
  const result = await loadWorkspaceSnapshot(
    "PERSONAL",
    controller.signal,
    (async () => {
      throw new DOMException("Aborted", "AbortError");
    }) as typeof fetch,
  );
  assert.equal(result.status, "error");
  assert.equal(result.tasks, null);
  assert.match(result.message || "", /시간/);
});
