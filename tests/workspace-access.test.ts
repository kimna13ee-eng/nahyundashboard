import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import {
  authenticateWorkspace,
  requestWorkspace,
  workspaceAllowsPhase2,
  WorkspaceAccessError,
  type WorkspaceProviders,
} from "../src/lib/workspace-access.ts";
import { parseCapture } from "../src/lib/workflow.ts";

function clientFixture(id: string) {
  const calls: string[] = [];
  const state = {
    user: { id, email: `${id}@example.invalid` } as User | null,
    authError: null as unknown,
    member: true,
    memberError: null as unknown,
  };
  const client = {
    auth: {
      getUser: async () => {
        calls.push("getUser");
        return { data: { user: state.user }, error: state.authError };
      },
    },
    from: (table: string) => {
      calls.push(`from:${table}`);
      return {
        select: (columns: string) => {
          calls.push(`select:${columns}`);
          return {
            eq: (column: string, value: string) => {
              calls.push(`eq:${column}:${value}`);
              return {
                maybeSingle: async () => ({
                  data: state.member ? { user_id: id } : null,
                  error: state.memberError,
                }),
              };
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;
  return { client, calls, state };
}

function fixture() {
  const personal = clientFixture("personal-owner");
  const company = clientFixture("company-owner");
  const opened: string[] = [];
  const configured = { PERSONAL: true, FRENGLE: true };
  const providers: WorkspaceProviders = {
    PERSONAL: {
      configured: () => configured.PERSONAL,
      client: async () => {
        opened.push("PERSONAL");
        return personal.client;
      },
    },
    FRENGLE: {
      configured: () => configured.FRENGLE,
      client: async () => {
        opened.push("FRENGLE");
        return company.client;
      },
    },
  };
  return { personal, company, opened, configured, providers };
}

const params = (workspace: string) => new URLSearchParams({ workspace });
const hasStatus = (status: number) => (error: unknown) =>
  error instanceof WorkspaceAccessError && error.status === status;

test("명시한 저장소만 선택하며 ALL은 기존 PERSONAL 별칭을 유지", async () => {
  assert.equal(requestWorkspace(params("ALL")), "PERSONAL");
  assert.equal(requestWorkspace(params("PERSONAL")), "PERSONAL");
  assert.equal(requestWorkspace(params("FRENGLE")), "FRENGLE");
  const f = fixture();
  const session = await authenticateWorkspace(params("ALL"), f.providers);
  assert.equal(session.workspace, "PERSONAL");
  assert.equal(session.user.id, "personal-owner");
  assert.equal(session.client, f.personal.client);
  assert.deepEqual(f.opened, ["PERSONAL"]);
  assert.deepEqual(f.personal.calls, ["getUser"]);
  assert.deepEqual(f.company.calls, []);
});

test("누락·중복·알 수 없는 workspace는 클라이언트를 열기 전에 차단", async () => {
  const f = fixture();
  for (const query of [
    "",
    "workspace=personal",
    "workspace=UNKNOWN",
    "workspace=PERSONAL&workspace=FRENGLE",
    "workspace=FRENGLE&workspace=FRENGLE",
  ]) {
    await assert.rejects(
      authenticateWorkspace(new URLSearchParams(query), f.providers),
      hasStatus(403),
    );
  }
  assert.deepEqual(f.opened, []);
});

test("회사 환경 설정·인증 실패 시 유효한 개인 계정으로 우회하지 않음", async () => {
  const f = fixture();
  f.configured.FRENGLE = false;
  await assert.rejects(
    authenticateWorkspace(params("FRENGLE"), f.providers),
    hasStatus(503),
  );
  assert.deepEqual(f.opened, []);
  f.configured.FRENGLE = true;
  f.company.state.user = null;
  await assert.rejects(
    authenticateWorkspace(params("FRENGLE"), f.providers),
    hasStatus(401),
  );
  f.company.state.user = { id: "company-owner" } as User;
  f.company.state.authError = new Error("expired company session");
  await assert.rejects(
    authenticateWorkspace(params("FRENGLE"), f.providers),
    hasStatus(401),
  );
  assert.deepEqual(f.opened, ["FRENGLE", "FRENGLE"]);
  assert.deepEqual(f.personal.calls, []);
});

test("회사 인증은 회사 UUID로 회원 권한을 확인하고 회원 해제를 매 요청에 반영", async () => {
  const f = fixture();
  const session = await authenticateWorkspace(params("FRENGLE"), f.providers);
  assert.equal(session.client, f.company.client);
  assert.equal(session.user.id, "company-owner");
  assert.deepEqual(f.company.calls, [
    "getUser",
    "from:ops_company_members",
    "select:user_id",
    "eq:user_id:company-owner",
  ]);
  f.company.state.member = false;
  await assert.rejects(
    authenticateWorkspace(params("FRENGLE"), f.providers),
    hasStatus(403),
  );
  assert.equal(f.company.calls.filter((call) => call === "getUser").length, 2);
  assert.deepEqual(f.personal.calls, []);
});

test("회원 조회 오류를 권한으로 간주하지 않으며 인증 연결 오류 원문을 노출하지 않음", async () => {
  const f = fixture();
  f.company.state.memberError = { message: "membership unavailable" };
  await assert.rejects(
    authenticateWorkspace(params("FRENGLE"), f.providers),
    hasStatus(403),
  );
  f.providers.FRENGLE.client = async () => {
    throw new Error("private upstream details");
  };
  await assert.rejects(
    authenticateWorkspace(params("FRENGLE"), f.providers),
    (error) => {
      assert.ok(error instanceof WorkspaceAccessError);
      assert.equal(error.status, 503);
      assert.doesNotMatch(error.message, /private|upstream/);
      return true;
    },
  );
  assert.deepEqual(f.personal.calls, []);
});

test("회사 phase2는 반복 일정만 허용하고 개인 연차·콘텐츠·인스퍼레이션은 분리", () => {
  for (const resource of ["recurrence", "exceptions"]) {
    assert.equal(workspaceAllowsPhase2("FRENGLE", resource), true);
    assert.equal(workspaceAllowsPhase2("PERSONAL", resource), true);
  }
  for (const resource of ["content", "inspiration", "leave"]) {
    assert.equal(workspaceAllowsPhase2("FRENGLE", resource), false);
    assert.equal(workspaceAllowsPhase2("PERSONAL", resource), true);
  }
  for (const resource of ["ops_leave_settings", "personal-sheets", "unknown"]) {
    assert.equal(workspaceAllowsPhase2("FRENGLE", resource), false);
    assert.equal(workspaceAllowsPhase2("PERSONAL", resource), false);
  }
});

test("수집 입력은 인증된 저장소와 일치해야 하며 저장할 행에 workspace를 삽입하지 않음", () => {
  const company = parseCapture(
    { workspace: "FRENGLE", title: "회사 업무" },
    "FRENGLE",
  );
  assert.equal(company.title, "회사 업무");
  assert.equal(Object.hasOwn(company, "workspace"), false);
  assert.throws(() =>
    parseCapture({ workspace: "PERSONAL", title: "다른 저장소" }, "FRENGLE"),
  );
  assert.throws(() =>
    parseCapture({ workspace: "FRENGLE", title: "다른 저장소" }, "PERSONAL"),
  );
  assert.throws(() =>
    parseCapture({ workspace: "ALL", title: "모호한 저장소" }, "PERSONAL"),
  );
});
