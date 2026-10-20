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
  selected?: string;
  value?: Record<string, unknown>;
};
const personalId = "11111111-1111-4111-8111-111111111111";
const companyId = "22222222-2222-4222-8222-222222222222";
const rowId = "33333333-3333-4333-8333-333333333333";

function project(id: string) {
  const queries: QueryRecord[] = [];
  const rpcs: string[] = [];
  const rpcCalls: { name: string; args?: Record<string, unknown> }[] = [];
  const state = {
    member: true,
    signedIn: true,
    projectProcessReady: true,
    yogaMetadataReady: true,
    mutationError: null as { message: string; code?: string } | null,
    rpcError: null as { message: string; code?: string } | null,
  };
  class Query {
    record: QueryRecord;
    constructor(table: string) {
      this.record = { table, filters: [] };
      queries.push(this.record);
    }
    select(columns?: string) {
      this.record.selected = columns;
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
      return {
        data: [],
        error:
          this.record.selected === "duration_minutes" &&
          !state.yogaMetadataReady
            ? { message: "column duration_minutes does not exist" }
            : null,
        count: 0,
      };
    }
    async maybeSingle() {
      return {
        data:
          this.record.table === "ops_company_members"
            ? state.member
              ? { user_id: id }
              : null
            : { id: rowId, ...this.record.value },
        error: this.record.value ? state.mutationError : null,
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
    rpc: async (name: string, args?: Record<string, unknown>) => {
      rpcs.push(name);
      rpcCalls.push({ name, args });
      return {
        data:
          name === "ops_recurrence_at"
            ? "2026-02-28T00:00:00Z"
            : name === "ops_project_save"
              ? rowId
              : name === "ops_project_process_ready"
                ? state.projectProcessReady
                : true,
        error: name === "ops_project_save" ? state.rpcError : null,
      };
    },
  } as unknown as SupabaseClient;
  return { client, queries, rpcs, rpcCalls, state };
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

test("프로젝트 단계 저장은 선택한 공간의 원자 RPC만 호출하고 owner 입력을 무시", async () => {
  for (const workspace of ["PERSONAL", "FRENGLE"] as const) {
    const f = setup();
    const target = workspace === "PERSONAL" ? f.personal : f.company;
    const timestamp = "2026-10-20T09:10:11.123456+09:00";
    const value = {
      title: "프로젝트",
      description: "기획",
      status: "active",
      project_category: "development",
      process_steps: [{ id: "stable", title: "자료 수집", done: true }],
      expected_updated_at: timestamp,
      owner_id: "untrusted",
    };
    const response = await ops.PATCH(
      request(`/api/ops?workspace=${workspace}`, "PATCH", {
        resource: "projects",
        id: rowId,
        value,
      }),
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { row: { id: rowId } });
    assert.deepEqual(target.rpcCalls, [
      {
        name: "ops_project_save",
        args: {
          p_id: rowId,
          p_title: value.title,
          p_description: value.description,
          p_status: value.status,
          p_category: value.project_category,
          p_steps: value.process_steps,
          p_expected_updated_at: timestamp,
        },
      },
    ]);
    assert.equal(
      target.queries.some((query) => query.value),
      false,
    );
    assert.deepEqual(
      (workspace === "PERSONAL" ? f.company : f.personal).queries,
      [],
    );
  }
});

test("잘못된 프로젝트 목록은 RPC 이전에 차단하고 분류만 수정할 때 기존 단계는 유지", async () => {
  const f = setup();
  const duplicate = { id: "a", title: "단계", done: false };
  const invalid = await ops.POST(
    request("/api/ops?workspace=FRENGLE", "POST", {
      resource: "projects",
      value: {
        title: "프로젝트",
        description: "",
        status: "active",
        project_category: "content",
        process_steps: [duplicate, duplicate],
      },
    }),
  );
  assert.equal(invalid.status, 400);
  assert.deepEqual(f.company.rpcs, []);
  const category = await ops.PATCH(
    request("/api/ops?workspace=FRENGLE", "PATCH", {
      resource: "projects",
      id: rowId,
      value: { project_category: "operations" },
    }),
  );
  assert.equal(category.status, 200);
  assert.deepEqual(f.company.queries.find((query) => query.value)?.value, {
    project_category: "operations",
  });
  assert.equal(
    f.company.queries.some((query) => query.table === "tasks"),
    false,
  );
  assert.deepEqual(f.company.rpcs, []);
});

test("프로젝트 기능 readiness와 진행 타이머·동시편집 실패를 실제 handler가 전달", async () => {
  const f = setup();
  let response = await ops.GET(request("/api/ops?workspace=FRENGLE"));
  assert.equal((await response.json()).projectProcessReady, true);
  f.company.state.projectProcessReady = false;
  response = await ops.GET(request("/api/ops?workspace=FRENGLE"));
  assert.equal((await response.json()).projectProcessReady, false);
  for (const [message, expected] of [
    ["Project step has an active timer", "진행 중인 타이머를 먼저 마쳐주세요."],
    [
      "Project changed since editing",
      "프로젝트가 다른 화면에서 변경됐습니다. 다시 열어 확인해 주세요.",
    ],
  ]) {
    f.company.state.rpcError = { message };
    const failed = await ops.PATCH(
      request("/api/ops?workspace=FRENGLE", "PATCH", {
        resource: "projects",
        id: rowId,
        value: {
          title: "프로젝트",
          description: "",
          status: "active",
          project_category: "other",
          process_steps: [],
        },
      }),
    );
    assert.equal(failed.status, 409);
    assert.equal((await failed.json()).error, expected);
  }
  f.company.state.mutationError = {
    message: "Project step has an active timer",
  };
  const directTask = await ops.PATCH(
    request("/api/ops?workspace=FRENGLE", "PATCH", {
      resource: "tasks",
      id: rowId,
      value: {
        title: "단계",
        notes: "메모",
        status: "completed",
        priority: "normal",
        due_date: null,
      },
    }),
  );
  assert.equal(directTask.status, 409);
  assert.equal(
    (await directTask.json()).error,
    "진행 중인 타이머를 먼저 마쳐주세요.",
  );
});

test("PERSONAL 일정 부분수정은 제목·영상만 owner 범위에서 갱신", async () => {
  for (const value of [
    { title: "콘텐츠명 변경" },
    { title: "운동명 변경", video_url: "https://video.example/yoga" },
    { title: "운동 알림 링크 비우기", video_url: "" },
  ]) {
    const f = setup();
    const response = await ops.PATCH(
      request("/api/ops?workspace=PERSONAL", "PATCH", {
        resource: "schedules",
        id: rowId,
        owner_id: companyId,
        value,
      }),
    );
    assert.equal(response.status, 200);
    const writes = f.personal.queries.filter((query) => query.value);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].table, "ops_schedules");
    // No timestamps are sent back to Postgres: original fractional precision,
    // project, notes, and category remain untouched even for a 1µs interval.
    assert.deepEqual(writes[0].value, value);
    assert.deepEqual(writes[0].filters, [
      ["id", rowId],
      ["owner_id", personalId],
    ]);
    assert.deepEqual(f.company.queries, []);
  }
});

test("PERSONAL 일정 부분수정은 숨긴 필드와 불량 입력을 DB 갱신 전에 거절", async () => {
  for (const value of [
    {},
    { title: " " },
    { title: "가".repeat(121) },
    { title: "영상", video_url: "http://video.example/yoga" },
    ...["project_id", "notes", "category", "owner_id", "timezone"].map(
      (key) => ({ title: "콘텐츠", [key]: "hidden" }),
    ),
    { title: "잘못된 시간", starts_at: "2026-10-20T00:00:00+09:00" },
    { title: "잘못된 시간", ends_at: "2026-10-21T00:00:00+09:00" },
    { title: "잘못된 시간", starts_at: null, ends_at: null },
  ]) {
    const f = setup();
    const response = await ops.PATCH(
      request("/api/ops?workspace=PERSONAL", "PATCH", {
        resource: "schedules",
        id: rowId,
        value,
      }),
    );
    assert.equal(response.status, 400);
    assert.equal(
      f.personal.queries.some((query) => query.value),
      false,
    );
    assert.deepEqual(f.company.queries, []);
  }
});

test("개인 신규와 회사 일정은 제목만으로 저장하지 않고 전체 시간 계약을 유지", async () => {
  for (const [workspace, method] of [
    ["PERSONAL", "POST"],
    ["FRENGLE", "POST"],
    ["FRENGLE", "PATCH"],
  ] as const) {
    const f = setup();
    const response = await ops[method](
      request(`/api/ops?workspace=${workspace}`, method, {
        resource: "schedules",
        ...(method === "PATCH" ? { id: rowId } : {}),
        value: { title: "시간 없는 일정" },
      }),
    );
    assert.equal(response.status, 400);
    assert.equal(
      f.personal.queries.some((query) => query.value),
      false,
    );
    assert.equal(
      f.company.queries.some((query) => query.value),
      false,
    );
  }
  for (const workspace of ["PERSONAL", "FRENGLE"] as const) {
    for (const method of ["POST", "PATCH"] as const) {
      const f = setup();
      const target = workspace === "PERSONAL" ? f.personal : f.company;
      const value = {
        title: "전체 일정",
        starts_at: "2026-10-20T21:00:00+09:00",
        ends_at: "2026-10-20T22:00:00+09:00",
        project_id: rowId,
        notes: "기존 전체 폼",
      };
      const response = await ops[method](
        request(`/api/ops?workspace=${workspace}`, method, {
          resource: "schedules",
          ...(method === "PATCH" ? { id: rowId } : {}),
          value,
        }),
      );
      assert.equal(response.status, method === "POST" ? 201 : 200);
      assert.deepEqual(target.queries.find((query) => query.value)?.value, {
        ...value,
        starts_at: "2026-10-20T12:00:00.000Z",
        ends_at: "2026-10-20T13:00:00.000Z",
        timezone: "Asia/Seoul",
        ...(method === "POST"
          ? { owner_id: workspace === "PERSONAL" ? personalId : companyId }
          : {}),
      });
      assert.deepEqual(
        (workspace === "PERSONAL" ? f.company : f.personal).queries,
        [],
      );
    }
  }
});

test("개인 일정 부분수정도 로그인·Origin·ID 검증을 우회하지 않음", async () => {
  for (const failure of ["signed-out", "origin", "id"] as const) {
    const f = setup();
    if (failure === "signed-out") f.personal.state.signedIn = false;
    const response = await ops.PATCH(
      request(
        "/api/ops?workspace=PERSONAL",
        "PATCH",
        {
          resource: "schedules",
          id: failure === "id" ? "invalid-id" : rowId,
          value: { title: "콘텐츠" },
        },
        failure === "origin"
          ? "https://other.invalid"
          : "http://dashboard.test",
      ),
    );
    assert.equal(
      response.status,
      failure === "signed-out" ? 401 : failure === "origin" ? 403 : 400,
    );
    assert.equal(
      f.personal.queries.some((query) => query.value),
      false,
    );
    assert.deepEqual(f.company.queries, []);
  }
});

test("요가 metadata capability는 PERSONAL 열 조회 성공시에만 true, 회사는 probe하지 않음", async () => {
  for (const ready of [true, false]) {
    const f = setup();
    f.personal.state.yogaMetadataReady = ready;
    const response = await ops.GET(request("/api/ops?workspace=PERSONAL"));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).yogaMetadataReady, ready);
    assert.equal(
      f.personal.queries.filter(
        (query) => query.selected === "duration_minutes",
      ).length,
      1,
    );
    assert.deepEqual(f.company.queries, []);
  }
  const f = setup();
  const response = await ops.GET(request("/api/ops?workspace=FRENGLE"));
  assert.equal((await response.json()).yogaMetadataReady, false);
  assert.equal(
    f.company.queries.some((query) => query.selected === "duration_minutes"),
    false,
  );
  assert.deepEqual(f.personal.queries, []);
});

