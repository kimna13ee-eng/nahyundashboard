import { after, test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { NextRequest } from "next/server.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { WorkspaceProviders } from "../src/lib/workspace-access.ts";
import type { OverviewMemo } from "../src/lib/overview-memos.ts";

const scope = globalThis as typeof globalThis & {
  __overviewMemoTestProviders?: WorkspaceProviders;
};
const accessUrl = pathToFileURL(resolve("src/lib/workspace-access.ts")).href;
const stub = `data:text/javascript,${encodeURIComponent(`import { authenticateWorkspace, WorkspaceAccessError } from ${JSON.stringify(accessUrl)}; export { WorkspaceAccessError }; export function workspaceSession(params){return authenticateWorkspace(params,globalThis.__overviewMemoTestProviders);}`)}`;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/lib/workspaces/server")
      return { url: stub, shortCircuit: true };
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
after(() => {
  hooks.deregister();
  delete scope.__overviewMemoTestProviders;
});
const api = await import("../src/app/api/frengle/memos/route.ts");
const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const ID = "33333333-3333-4333-8333-333333333333";
const TOKEN = "2026-10-23T09:00:00.123456+00:00";
type Stored = OverviewMemo & { owner_id: string };
type Filter = { key: string; op: "eq" | "is" | "not"; value: unknown };
type QueryRecord = {
  table: string;
  filters: Filter[];
  value?: Record<string, unknown>;
  selected?: string;
  order: { key: string; ascending: boolean }[];
  limit?: number;
};

function row(patch: Partial<Stored> = {}): Stored {
  return {
    id: ID,
    owner_id: OWNER,
    body: "기억할 메모",
    done: false,
    deleted_at: null,
    created_at: TOKEN,
    updated_at: TOKEN,
    ...patch,
  };
}

function fixture(initial: Stored[] = [row()]) {
  const state = {
    signedIn: true,
    member: true,
    configured: true,
    error: null as { code: string; message?: string } | null,
    rows: structuredClone(initial),
    personalCalls: 0,
    authCalls: 0,
    tick: 0,
  };
  const queries: QueryRecord[] = [];
  class Query {
    record: QueryRecord;
    operation: "insert" | "update" | null = null;
    constructor(table: string) {
      this.record = { table, filters: [], order: [] };
      queries.push(this.record);
    }
    select(selected: string) {
      this.record.selected = selected;
      return this;
    }
    eq(key: string, value: unknown) {
      this.record.filters.push({ key, op: "eq", value });
      return this;
    }
    is(key: string, value: unknown) {
      this.record.filters.push({ key, op: "is", value });
      return this;
    }
    not(key: string, _operator: string, value: unknown) {
      this.record.filters.push({ key, op: "not", value });
      return this;
    }
    order(key: string, options: { ascending: boolean }) {
      this.record.order.push({ key, ascending: options.ascending });
      return this;
    }
    insert(value: Record<string, unknown>) {
      this.operation = "insert";
      this.record.value = value;
      return this;
    }
    update(value: Record<string, unknown>) {
      this.operation = "update";
      this.record.value = value;
      return this;
    }
    filtered() {
      return state.rows.filter((item) =>
        this.record.filters.every(({ key, op, value }) =>
          op === "not"
            ? item[key as keyof Stored] !== value
            : item[key as keyof Stored] === value,
        ),
      );
    }
    projected(item: Stored) {
      return Object.fromEntries(
        (this.record.selected || "")
          .split(",")
          .map((key) => [key, item[key as keyof Stored]]),
      );
    }
    async limit(limit: number) {
      this.record.limit = limit;
      if (state.error) return { data: null, error: state.error, count: null };
      const rows = this.filtered().sort((a, b) => {
        for (const { key, ascending } of this.record.order) {
          const compared = String(a[key as keyof Stored]).localeCompare(
            String(b[key as keyof Stored]),
          );
          if (compared) return ascending ? compared : -compared;
        }
        return 0;
      });
      return {
        data: rows.slice(0, limit).map((item) => this.projected(item)),
        error: null,
        count: rows.length,
      };
    }
    async maybeSingle() {
      if (this.record.table === "ops_company_members")
        return { data: state.member ? { user_id: OWNER } : null, error: null };
      if (state.error) return { data: null, error: state.error };
      if (this.operation === "insert") {
        const item = row({
          id: "44444444-4444-4444-8444-444444444444",
          body: this.record.value?.body as string,
        });
        state.rows.push(item);
        return { data: this.projected(item), error: null };
      }
      const item = this.filtered()[0];
      if (!item) return { data: null, error: null };
      if (this.operation === "update")
        Object.assign(item, this.record.value, {
          updated_at: `2026-10-23T12:00:00.${String(++state.tick).padStart(6, "0")}+00:00`,
        });
      return { data: this.projected(item), error: null };
    }
  }
  const companyClient = {
    auth: {
      getUser: async () => {
        ++state.authCalls;
        return {
          data: { user: state.signedIn ? { id: OWNER } : null },
          error: null,
        };
      },
    },
    from: (table: string) => new Query(table),
  } as unknown as SupabaseClient;
  scope.__overviewMemoTestProviders = {
    FRENGLE: {
      configured: () => state.configured,
      client: async () => companyClient,
    },
    PERSONAL: {
      configured: () => {
        ++state.personalCalls;
        return true;
      },
      client: async () => {
        ++state.personalCalls;
        throw new Error("PERSONAL must not be queried");
      },
    },
  };
  return { state, queries };
}

function request(
  method = "GET",
  body?: unknown,
  query = "",
  origin = "http://dashboard.test",
) {
  return new NextRequest(`http://dashboard.test/api/frengle/memos${query}`, {
    method,
    headers: {
      host: "dashboard.test",
      origin,
      "content-type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

test("실제 메모 GET은 회사 owner만 조회하고 활성·휴지통을 분리하며 정렬/상한을 지킴", async () => {
  const many = Array.from({ length: 205 }, (_, index) =>
    row({
      id: `active-${String(index).padStart(3, "0")}`,
      created_at: `2026-10-${String((index % 20) + 1).padStart(2, "0")}T00:00:00Z`,
    }),
  );
  const trash = Array.from({ length: 55 }, (_, index) =>
    row({
      id: `trash-${index}`,
      deleted_at: `2026-10-${String((index % 20) + 1).padStart(2, "0")}T00:00:00Z`,
    }),
  );
  const f = fixture([
    ...many,
    ...trash,
    row({ id: "foreign", owner_id: OTHER }),
  ]);
  const response = await api.GET(
    request("GET", undefined, "?workspace=FRENGLE"),
  );
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(body.ready, true);
  assert.equal(body.items.length, 200);
  assert.equal(body.archived.length, 50);
  assert.equal(body.truncated, true);
  assert.equal(body.archivedTruncated, true);
  assert.ok(
    body.items.every(
      (item: OverviewMemo) =>
        item.deleted_at === null &&
        item.id !== "foreign" &&
        !Object.hasOwn(item, "owner_id"),
    ),
  );
  assert.ok(
    body.archived.every((item: OverviewMemo) => item.deleted_at !== null),
  );
  const reads = f.queries.filter(
    (query) => query.table === "ops_overview_memos",
  );
  assert.equal(reads.length, 2);
  assert.ok(
    reads.every((query) =>
      query.filters.some(
        (filter) => filter.key === "owner_id" && filter.value === OWNER,
      ),
    ),
  );
  assert.deepEqual(reads[0].order, [
    { key: "created_at", ascending: true },
    { key: "id", ascending: true },
  ]);
  assert.deepEqual(reads[1].order, [
    { key: "deleted_at", ascending: false },
    { key: "id", ascending: false },
  ]);
  assert.equal(f.state.personalCalls, 0);
});

test("POST는 body만 INSERT하고 owner/done/시간은 DB 기본값을 사용", async () => {
  const f = fixture([]);
  const response = await api.POST(request("POST", { body: "  회사 메모  " }));
  const body = await response.json();
  assert.equal(response.status, 201);
  assert.equal(body.item.body, "회사 메모");
  assert.equal(body.item.done, false);
  const write = f.queries.find((query) => query.value)!;
  assert.deepEqual(write.value, { body: "회사 메모" });
  assert.ok(
    write.filters.some(
      (filter) => filter.key === "owner_id" && filter.value === OWNER,
    ),
  );
  assert.equal(f.state.personalCalls, 0);
});

test("체크·문구 저장은 microsecond CAS, 보관·복구는 안전한 상태 전환과 fresh token 사용", async () => {
  const f = fixture();
  let token = TOKEN;
  for (const change of [
    { done: true },
    { body: " 바꾼 메모 " },
    { action: "archive" },
    { action: "restore" },
  ]) {
    const response = await api.PATCH(
      request("PATCH", { id: ID, expected_updated_at: token, ...change }),
    );
    const body = await response.json();
    assert.equal(response.status, 200);
    const write = f.queries.filter((query) => query.value).at(-1)!;
    assert.ok(
      write.filters.some(
        (filter) => filter.key === "updated_at" && filter.value === token,
      ),
    );
    assert.ok(
      write.filters.some(
        (filter) => filter.key === "owner_id" && filter.value === OWNER,
      ),
    );
    assert.notEqual(body.item.updated_at, token);
    token = body.item.updated_at;
    assert.equal(body.item.done, true);
    if ("action" in change)
      assert.equal(Boolean(body.item.deleted_at), change.action === "archive");
  }
  assert.equal(f.state.rows[0].body, "바꾼 메모");
  assert.equal(f.state.personalCalls, 0);
});

test("동일 토큰 중복 수정은 409, 미존재/타인은 404이며 DB 변경 없음", async () => {
  const f = fixture();
  assert.equal(
    (
      await api.PATCH(
        request("PATCH", { id: ID, expected_updated_at: TOKEN, done: true }),
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await api.PATCH(
        request("PATCH", { id: ID, expected_updated_at: TOKEN, done: false }),
      )
    ).status,
    409,
  );
  assert.equal(f.state.rows[0].done, true);
  const foreign = row({ owner_id: OTHER });
  f.state.rows = [foreign];
  assert.equal(
    (
      await api.PATCH(
        request("PATCH", {
          id: ID,
          expected_updated_at: TOKEN,
          body: "타인 덮기",
        }),
      )
    ).status,
    404,
  );
  assert.equal(foreign.body, "기억할 메모");
  f.state.rows = [];
  assert.equal(
    (
      await api.PATCH(
        request("PATCH", {
          id: ID,
          expected_updated_at: TOKEN,
          action: "restore",
        }),
      )
    ).status,
    404,
  );
});

test("보관 중인 항목은 바로 체크/수정할 수 없으며 stale restore도 거절", async () => {
  const f = fixture([row({ deleted_at: "2026-10-23T10:00:00Z" })]);
  assert.equal(
    (
      await api.PATCH(
        request("PATCH", { id: ID, expected_updated_at: TOKEN, done: true }),
      )
    ).status,
    409,
  );
  assert.equal(f.state.rows[0].done, false);
  assert.equal(
    (
      await api.PATCH(
        request("PATCH", {
          id: ID,
          expected_updated_at: "2026-10-23T09:00:00.123455+00:00",
          action: "restore",
        }),
      )
    ).status,
    409,
  );
  assert.notEqual(f.state.rows[0].deleted_at, null);
});

test("로그인/회원/저장소 오류는 회사 상태만 반환하고 PERSONAL로 우회하지 않음", async () => {
  for (const reason of ["signed-out", "membership", "unconfigured"] as const) {
    const f = fixture();
    f.state.signedIn = reason !== "signed-out";
    f.state.member = reason !== "membership";
    f.state.configured = reason !== "unconfigured";
    assert.equal(
      (await api.GET(request())).status,
      reason === "signed-out" ? 401 : reason === "membership" ? 403 : 503,
    );
    assert.equal(
      f.queries.some((query) => query.table === "ops_overview_memos"),
      false,
    );
    assert.equal(f.state.personalCalls, 0);
  }
});

test("외부 Origin, scope 변조, owner/time mass assignment는 메모 쓰기 전 차단", async () => {
  for (const query of [
    "?workspace=PERSONAL",
    "?workspace=ALL",
    "?workspace=FRENGLE&workspace=FRENGLE",
    "?owner_id=x",
  ]) {
    const f = fixture();
    assert.equal((await api.GET(request("GET", undefined, query))).status, 403);
    assert.equal(f.state.authCalls, 0);
    assert.equal(f.state.personalCalls, 0);
  }
  for (const value of [
    { body: "메모", owner_id: OTHER },
    { body: "메모", done: true },
    { body: "메모", workspace: "PERSONAL" },
    { body: "메모", created_at: TOKEN },
    { body: " " },
  ]) {
    const f = fixture();
    assert.equal((await api.POST(request("POST", value))).status, 400);
    assert.equal(
      f.queries.some((query) => query.value),
      false,
    );
  }
  const f = fixture();
  assert.equal(
    (
      await api.POST(
        request("POST", { body: "메모" }, "", "https://attacker.invalid"),
      )
    ).status,
    403,
  );
  assert.equal(f.state.authCalls, 0);
});

test("마이그레이션 누락은 읽기/쓰기 모두 setupRequired 503이며 내부 DB 원문 숨김", async () => {
  for (const method of ["GET", "POST", "PATCH"] as const) {
    const f = fixture();
    f.state.error = {
      code: "42P01",
      message: "private connection raw details",
    };
    const response = await api[method](
      request(
        method,
        method === "GET"
          ? undefined
          : method === "POST"
            ? { body: "메모" }
            : { id: ID, expected_updated_at: TOKEN, done: true },
      ),
    );
    const body = await response.json();
    assert.equal(response.status, 503);
    assert.equal(body.setupRequired, true);
    assert.equal(body.ready, false);
    assert.equal(JSON.stringify(body).includes("private connection"), false);
    assert.equal(f.state.personalCalls, 0);
  }
});
