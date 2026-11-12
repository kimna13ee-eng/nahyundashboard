import { after, test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { NextRequest } from "next/server.js";
import { parseBlogKeywordMutation } from "../src/lib/blog-keywords.ts";

const owner = "11111111-1111-4111-8111-111111111111";
const activeId = "22222222-2222-4222-8222-222222222222";
const otherId = "33333333-3333-4333-8333-333333333333";
const deletedId = "44444444-4444-4444-8444-444444444444";
const newId = "55555555-5555-4555-8555-555555555555";
const stamp = "2026-11-12T04:00:00.000123Z";
type Row = Record<string, unknown>;
type Result = {
  data: Row | Row[] | null;
  error: { code: string } | null;
  count?: number;
};
type Fixture = {
  rows: Row[];
  authCalls: number;
  queries: number;
  signedIn: boolean;
  error: string | null;
  sessionQueries: string[];
  rpcCalls: { name: string; args: unknown }[];
  rpcError: string | null;
  client?: object;
};
const scope = globalThis as typeof globalThis & { __blogFixture?: Fixture };
const server = `data:text/javascript,${encodeURIComponent(`
export class WorkspaceAccessError extends Error { constructor(message,status){super(message);this.status=status;} }
export async function workspaceSession(params){
 const f=globalThis.__blogFixture;f.authCalls++;f.sessionQueries.push(params.toString());
 if(!f.signedIn)throw new WorkspaceAccessError('로그인이 필요해요',401);
 return {client:f.client,user:{id:'${owner}'},workspace:'PERSONAL'};
}`)}`;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/lib/workspaces/server")
      return { url: server, shortCircuit: true };
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
const route = await import("../src/app/api/blog-keywords/route.ts");
after(() => {
  hooks.deregister();
  delete scope.__blogFixture;
});

function setup() {
  const base = {
    keyword: "출근 메이크업",
    used: false,
    deleted_at: null,
    created_at: stamp,
    updated_at: stamp,
    owner_id: owner,
  };
  const fixture: Fixture = {
    rows: [
      { ...base, id: activeId },
      { ...base, id: otherId, owner_id: "other" },
      { ...base, id: deletedId, used: true, deleted_at: stamp },
    ],
    authCalls: 0,
    queries: 0,
    signedIn: true,
    error: null,
    sessionQueries: [],
    rpcCalls: [],
    rpcError: null,
  };
  class Query {
    predicates: ((row: Row) => boolean)[] = [];
    columns = "*";
    max = Infinity;
    inserted?: Row;
    updated?: Row;
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
    order() {
      return this;
    }
    limit(max: number) {
      this.max = max;
      return this;
    }
    insert(value: Row) {
      this.inserted = value;
      return this;
    }
    update(value: Row) {
      this.updated = value;
      return this;
    }
    async run(single = false): Promise<Result> {
      if (fixture.error) return { data: null, error: { code: fixture.error } };
      let rows: Row[];
      if (this.inserted) {
        if (fixture.rows.some((row) => row.id === this.inserted!.id))
          return { data: null, error: { code: "23505" } };
        const row = { ...base, ...this.inserted };
        fixture.rows.push(row);
        rows = [row];
      } else {
        rows = fixture.rows.filter((row) =>
          this.predicates.every((p) => p(row)),
        );
        if (this.updated)
          rows.forEach((row) =>
            Object.assign(row, this.updated, {
              updated_at: "2026-11-12T04:01:00.000456Z",
            }),
          );
      }
      const data = rows
        .slice(0, this.max)
        .map((row) =>
          Object.fromEntries(
            this.columns.split(",").map((key) => [key, row[key]]),
          ),
        );
      return {
        data: single ? data[0] || null : data,
        error: null,
        count: rows.length,
      };
    }
    maybeSingle() {
      return this.run(true);
    }
    then<T>(done: (result: Result) => T) {
      return this.run().then(done);
    }
  }
  fixture.client = {
    from(table: string) {
      assert.equal(table, "ops_blog_keywords");
      fixture.queries++;
      return new Query();
    },
    async rpc(name: string, args: unknown) {
      fixture.rpcCalls.push({ name, args });
      return fixture.rpcError
        ? { data: null, error: { code: fixture.rpcError } }
        : {
            data: [{ ...base, id: activeId, used: true, deleted_at: stamp }],
            error: null,
          };
    },
  };
  scope.__blogFixture = fixture;
  return fixture;
}
function request(
  method = "GET",
  body?: unknown,
  query = "",
  origin = "https://dashboard.test",
) {
  return new NextRequest(
    `https://dashboard.test/api/blog-keywords${query ? `?${query}` : ""}`,
    {
      method,
      headers: {
        Host: "dashboard.test",
        Origin: origin,
        "Content-Type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
  );
}
const ref = { id: activeId, expectedUpdatedAt: stamp };

test("authentication, workspace and origin guards precede keyword access", async () => {
  const f = setup();
  for (const query of [
    "workspace=FRENGLE",
    "workspace=ALL",
    "owner_id=other",
    "workspace=PERSONAL&workspace=PERSONAL",
  ])
    assert.equal(
      (await route.GET(request("GET", undefined, query))).status,
      403,
    );
  assert.equal(
    (
      await route.POST(
        request(
          "POST",
          { id: newId, keyword: "test" },
          "",
          "https://evil.test",
        ),
      )
    ).status,
    403,
  );
  assert.equal(f.authCalls, 0);
  assert.equal(f.queries, 0);
  f.signedIn = false;
  assert.equal((await route.GET(request())).status, 401);
  assert.equal(f.queries, 0);
});
test("GET returns only the owner's active items with bounded count and no owner identifier", async () => {
  const f = setup();
  const response = await route.GET(request());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  const body = await response.json();
  assert.deepEqual(
    body.items.map((item: Row) => item.id),
    [activeId],
  );
  assert.equal(body.items[0].owner_id, undefined);
  assert.equal(body.truncated, false);
  assert.deepEqual(f.sessionQueries, ["workspace=PERSONAL"]);
  f.rows = Array.from({ length: 501 }, (_, index) => ({
    ...f.rows[0],
    id: String(index),
  }));
  const large = await (await route.GET(request())).json();
  assert.equal(large.items.length, 500);
  assert.equal(large.truncated, true);
});
test("create retries are idempotent but never overwrite a checked or changed keyword", async () => {
  const f = setup();
  const input = { id: newId, keyword: "  여름 블러셔  " };
  const first = await route.POST(request("POST", input));
  assert.equal(first.status, 201);
  assert.equal((await first.json()).item.keyword, "여름 블러셔");
  assert.equal((await route.POST(request("POST", input))).status, 200);
  assert.equal(f.rows.filter((row) => row.id === newId).length, 1);
  f.rows.find((row) => row.id === newId)!.used = true;
  assert.equal((await route.POST(request("POST", input))).status, 409);
  assert.equal(
    (
      await route.POST(
        request("POST", { id: otherId, keyword: "출근 메이크업" }),
      )
    ).status,
    409,
  );
});
test("checkbox updates reject stale, foreign and removed rows without partial changes", async () => {
  const f = setup();
  assert.equal(
    (await route.PATCH(request("PATCH", { ...ref, used: true }))).status,
    200,
  );
  assert.equal(f.rows[0].used, true);
  assert.equal(
    (await route.PATCH(request("PATCH", { ...ref, used: false }))).status,
    409,
  );
  assert.equal(f.rows[0].used, true);
  for (const id of [otherId, deletedId])
    assert.equal(
      (
        await route.PATCH(
          request("PATCH", { id, expectedUpdatedAt: stamp, used: true }),
        )
      ).status,
      409,
    );
  assert.equal(f.rows[1].used, false);
});
test("delete/restore use one atomic RPC with exact token list and strip internal owner field", async () => {
  const f = setup();
  const result = await route.DELETE(request("DELETE", { items: [ref] }));
  assert.equal(result.status, 200);
  assert.equal((await result.json()).items[0].owner_id, undefined);
  assert.deepEqual(f.rpcCalls, [
    {
      name: "ops_blog_keywords_set_deleted",
      args: { p_items: [ref], p_deleted: true },
    },
  ]);
  const restored = await route.POST(
    request("POST", { action: "restore", items: [ref] }),
  );
  assert.equal(restored.status, 200);
  assert.deepEqual(f.rpcCalls[1], {
    name: "ops_blog_keywords_set_deleted",
    args: { p_items: [ref], p_deleted: false },
  });
  f.rpcError = "40001";
  const conflict = await route.DELETE(request("DELETE", { items: [ref] }));
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).conflict, true);
});
test("input validation refuses hidden fields and invalid bulk requests before mutations", async () => {
  const f = setup();
  for (const input of [
    { id: newId, keyword: "x", owner_id: owner },
    { id: newId, keyword: "x", used: true },
    { id: newId, keyword: " " },
    { id: newId, keyword: "가".repeat(201) },
  ])
    assert.equal((await route.POST(request("POST", input))).status, 400);
  for (const items of [
    [],
    [ref, ref],
    [{ ...ref, expectedUpdatedAt: "2026-02-30T00:00:00Z" }],
    Array.from({ length: 501 }, () => ref),
  ])
    assert.equal(
      (await route.DELETE(request("DELETE", { items }))).status,
      400,
    );
  assert.equal(f.queries, 0);
  assert.equal(f.rpcCalls.length, 0);
  assert.equal(
    parseBlogKeywordMutation({ id: newId, keyword: "😀".repeat(200) }, "POST")
      .action,
    "create",
  );
  f.error = "42P01";
  const missing = await route.GET(request());
  assert.equal(missing.status, 503);
  assert.equal((await missing.json()).setupRequired, true);
});
