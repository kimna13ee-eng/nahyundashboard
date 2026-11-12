import { after, test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { NextRequest } from "next/server.js";
import {
  parsePlannerMutation,
  parsePlannerQuery,
} from "../src/lib/planner-schedules.ts";

const owner = "11111111-1111-4111-8111-111111111111";
const yogaId = "22222222-2222-4222-8222-222222222222";
const workId = "33333333-3333-4333-8333-333333333333";
const otherId = "44444444-4444-4444-8444-444444444444";
const newId = "55555555-5555-4555-8555-555555555555";
const input = {
  date: "2026-11-12",
  title: "저녁 요가",
  video_url: "https://youtu.be/M7lc1UVf-VE",
  duration_minutes: 20,
};
type Row = Record<string, unknown>;
type Result = {
  data: Row | Row[] | null;
  error: { code: string } | null;
  count?: number;
};
type Fixture = {
  rows: Row[];
  queries: number;
  rpcCalls: number;
  authCalls: number;
  signedIn: boolean;
  error: string | null;
  rpcStatus?: string;
  client?: object;
  sessionQueries: string[];
};
const scope = globalThis as typeof globalThis & { __plannerFixture?: Fixture };
const serverModule = `data:text/javascript,${encodeURIComponent(`
  export class WorkspaceAccessError extends Error {
    constructor(message,status){super(message);this.status=status;}
  }
  export async function workspaceSession(params){
    const f=globalThis.__plannerFixture;
    f.authCalls++; f.sessionQueries.push(params.toString());
    if(!f.signedIn)throw new WorkspaceAccessError("로그인이 필요해요",401);
    return {client:f.client,user:{id:"${owner}"},workspace:"PERSONAL"};
  }
`)}`;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/lib/workspaces/server")
      return { url: serverModule, shortCircuit: true };
    if (specifier.startsWith("@/"))
      return nextResolve(
        pathToFileURL(resolve("src", `${specifier.slice(2)}.ts`)).href,
        context,
      );
    if (specifier === "next/server")
      return nextResolve("next/server.js", context);
    return nextResolve(specifier, context);
  },
});
const route = await import("../src/app/api/planner-schedules/route.ts");
after(() => {
  hooks.deregister();
  delete scope.__plannerFixture;
});

