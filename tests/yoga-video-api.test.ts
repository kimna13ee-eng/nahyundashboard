import { after, test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { NextRequest } from "next/server.js";

const scope = globalThis as typeof globalThis & {
  __yogaVideoAuth?: {
    configured: boolean;
    signedIn: boolean;
    clientError: boolean;
    authError: boolean;
    clientCalls: number;
    authCalls: number;
  };
};
const serverModule = `data:text/javascript,${encodeURIComponent(`
  export function personalConfigured() {
    return globalThis.__yogaVideoAuth.configured;
  }
  export async function personalClient() {
    const state = globalThis.__yogaVideoAuth;
    state.clientCalls++;
    if (state.clientError) throw new Error("private connection details");
    return {auth: {async getUser() {
      state.authCalls++;
      return {data: {user: state.signedIn ? {id: "fixture-owner"} : null},
        error: state.authError ? new Error("private auth details") : null};
    }}};
  }
`)}`;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/lib/supabase/server")
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
const actualFetch = globalThis.fetch;
after(() => {
  hooks.deregister();
  globalThis.fetch = actualFetch;
  delete scope.__yogaVideoAuth;
});
const route = await import("../src/app/api/personal-yoga-video/route.ts");
const video = "https://www.youtube.com/watch?v=M7lc1UVf-VE";

function setup() {
  const auth = {
    configured: true,
    signedIn: true,
    clientError: false,
    authError: false,
    clientCalls: 0,
    authCalls: 0,
  };
  scope.__yogaVideoAuth = auth;
  const upstream: { url: string; options?: RequestInit }[] = [];
  globalThis.fetch = async (input, options) => {
    upstream.push({ url: String(input), options });
    return new Response(JSON.stringify({ type: "video", title: "요가 제목" }), {
      headers: { "Content-Type": "application/json" },
    });
  };
  return { auth, upstream };
}
function request(
  body: unknown = { url: video },
  query = "workspace=PERSONAL",
  origin = "http://dashboard.test",
  raw = false,
) {
  return new NextRequest(
    `http://dashboard.test/api/personal-yoga-video?${query}`,
    {
      method: "POST",
      headers: {
        Host: "dashboard.test",
        Origin: origin,
        "Content-Type": "application/json",
        Cookie: "fixture-session=private",
        Authorization: "Bearer fixture-private",
      },
      body: raw ? String(body) : JSON.stringify(body),
    },
  );
}

test("실제 제목 조회 handler는 PERSONAL 인증 후 제목만 반환하고 인증 헤더를 전달하지 않음", async () => {
  const f = setup();
  const response = await route.POST(request());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), {
    title: "요가 제목",
    titleTruncated: false,
  });
  assert.equal(f.auth.authCalls, 1);
  assert.equal(f.upstream.length, 1);
  assert.deepEqual(f.upstream[0].options?.headers, {
    Accept: "application/json",
  });
  assert.equal(f.upstream[0].options?.credentials, "omit");
});

test("회사·ALL·중복/추가 query·외부 Origin은 인증과 upstream 호출 전에 차단", async () => {
  for (const [query, origin, expected] of [
    ["workspace=FRENGLE", "http://dashboard.test", 403],
    ["workspace=ALL", "http://dashboard.test", 403],
    ["", "http://dashboard.test", 403],
    ["workspace=PERSONAL&workspace=PERSONAL", "http://dashboard.test", 403],
    [
      "workspace=PERSONAL&url=https://evil.example",
      "http://dashboard.test",
      400,
    ],
    ["workspace=PERSONAL", "https://foreign.example", 403],
    ["workspace=PERSONAL", "", 403],
  ] as const) {
    const f = setup();
    const response = await route.POST(request(undefined, query, origin));
    assert.equal(response.status, expected);
    assert.equal(f.auth.clientCalls, 0);
    assert.equal(f.upstream.length, 0);
  }
});

test("미연결·로그인 누락·인증 오류는 외부 메타데이터를 조회하지 않음", async () => {
  for (const [field, expected] of [
    ["configured", 503],
    ["signedIn", 401],
    ["authError", 401],
    ["clientError", 503],
  ] as const) {
    const f = setup();
    f.auth[field] = field === "authError" || field === "clientError";
    const response = await route.POST(request());
    assert.equal(response.status, expected);
    assert.equal(f.upstream.length, 0);
    assert.equal(
      JSON.stringify(await response.json()).includes("private"),
      false,
    );
  }
});

test("잘못된 본문·과대 요청·URL·추가 필드는 upstream 호출 전에 차단", async () => {
  for (const [body, raw, expected] of [
    ["not-json", true, 400],
    [null, false, 400],
    [[], false, 400],
    [{}, false, 400],
    [{ url: video, owner_id: "other" }, false, 400],
    [
      { url: "https://user:pass@www.youtube.com/watch?v=M7lc1UVf-VE" },
      false,
      400,
    ],
    [
      { url: "https://www.youtube.com.evil.example/watch?v=M7lc1UVf-VE" },
      false,
      422,
    ],
    [{ url: "https://video.example/yoga" }, false, 422],
    [{ url: video + "&access_token=private" }, false, 400],
    [" ".repeat(4097), true, 413],
  ] as const) {
    const f = setup();
    const response = await route.POST(
      request(body, "workspace=PERSONAL", "http://dashboard.test", raw),
    );
    assert.equal(response.status, expected);
    assert.equal(f.upstream.length, 0);
  }
});

test("실제 handler의 공급자 실패·시간 초과도 민감한 응답 없이 전달", async () => {
  for (const [failure, expected] of [
    ["redirect", 502],
    ["large", 502],
    ["invalid", 502],
    ["timeout", 504],
  ] as const) {
    setup();
    let calls = 0;
    globalThis.fetch = async (_input, options) => {
      calls++;
      assert.equal(options?.redirect, "error");
      if (failure === "timeout")
        throw new DOMException("private upstream URL", "TimeoutError");
      if (failure === "redirect")
        return new Response("private", {
          status: 302,
          headers: { Location: "https://private.example" },
        });
      return new Response(
        failure === "large" ? "x".repeat(65537) : "private invalid response",
        {
          headers: { "Content-Type": "application/json" },
        },
      );
    };
    const response = await route.POST(request());
    assert.equal(response.status, expected);
    assert.equal(calls, 1);
    assert.equal(
      JSON.stringify(await response.json()).includes("private"),
      false,
    );
  }
});
