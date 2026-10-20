import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { dispatchAuthorized } from "../src/lib/push-dispatch-auth.ts";
const secret = "fixture-only-dispatch-secret";
const timestamp = "1792501200";
const signature = createHmac("sha256", secret)
  .update(`exercise-push:${timestamp}`)
  .digest("hex");
test("예약 호출은 올바른 짧은 서명만 허용하고 오래된·미래·다른 키·변조 요청은 거부", () => {
  const now = Number(timestamp) * 1000;
  assert.equal(dispatchAuthorized(timestamp, signature, secret, now), true);
  assert.equal(
    dispatchAuthorized(timestamp, signature, secret, now + 300000),
    true,
  );
  assert.equal(
    dispatchAuthorized(timestamp, signature, secret, now + 301000),
    false,
  );
  assert.equal(
    dispatchAuthorized(timestamp, signature, secret, now - 31000),
    false,
  );
  assert.equal(dispatchAuthorized(timestamp, signature, "other", now), false);
  assert.equal(
    dispatchAuthorized(String(Number(timestamp) + 1), signature, secret, now),
    false,
  );
  for (const invalid of [
    null,
    "",
    "Bearer token",
    signature.slice(1),
    "x".repeat(64),
  ])
    assert.equal(dispatchAuthorized(timestamp, invalid, secret, now), false);
  assert.equal(dispatchAuthorized(null, signature, secret, now), false);
});