function setup() {
  const base = {
    ...input,
    starts_at: "2026-11-12T12:00:00.000Z",
    ends_at: "2026-11-12T13:00:00.000Z",
    category: "exercise",
    owner_id: owner,
    deleted_at: null,
    notes: "keep original note",
    project_id: "keep-original-project",
  };
  const f: Fixture = {
    rows: [
      { ...base, id: yogaId },
      { ...base, id: workId, category: "work" },
      { ...base, id: otherId, owner_id: "other-owner" },
    ],
    queries: 0,
    rpcCalls: 0,
    authCalls: 0,
    signedIn: true,
    error: null,
    sessionQueries: [],
  };
  class Query {
    predicates: ((row: Row) => boolean)[] = [];
    columns = "*";
    max = Infinity;
    insertValue?: Row;
    updateValue?: Row;
    select(columns: string) {
      this.columns = columns;
      return this;
    }
    eq(key: string, value: unknown) {
      this.predicates.push((row) => row[key] === value);
      return this;
    }
    is(key: string, value: unknown) {
      return this.eq(key, value);
    }
    gte(key: string, value: string) {
      this.predicates.push(
        (row) => Date.parse(String(row[key])) >= Date.parse(value),
      );
      return this;
    }
    lte(key: string, value: string) {
      this.predicates.push(
        (row) => Date.parse(String(row[key])) <= Date.parse(value),
      );
      return this;
    }
    order() {
      return this;
    }
    limit(value: number) {
      this.max = value;
      return this;
    }
    insert(value: Row) {
      this.insertValue = value;
      return this;
    }
    update(value: Row) {
      this.updateValue = value;
      return this;
    }
    async run(single = false): Promise<Result> {
      if (f.error) return { data: null, error: { code: f.error } };
      let rows: Row[];
      if (this.insertValue) {
        if (f.rows.some((row) => row.id === this.insertValue!.id))
          return { data: null, error: { code: "23505" } };
        const row = { deleted_at: null, ...this.insertValue };
        f.rows.push(row);
        rows = [row];
      } else {
        rows = f.rows.filter((row) =>
          this.predicates.every((predicate) => predicate(row)),
        );
        if (this.updateValue)
          rows.forEach((row) => Object.assign(row, this.updateValue));
      }
      const selected = rows
        .slice(0, this.max)
        .map((row) =>
          Object.fromEntries(
            this.columns.split(",").map((key) => [key, row[key]]),
          ),
        );
      return {
        data: single ? selected[0] || null : selected,
        error: null,
        count: rows.length,
      };
    }
    maybeSingle() {
      return this.run(true);
    }
    then<T>(resolve: (value: Result) => T) {
      return this.run().then(resolve);
    }
  }
  f.client = {
    from(table: string) {
      assert.equal(table, "ops_schedules");
      f.queries++;
      return new Query();
    },
    async rpc(name: string, args: { p_schedule_id: string }) {
      f.rpcCalls++;
      assert.ok(
        ["ops_schedule_soft_delete", "ops_schedule_restore"].includes(name),
      );
      const row = f.rows.find(
        (row) => row.id === args.p_schedule_id && row.owner_id === owner,
      );
      const status =
        f.rpcStatus ?? (name.endsWith("restore") ? "restored" : "deleted");
      if (row && status === "deleted") row.deleted_at = "2026-11-12T00:00:00Z";
      if (row && status === "restored") row.deleted_at = null;
      return { data: status, error: null };
    },
  };
  scope.__plannerFixture = f;
  return f;
}
function request(
  method = "GET",
  body?: unknown,
  query?: string,
  origin = "https://dashboard.test",
) {
  return new NextRequest(
    `https://dashboard.test/api/planner-schedules?${query ?? (method === "GET" ? "from=2026-11-09&to=2026-11-15" : "")}`,
    {
      method,
      headers: {
        Host: "dashboard.test",
        Origin: origin,
        "Content-Type": "application/json",
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    },
  );
}

test("KST date windows include both endpoints and reject invalid/unbounded or duplicated ranges", () => {
  assert.deepEqual(
    parsePlannerQuery(
      new URLSearchParams("from=2026-11-01&to=2026-11-30"),
      "GET",
    ),
    {
      from: "2026-11-01T00:00:00+09:00",
      to: "2026-11-30T23:59:59.999999+09:00",
    },
  );
  for (const query of [
    "",
    "from=2026-02-30&to=2026-03-01",
    "from=2026-12-01&to=2026-11-01",
    "from=2026-11-01&to=2026-12-02",
    "from=2026-11-01&from=2026-11-01&to=2026-11-07",
    "from=0000-01-01&to=0000-01-07",
  ])
    assert.throws(() => parsePlannerQuery(new URLSearchParams(query), "GET"));
});

test("input fixes the reminder slot at 21h, preserves unknown duration and rejects hidden-field injection", () => {
  assert.deepEqual(parsePlannerMutation({ ...input, id: newId }, "POST"), {
    action: "create",
    id: newId,
    value: {
      title: input.title,
      video_url: input.video_url,
      duration_minutes: 20,
      starts_at: "2026-11-12T12:00:00.000Z",
      ends_at: "2026-11-12T13:00:00.000Z",
    },
  });
  const unknown = parsePlannerMutation(
    { ...input, duration_minutes: null },
    "POST",
  );
  assert.ok("value" in unknown);
  assert.equal(unknown.value.duration_minutes, null);
  for (const body of [
    null,
    [],
    { ...input, owner_id: otherId },
    { ...input, category: "work" },
    { ...input, title: " " },
    { ...input, title: "x\0" },
    { ...input, video_url: "" },
    { ...input, video_url: "https://user:pass@video.example/a" },
    { ...input, duration_minutes: 1.5 },
    { ...input, duration_minutes: 0 },
    { ...input, duration_minutes: 1441 },
    { ...input, date: "2026-02-29" },
  ])
    assert.throws(() => parsePlannerMutation(body, "POST"));
  assert.throws(() => parsePlannerMutation(input, "PATCH"));
});

test("actual handler blocks foreign workspaces/origins before auth and anonymous sessions before database", async () => {
  for (const query of [
    "workspace=FRENGLE",
    "workspace=ALL",
    "workspace=PERSONAL&workspace=PERSONAL",
  ]) {
    const f = setup();
    const response = await route.POST(request("POST", input, query));
    assert.equal(response.status, 403);
    assert.equal(f.authCalls, 0);
    assert.equal(f.queries, 0);
  }
  let f = setup();
  assert.equal(
    (await route.POST(request("POST", input, "", "https://foreign.test")))
      .status,
    403,
  );
  assert.equal(f.authCalls, 0);
  f = setup();
  f.signedIn = false;
  assert.equal((await route.GET(request())).status, 401);
  assert.equal(f.queries, 0);
});

test("GET only returns owned, active, in-range yoga and reports truncation honestly", async () => {
  const f = setup();
  f.rows.push(
    { ...f.rows[0], id: "old", starts_at: "2026-11-08T14:59:59Z" },
    { ...f.rows[0], id: "deleted", deleted_at: "2026-11-12T01:00:00Z" },
  );
  const response = await route.GET(request());
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(
    body.schedules.map((row: Row) => row.id),
    [yogaId],
  );
  assert.equal(body.truncated, false);
  assert.equal("notes" in body.schedules[0], false);
  assert.deepEqual(f.sessionQueries, ["workspace=PERSONAL"]);
  for (let n = 0; n < 501; n++) f.rows.push({ ...f.rows[0], id: String(n) });
  const large = await (await route.GET(request())).json();
  assert.equal(large.schedules.length, 500);
  assert.equal(large.truncated, true);
});

test("create retries do not duplicate or overwrite; edits preserve hidden metadata and reject non-yoga/foreign/deleted rows", async () => {
  const f = setup();
  const body = { ...input, id: newId };
  assert.equal((await route.POST(request("POST", body))).status, 201);
  assert.equal((await route.POST(request("POST", body))).status, 200);
  assert.equal(f.rows.filter((row) => row.id === newId).length, 1);
  assert.equal(
    (await route.POST(request("POST", { ...body, title: "changed retry" })))
      .status,
    409,
  );
  const response = await route.PATCH(
    request("PATCH", {
      ...input,
      id: yogaId,
      title: "수정한 요가",
      date: "2026-11-13",
    }),
  );
  assert.equal(response.status, 200);
  const row = f.rows.find((row) => row.id === yogaId)!;
  assert.equal(row.notes, "keep original note");
  assert.equal(row.project_id, "keep-original-project");
  assert.equal(row.starts_at, "2026-11-13T12:00:00.000Z");
  for (const id of [workId, otherId])
    assert.equal(
      (await route.PATCH(request("PATCH", { ...input, id }))).status,
      404,
    );
  row.deleted_at = "2026-11-12T01:00:00Z";
  assert.equal(
    (await route.PATCH(request("PATCH", { ...input, id: yogaId }))).status,
    404,
  );
});

test("soft deletion/restore use existing owner-scoped RPCs only after category checks and surface expiry", async () => {
  const f = setup();
  for (const id of [workId, otherId]) {
    assert.equal((await route.DELETE(request("DELETE", { id }))).status, 404);
    assert.equal(
      (await route.POST(request("POST", { id, action: "restore" }))).status,
      404,
    );
  }
  assert.equal(f.rpcCalls, 0);
  assert.deepEqual(
    await (await route.DELETE(request("DELETE", { id: yogaId }))).json(),
    { ok: true, status: "deleted" },
  );
  assert.ok(f.rows.find((row) => row.id === yogaId)!.deleted_at);
  assert.deepEqual(
    await (
      await route.POST(request("POST", { id: yogaId, action: "restore" }))
    ).json(),
    { ok: true, status: "restored" },
  );
  f.rpcStatus = "expired";
  assert.equal(
    (await route.POST(request("POST", { id: yogaId, action: "restore" })))
      .status,
    410,
  );
});

test("malformed input and storage failures return sanitized errors", async () => {
  let f = setup();
  assert.equal(
    (await route.POST(request("POST", { ...input, title: "x".repeat(16001) })))
      .status,
    413,
  );
  assert.equal(f.queries, 0);
  f = setup();
  f.error = "private database diagnostic";
  const response = await route.GET(request());
  assert.equal(response.status, 503);
  assert.equal(
    JSON.stringify(await response.json()).includes("private"),
    false,
  );
});
