import { after, test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { NextRequest } from "next/server.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { WorkspaceProviders } from "../src/lib/workspace-access.ts";

// Run the actual handlers against separate fake projects, with no environment,
// cookies, network, or real database. The shared authorization helper is real.
const scope = globalThis as typeof globalThis & {
  __opsWorkspaceTestProviders?: WorkspaceProviders;
};
const accessUrl = pathToFileURL(resolve("src/lib/workspace-access.ts")).href;
const testServerModule = `data:text/javascript,${encodeURIComponent(`
  import { authenticateWorkspace, WorkspaceAccessError } from ${JSON.stringify(accessUrl)};
  export { WorkspaceAccessError };
  export function workspaceSession(params) {
    return authenticateWorkspace(params, globalThis.__opsWorkspaceTestProviders);
  }
`)}`;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/lib/workspaces/server")
      return { url: testServerModule, shortCircuit: true };
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
  delete scope.__opsWorkspaceTestProviders;
});
const ops = await import("../src/app/api/ops/route.ts");
const workflow = await import("../src/app/api/workflow/route.ts");
const phase2 = await import("../src/app/api/phase2/route.ts");

type QueryRecord = {
  table: string;
  filters: [string, unknown][];
  value?: Record<string, unknown>;
};
const personalId = "11111111-1111-4111-8111-111111111111";
const companyId = "22222222-2222-4222-8222-222222222222";
const rowId = "33333333-3333-4333-8333-333333333333";

function project(id: string) {
  const queries: QueryRecord[] = [];
  const rpcs: string[] = [];
  const state = { member: true, signedIn: true };
  class Query {
    record: QueryRecord;
    constructor(table: string) {
      this.record = { table, filters: [] };
      queries.push(this.record);
    }
    select() {
      return this;
    }
    eq(column: string, value: unknown) {
      this.record.filters.push([column, value]);
      return this;
    }
    is() {
      return this;
    }
    not() {
      return this;
    }
    gt() {
      return this;
    }
    order() {
      return this;
    }
    insert(value: Record<string, unknown>) {
      this.record.value = value;
      return this;
    }
    update(value: Record<string, unknown>) {
      this.record.value = value;
      return this;
    }
    delete() {
      return this;
    }
    async limit() {
      return { data: [], error: null, count: 0 };
    }
    async maybeSingle() {
      return {
        data:
          this.record.table === "ops_company_members"
            ? state.member
              ? { user_id: id }
              : null
            : { id: rowId, ...this.record.value },
        error: null,
      };
    }
  }
  const client = {
    auth: {
      getUser: async () => ({
        data: {
          user: state.signedIn ? { id, email: `${id}@example.invalid` } : null,
        },
        error: null,
      }),
    },
    from: (table: string) => new Query(table),
    rpc: async (name: string) => {
      rpcs.push(name);
      return {
        data: name === "ops_recurrence_at" ? "2026-02-28T00:00:00Z" : true,
        error: null,
      };
    },
  } as unknown as SupabaseClient;
  return { client, queries, rpcs, state };
}

function setup() {
  const personal = project(personalId);
  const company = project(companyId);
  scope.__opsWorkspaceTestProviders = {
    PERSONAL: { configured: () => true, client: async () => personal.client },
    FRENGLE: { configured: () => true, client: async () => company.client },
  };
  return { personal, company };
}

