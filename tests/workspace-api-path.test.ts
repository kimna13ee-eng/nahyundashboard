import { test } from "node:test";
import assert from "node:assert/strict";
import {
  currentApiWorkspace,
  workspaceApiPath,
  workspaceFromPathname,
} from "../src/lib/workspace-api.ts";

test("URL resolver는 각 탭 pathname으로만 워크스페이스를 결정", () => {
  for (const path of [
    "/frengle",
    "/frengle/",
    "/frengle/projects",
    "/frengle?view=calendar",
  ])
    assert.equal(workspaceFromPathname(path), "FRENGLE");
  for (const path of [
    "/",
    "/demo",
    "/frengle-other",
    "/Frengle",
    null,
    undefined,
  ])
    assert.equal(workspaceFromPathname(path), "PERSONAL");
});

test("URL resolver는 공유 API의 이전·중복 workspace query를 덮어씀", () => {
  for (const route of ["/api/ops", "/api/workflow", "/api/phase2"]) {
    assert.equal(
      workspaceApiPath(route, "PERSONAL"),
      route + "?workspace=PERSONAL",
    );
    assert.equal(
      workspaceApiPath(route + "?workspace=PERSONAL", "FRENGLE"),
      route + "?workspace=FRENGLE",
    );
    const parsed = new URL(
      workspaceApiPath(
        route + "?filter=a&workspace=ALL&workspace=PERSONAL",
        "FRENGLE",
      ),
      "https://fixture.invalid",
    );
    assert.deepEqual(parsed.searchParams.getAll("workspace"), ["FRENGLE"]);
    assert.equal(parsed.searchParams.get("filter"), "a");
  }
});

test("URL resolver는 로그인·세션·자동화 결과의 독립 endpoint를 선택", () => {
  for (const [personal, company] of [
    ["/api/auth", "/api/frengle/auth"],
    ["/api/session", "/api/frengle/session"],
    ["/api/automation-results", "/api/frengle/results"],
  ]) {
    assert.equal(workspaceApiPath(personal, "FRENGLE"), company);
    assert.equal(workspaceApiPath(personal, "PERSONAL"), personal);
    assert.equal(workspaceApiPath(company, "PERSONAL"), personal);
    assert.equal(workspaceApiPath(company, "FRENGLE"), company);
  }
});

test("URL resolver는 회사 탭의 개인 전용 기능과 외부 URL을 거절", () => {
  for (const route of [
    "/api/leave",
    "/api/personal-sheets",
    "/api/personal-push/test",
  ]) {
    assert.throws(() => workspaceApiPath(route, "FRENGLE"), /PERSONAL에서만/);
    assert.equal(
      workspaceApiPath(route, "PERSONAL"),
      route + "?workspace=PERSONAL",
    );
  }
  assert.equal(
    workspaceApiPath("/api/desktop-download", "FRENGLE"),
    "/api/desktop-download",
  );
  for (const route of [
    "https://external.example/api/ops",
    "//external.example/api/ops",
    "/frengle",
    "/api/../../auth",
  ])
    assert.throws(() => workspaceApiPath(route, "PERSONAL"));
});

test("URL resolver의 기본값은 호출 탭 URL을 매번 읽고 전역 선택을 저장하지 않음", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  try {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { location: { pathname: "/frengle" } },
    });
    assert.equal(currentApiWorkspace(), "FRENGLE");
    assert.equal(workspaceApiPath("/api/ops"), "/api/ops?workspace=FRENGLE");
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { location: { pathname: "/" } },
    });
    assert.equal(workspaceApiPath("/api/ops"), "/api/ops?workspace=PERSONAL");
  } finally {
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