test("PERSONAL 요가 생성·부분수정은 유효 duration만 저장하고 미전송은 그대로 보존", async () => {
  for (const duration of [1, 1440, null]) {
    for (const method of ["POST", "PATCH"] as const) {
      const f = setup();
      const value = {
        title: "요가 제목",
        duration_minutes: duration,
        ...(method === "POST"
          ? {
              starts_at: "2026-10-20T21:00:00+09:00",
              ends_at: "2026-10-20T22:00:00+09:00",
              category: "exercise",
              video_url: "https://video.example/yoga",
            }
          : {}),
      };
      const response = await ops[method](
        request("/api/ops?workspace=PERSONAL", method, {
          resource: "schedules",
          id: rowId,
          value,
        }),
      );
      assert.equal(response.status, method === "POST" ? 201 : 200);
      const write = f.personal.queries.find((query) => query.value)!;
      assert.equal(write.value?.duration_minutes, duration);
      if (method === "PATCH") {
        assert.deepEqual(write.value, value);
        assert.deepEqual(write.filters, [
          ["id", rowId],
          ["owner_id", personalId],
        ]);
      }
      assert.deepEqual(f.company.queries, []);
    }
  }
  const f = setup();
  const response = await ops.PATCH(
    request("/api/ops?workspace=PERSONAL", "PATCH", {
      resource: "schedules",
      id: rowId,
      value: { title: "제목만 변경" },
    }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(f.personal.queries.find((query) => query.value)?.value, {
    title: "제목만 변경",
  });
});

test("요가 소요 시간은 잘못된 입력·인증·외부 origin을 DB 쓰기 전에 거절", async () => {
  for (const duration of [0, -1, 1441, 0.5, "20", true, {}]) {
    const f = setup();
    const response = await ops.PATCH(
      request("/api/ops?workspace=PERSONAL", "PATCH", {
        resource: "schedules",
        id: rowId,
        value: { title: "요가", duration_minutes: duration },
      }),
    );
    assert.equal(response.status, 400);
    assert.equal(
      f.personal.queries.some((query) => query.value),
      false,
    );
  }
  for (const reason of ["signed-out", "origin"] as const) {
    const f = setup();
    f.personal.state.signedIn = reason !== "signed-out";
    const response = await ops.PATCH(
      request(
        "/api/ops?workspace=PERSONAL",
        "PATCH",
        {
          resource: "schedules",
          id: rowId,
          value: { title: "요가", duration_minutes: 20 },
        },
        reason === "origin" ? "https://other.invalid" : "http://dashboard.test",
      ),
    );
    assert.equal(response.status, reason === "signed-out" ? 401 : 403);
    assert.equal(
      f.personal.queries.some((query) => query.value),
      false,
    );
    assert.deepEqual(f.company.queries, []);
  }
});

test("회사 일정 duration 키는 null까지 거절하고 개인 DB로 우회하지 않음", async () => {
  for (const duration of [20, null, "20", 0]) {
    for (const method of ["POST", "PATCH"] as const) {
      const f = setup();
      const response = await ops[method](
        request("/api/ops?workspace=FRENGLE", method, {
          resource: "schedules",
          id: rowId,
          value: {
            title: "회사 일정",
            starts_at: "2026-10-20T21:00:00+09:00",
            ends_at: "2026-10-20T22:00:00+09:00",
            duration_minutes: duration,
          },
        }),
      );
      assert.equal(response.status, 403);
      assert.equal(
        f.company.queries.some((query) => query.table === "ops_schedules"),
        false,
      );
      assert.deepEqual(f.personal.queries, []);
    }
  }
});