function request(
  path: string,
  method = "GET",
  body?: unknown,
  origin = "http://dashboard.test",
) {
  return new NextRequest(`http://dashboard.test${path}`, {
    method,
    headers: {
      Host: "dashboard.test",
      Origin: origin,
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

test("실제 회사 ops/workflow/phase2 GET은 회사 owner 데이터만 조회", async () => {
  const f = setup();
  for (const [handler, path] of [
    [ops.GET, "ops"],
    [workflow.GET, "workflow"],
    [phase2.GET, "phase2"],
  ] as const) {
    const response = await handler(request(`/api/${path}?workspace=FRENGLE`));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).workspace, "FRENGLE");
  }
  assert.deepEqual(f.personal.queries, []);
  assert.deepEqual(f.personal.rpcs, []);
  assert.equal(
    f.company.queries.filter((query) => query.table === "ops_company_members")
      .length,
    3,
  );
  for (const query of f.company.queries) {
    if (query.table === "ops_company_members")
      assert.ok(
        query.filters.some(
          ([key, value]) => key === "user_id" && value === companyId,
        ),
      );
    else if (query.filters.length)
      assert.ok(
        query.filters.some(
          ([key, value]) => key === "owner_id" && value === companyId,
        ),
      );
  }
  assert.equal(
    f.company.queries.some((query) =>
      /leave|content|inspiration/.test(query.table),
    ),
    false,
  );
});

test("회사 업무 생성은 body owner를 무시하고 회사 인증 UUID를 사용", async () => {
  const f = setup();
  const response = await ops.POST(
    request("/api/ops?workspace=FRENGLE", "POST", {
      resource: "tasks",
      owner_id: personalId,
      value: {
        title: "회사 업무",
        notes: "실제 API 입력 검증",
        status: "pending",
        priority: "normal",
        due_date: null,
        owner_id: personalId,
      },
    }),
  );
  assert.equal(response.status, 201);
  const inserted = f.company.queries.find(
    (query) => query.table === "tasks" && query.value,
  );
  assert.equal(inserted?.value?.owner_id, companyId);
  assert.equal(inserted?.value?.title, "회사 업무");
  assert.deepEqual(f.personal.queries, []);
});

test("회사 phase2 GET은 개인 capability를 false로 반환하고 개인 쓰기는 403", async () => {
  const f = setup();
  const read = await phase2.GET(request("/api/phase2?workspace=FRENGLE"));
  const data = await read.json();
  assert.equal(data.personalContent, false);
  assert.equal(data.contentHistory, false);
  assert.deepEqual(data.versions, []);
  assert.deepEqual(data.contentTasks, []);
  assert.deepEqual(data.data.content, []);
  assert.deepEqual(data.data.inspiration, []);
  assert.deepEqual(data.data.leave, []);
  for (const resource of ["leave", "content", "inspiration"]) {
    const response = await phase2.POST(
      request("/api/phase2?workspace=FRENGLE", "POST", { resource }),
    );
    assert.equal(response.status, 403);
  }
  const contentTask = await phase2.POST(
    request("/api/phase2?workspace=FRENGLE", "POST", {
      action: "content_task",
    }),
  );
  assert.equal(contentTask.status, 403);
  assert.equal(
    f.company.queries.some((query) =>
      /leave|content|inspiration/.test(query.table),
    ),
    false,
  );
  assert.deepEqual(f.personal.queries, []);
});

test("회사 회원 해제·인증 누락·외부 Origin은 core API 접근을 막음", async () => {
  for (const [handler, path] of [
    [ops.GET, "ops"],
    [workflow.GET, "workflow"],
    [phase2.GET, "phase2"],
  ] as const) {
    const f = setup();
    f.company.state.member = false;
    assert.equal(
      (await handler(request(`/api/${path}?workspace=FRENGLE`))).status,
      403,
    );
    assert.deepEqual(
      f.company.queries.map((query) => query.table),
      ["ops_company_members"],
    );
    f.company.state.signedIn = false;
    assert.equal(
      (await handler(request(`/api/${path}?workspace=FRENGLE`))).status,
      401,
    );
    assert.deepEqual(f.personal.queries, []);
  }
  const f = setup();
  for (const [handler, path] of [
    [ops.POST, "ops"],
    [workflow.POST, "workflow"],
    [phase2.POST, "phase2"],
  ] as const) {
    assert.equal(
      (
        await handler(
          request(
            `/api/${path}?workspace=FRENGLE`,
            "POST",
            {},
            "https://other.invalid",
          ),
        )
      ).status,
      403,
    );
  }
  assert.deepEqual(f.company.queries, []);
  assert.deepEqual(f.personal.queries, []);
});

test("PERSONAL은 개인 저장소를 유지하고 중복 workspace로 선택을 우회할 수 없음", async () => {
  const f = setup();
  const response = await ops.GET(request("/api/ops?workspace=PERSONAL"));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).workspace, "PERSONAL");
  assert.deepEqual(f.company.queries, []);
  assert.ok(f.personal.queries.some((query) => query.table === "tasks"));
  const before = f.personal.queries.length;
  assert.equal(
    (await ops.GET(request("/api/ops?workspace=PERSONAL&workspace=FRENGLE")))
      .status,
    403,
  );
  assert.equal(f.personal.queries.length, before);
  assert.deepEqual(f.company.queries, []);
});
