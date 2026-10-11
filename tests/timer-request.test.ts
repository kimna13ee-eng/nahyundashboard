import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseTimerRequest,
  timerRpcFailure,
} from "../src/lib/timer-request.ts";
const task = "11111111-1111-4111-8111-111111111111";
const session = "22222222-2222-4222-8222-222222222222";
const request = "33333333-3333-4333-8333-333333333333";
test("종료·중단은 세션 ID 필수, 시작은 새 세션 ID를 지정하지 않음", () => {
  const body = {
    command: "finish",
    task_id: task,
    request_id: request,
    summary: "원문",
    expected_session_id: session,
  };
  assert.equal(parseTimerRequest(body).p_expected_session_id, session);
  assert.equal(
    parseTimerRequest({ ...body, command: "pause" }).p_expected_session_id,
    session,
  );
  assert.equal(
    parseTimerRequest({ ...body, command: "start", expected_session_id: "bad" })
      .p_expected_session_id,
    null,
  );
  for (const expected_session_id of [undefined, null, "bad"])
    assert.throws(
      () => parseTimerRequest({ ...body, expected_session_id }),
      /세션 ID/,
    );
  assert.throws(() => parseTimerRequest({ ...body, task_id: null }), /확인/);
  assert.throws(
    () => parseTimerRequest({ ...body, request_id: "bad" }),
    /확인/,
  );
  assert.throws(
    () => parseTimerRequest({ ...body, summary: "x".repeat(10001) }),
    /확인/,
  );
});
test("타이머 보호 RPC 미적용과 세션 경합을 구분하고 안전한 메시지만 반환", () => {
  assert.equal(timerRpcFailure({ code: "PGRST202" }).status, 503);
  assert.equal(
    timerRpcFailure({ code: "42883" }).body.code,
    "TIMER_GUARD_REQUIRED",
  );
  assert.equal(timerRpcFailure({ code: "P0001" }).status, 409);
  assert.equal(timerRpcFailure({}).body.code, "TIMER_CONFLICT");
});
