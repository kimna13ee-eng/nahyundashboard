import { containsSecret, uuid, type OpsRow } from "./ops.ts";
import type { DataWorkspace } from "./workspace-access.ts";
export const contactStates = {
  none: "해당 없음",
  planned: "연락 예정",
  sent: "발송 완료",
  waiting: "회신 대기",
  materials: "자료 전달 필요",
  follow_up: "후속 연락 예정",
  answered: "응답 완료",
  closed: "종료",
};
export const runStates = {
  scheduled: "예정",
  running: "수행 중",
  completed: "완료",
  unconfirmed: "실행 미확인",
  delayed: "지연",
  held: "보류",
};
export function safeText(value: unknown, max = 2000, required = false) {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (required && !value.trim()) ||
    containsSecret(value)
  )
    throw new Error("입력 길이·필수값·비밀정보를 확인해 주세요.");
  return value;
}
export function timestamp(value: unknown) {
  if (value == null || value === "") return null;
  if (
    typeof value !== "string" ||
    value.length > 50 ||
    !/(Z|[+-]\d{2}:\d{2})$/.test(value) ||
    !Number.isFinite(Date.parse(value))
  )
    throw new Error("시각과 타임존을 확인해 주세요.");
  return new Date(value).toISOString();
}
export function parseCapture(
  raw: Record<string, unknown>,
  expectedWorkspace: DataWorkspace = "PERSONAL",
) {
  if (raw.workspace !== expectedWorkspace)
    throw new Error("현재 워크스페이스와 저장 위치를 확인해 주세요.");
  if (raw.project_id && !uuid(raw.project_id))
    throw new Error("프로젝트 연결을 확인해 주세요.");
  return {
    title: safeText(raw.title, 120, true),
    notes: safeText(raw.notes ?? ""),
    source: safeText(raw.source ?? "", 80),
    project_id: raw.project_id || null,
    schedule_at: timestamp(raw.schedule_at),
  };
}
export function parseParkContext(raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("중단 맥락을 확인해 주세요.");
  const v = raw as Record<string, unknown>;
  return Object.fromEntries(
    ["last_stage", "next_action", "last_file", "reason"].map((key) => [
      key,
      safeText(v[key] ?? ""),
    ]),
  );
}
export function recurrenceStatus(
  occurrence: OpsRow,
  run: OpsRow | undefined,
  now: number,
) {
  if (run && run.status !== "scheduled") return String(run.status);
  return Date.parse(String(occurrence.starts_at)) < now
    ? "unconfirmed"
    : "scheduled";
}
export function savedSnapshot(contexts: OpsRow[], sessionId: unknown) {
  return contexts
    .filter((c) => c.session_id === sessionId)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0]
    ?.payload as Record<string, unknown> | undefined;
}
