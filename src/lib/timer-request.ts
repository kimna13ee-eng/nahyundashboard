import { uuid } from "./ops.ts";
import { parseParkContext } from "./workflow.ts";

export function parseTimerRequest(raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("타이머 요청을 확인해 주세요.");
  const body = raw as Record<string, unknown>;
  if (
    !["start", "pause", "finish"].includes(String(body.command)) ||
    !uuid(body.request_id) ||
    !uuid(body.task_id) ||
    typeof body.summary !== "string" ||
    body.summary.length > 10000
  )
    throw new Error("타이머 요청을 확인해 주세요.");
  if (body.command !== "start" && !uuid(body.expected_session_id))
    throw new Error("선택한 세션 ID를 확인하고 새로고침해 주세요.");
  return {
    p_command: String(body.command),
    p_task_id: body.task_id,
    p_request_id: body.request_id,
    p_expected_session_id:
      body.command === "start" ? null : (body.expected_session_id as string),
    p_summary: body.summary,
    p_context: parseParkContext(body.context ?? {}),
  };
}
export function timerRpcFailure(error: { code?: string }) {
  const missing = ["PGRST202", "42883"].includes(error.code || "");
  return {
    status: missing ? 503 : 409,
    body: {
      code: missing ? "TIMER_GUARD_REQUIRED" : "TIMER_CONFLICT",
      error: missing
        ? "타이머 보호 SQL010 적용·연결 확인이 필요합니다. DB 새로고침 후 다시 확인해 주세요."
        : "타이머 처리 실패. 선택한 세션 또는 다른 탭의 상태를 새로고침하고 재시도하세요.",
    },
  };
}
