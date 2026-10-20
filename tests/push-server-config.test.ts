import { test } from "node:test";
import assert from "node:assert/strict";
import { createECDH } from "node:crypto";
import { inspectPushConfiguration } from "../src/lib/personal-push-config.ts";

function environment() {
  const pair = createECDH("prime256v1");
  pair.generateKeys();
  return {
    APP_PUBLIC_URL: "https://dashboard.example/",
    PERSONAL_SUPABASE_URL: "https://fixtureproject.supabase.co/",
    PERSONAL_SUPABASE_SECRET_KEY: "sb_secret_" + "fixture_server_value_12345",
    PERSONAL_PUSH_VAPID_PUBLIC_KEY: pair.getPublicKey().toString("base64url"),
    PERSONAL_PUSH_VAPID_PRIVATE_KEY: pair.getPrivateKey().toString("base64url"),
    PERSONAL_PUSH_DISPATCH_SECRET: "d".repeat(43),
  };
}
function jwt(role: string) {
  return [
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
      "base64url",
    ),
    Buffer.from(JSON.stringify({ role })).toString("base64url"),
    "fixture_signature",
  ].join(".");
}
const readyChecks = {
  appUrl: true,
  databaseUrl: true,
  serviceKey: true,
  vapidKeyPair: true,
  dispatchSecret: true,
};

test("비어 있는 푸시 설정은 다섯 boolean만 반환하며 config는 null", () => {
  const state = inspectPushConfiguration({});
  assert.equal(state.config, null);
  assert.deepEqual(state.checks, {
    appUrl: false,
    databaseUrl: false,
    serviceKey: false,
    vapidKeyPair: false,
    dispatchSecret: false,
  });
  assert.equal(
    Object.values(state.checks).every((value) => typeof value === "boolean"),
    true,
  );
});

test("유효한 설정은 기존 config 형식과 정규화된 origin을 유지", () => {
  const env = environment();
  const state = inspectPushConfiguration(env);
  assert.deepEqual(state.checks, readyChecks);
  assert.deepEqual(state.config, {
    publicKey: env.PERSONAL_PUSH_VAPID_PUBLIC_KEY,
    privateKey: env.PERSONAL_PUSH_VAPID_PRIVATE_KEY,
    dispatchSecret: env.PERSONAL_PUSH_DISPATCH_SECRET,
    secretKey: env.PERSONAL_SUPABASE_SECRET_KEY,
    databaseUrl: "https://fixtureproject.supabase.co",
    origin: "https://dashboard.example",
  });
  const diagnostic = JSON.stringify(state.checks);
  for (const value of Object.values(env))
    assert.equal(diagnostic.includes(value), false);
});

test("VAPID 불일치·누락·형식 오류는 다른 설정 상태와 독립적으로 실패", () => {
  const env = environment();
  for (const change of [
    {
      PERSONAL_PUSH_VAPID_PUBLIC_KEY:
        environment().PERSONAL_PUSH_VAPID_PUBLIC_KEY,
    },
    { PERSONAL_PUSH_VAPID_PUBLIC_KEY: "" },
    { PERSONAL_PUSH_VAPID_PRIVATE_KEY: "" },
    { PERSONAL_PUSH_VAPID_PRIVATE_KEY: "invalid" },
  ]) {
    const state = inspectPushConfiguration({ ...env, ...change });
    assert.equal(state.config, null);
    assert.deepEqual(state.checks, { ...readyChecks, vapidKeyPair: false });
  }
});

test("서버 키는 새 secret 또는 legacy service_role JWT만 허용", () => {
  const env = environment();
  for (const key of [
    "",
    "sb_publishable_fixture",
    "sb_secret_short",
    "not-a-key",
    jwt("anon"),
    jwt("authenticated"),
    "eyJinvalid.notjson.signature",
  ]) {
    const state = inspectPushConfiguration({
      ...env,
      PERSONAL_SUPABASE_SECRET_KEY: key,
    });
    assert.equal(state.config, null);
    assert.deepEqual(state.checks, { ...readyChecks, serviceKey: false });
  }
  const state = inspectPushConfiguration({
    ...env,
    PERSONAL_SUPABASE_SECRET_KEY: jwt("service_role"),
  });
  assert.deepEqual(state.checks, readyChecks);
  assert.ok(state.config);
});

test("앱 HTTPS origin·개인 Supabase URL 검증은 각각 별도 boolean", () => {
  const env = environment();
  for (const APP_PUBLIC_URL of [
    "",
    "invalid",
    "http://dashboard.example",
    "https://user:pass@dashboard.example",
    "https://dashboard.example:8443",
  ]) {
    const state = inspectPushConfiguration({ ...env, APP_PUBLIC_URL });
    assert.equal(state.config, null);
    assert.deepEqual(state.checks, { ...readyChecks, appUrl: false });
  }
  for (const PERSONAL_SUPABASE_URL of [
    "",
    "invalid",
    "http://fixtureproject.supabase.co",
    "https://example.com",
    "https://fixtureproject.supabase.co.evil.example",
  ]) {
    const state = inspectPushConfiguration({ ...env, PERSONAL_SUPABASE_URL });
    assert.equal(state.config, null);
    assert.deepEqual(state.checks, { ...readyChecks, databaseUrl: false });
  }
  assert.equal(
    inspectPushConfiguration({
      ...env,
      APP_PUBLIC_URL: "https://dashboard.example/path?unused=1",
    }).config?.origin,
    "https://dashboard.example",
  );
});

test("발송 인증 문자열 오류의 진단에는 값이나 길이를 포함하지 않음", () => {
  const env = environment();
  for (const PERSONAL_PUSH_DISPATCH_SECRET of [
    "",
    "short",
    "x".repeat(129),
    "a".repeat(42) + "+",
  ]) {
    const state = inspectPushConfiguration({
      ...env,
      PERSONAL_PUSH_DISPATCH_SECRET,
    });
    assert.equal(state.config, null);
    assert.deepEqual(state.checks, { ...readyChecks, dispatchSecret: false });
    assert.deepEqual(Object.keys(state.checks), Object.keys(readyChecks));
  }
});
