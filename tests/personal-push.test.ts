import { test } from "node:test";
import assert from "node:assert/strict";
import { createECDH } from "node:crypto";
import webPush from "web-push";
import {
  exercisePushPayload,
  parsePushEndpoint,
  parsePushSubscription,
  pushFailure,
} from "../src/lib/personal-push.ts";

const endpoint = "https://web.push.apple.com/fixture-token";
function subscription() {
  const client = createECDH("prime256v1");
  client.generateKeys();
  return {
    endpoint,
    keys: {
      p256dh: client.getPublicKey().toString("base64url"),
      auth: Buffer.alloc(16, 7).toString("base64url"),
    },
  };
}
test("푸시는 검증한 Apple·Google·Mozilla HTTPS 서비스에만 발송", () => {
  for (const valid of [
    endpoint,
    "https://fcm.googleapis.com/fcm/send/token",
    "https://updates.push.services.mozilla.com/wpush/v2/token",
  ])
    assert.equal(parsePushEndpoint(valid), valid);
  for (const invalid of [
    "http://web.push.apple.com/a",
    "https://127.0.0.1/a",
    "https://localhost/a",
    "https://web.push.apple.com.evil.test/a",
    "https://web.push.apple.com@evil.test/a",
    "https://user@web.push.apple.com/a",
    "https://web.push.apple.com:8443/a",
    "https://web.push.apple.com/a#x",
    "https://example.com/a",
    "file:///etc/passwd",
    "https://web.push.apple.com/",
  ])
    assert.throws(() => parsePushEndpoint(invalid));
});
test("기기 인증키 길이·형식 검증, 호출자가 보낸 owner 등은 보관하지 않음", () => {
  const value = subscription();
  assert.deepEqual(
    parsePushSubscription({ ...value, owner_id: "attacker", enabled: false }),
    value,
  );
  for (const invalid of [
    null,
    [],
    {},
    { endpoint, keys: {} },
    { ...value, keys: { ...value.keys, auth: "short" } },
    {
      ...value,
      keys: { ...value.keys, p256dh: Buffer.alloc(65).toString("base64url") },
    },
  ])
    assert.throws(() => parsePushSubscription(invalid));
});
test("실제 Web Push 요청은 암호화되며 날짜별 내부 캘린더 링크만 포함", () => {
  const keys = webPush.generateVAPIDKeys();
  const payload = exercisePushPayload(
    "11111111-1111-4111-8111-111111111111",
    "2026-10-21",
  );
  assert.equal(
    payload.data.url,
    "/?view=calendar&date=2026-10-21&schedule=11111111-1111-4111-8111-111111111111",
  );
  const request = webPush.generateRequestDetails(
    subscription(),
    JSON.stringify(payload),
    {
      vapidDetails: {
        subject: "https://my-ops.example",
        publicKey: keys.publicKey,
        privateKey: keys.privateKey,
      },
      TTL: 300,
    },
  );
  assert.equal(request.endpoint, endpoint);
  assert.equal(request.headers["Content-Encoding"], "aes128gcm");
  assert.ok(request.headers.Authorization);
  assert.ok(Buffer.isBuffer(request.body));
  assert.equal(request.body!.includes(Buffer.from("오늘의 운동")), false);
  assert.equal(JSON.stringify(payload).includes("video_url"), false);
});
test("만료 구독은 제거하고 일시 오류만 재시도", () => {
  assert.deepEqual(pushFailure({ statusCode: 410 }), {
    outcome: "gone",
    status: 410,
  });
  assert.equal(pushFailure({ statusCode: 404 }).outcome, "gone");
  for (const statusCode of [408, 429, 500, 503])
    assert.equal(pushFailure({ statusCode }).outcome, "retry");
  assert.equal(pushFailure(new Error("timeout")).outcome, "retry");
  for (const statusCode of [400, 401, 403])
    assert.equal(pushFailure({ statusCode }).outcome, "failed");
});
