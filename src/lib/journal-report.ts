import { intervalSecondsForDay, type OpsData } from "./ops.ts";
import { isVerificationRecord } from "./content-analytics.ts";

export function journalEntries(
  data: OpsData,
  day: string,
  now: number,
  excludeTests: boolean,
) {
  const tasks = new Map(
    (data.tasks || [])
      .filter((t) => !excludeTests || !isVerificationRecord(t))
      .map((t) => [t.id, t]),
  );
  const entries = (data.work_sessions || [])
    .filter((s) => tasks.has(String(s.task_id)))
    .map((s) => ({
      session: s,
      task: tasks.get(String(s.task_id))!,
      seconds: intervalSecondsForDay(
        (data.session_intervals || []).filter((i) => i.session_id === s.id),
        now,
        day,
      ),
    }))
    .filter((e) => e.seconds > 0);
  return entries;
}

export function journalReport(
  data: OpsData,
  day: string,
  now: number,
  excludeTests: boolean,
) {
  const entries = journalEntries(data, day, now, excludeTests);
  const total = entries.reduce((n, e) => n + e.seconds, 0);
  const lines = [
    "# PERSONAL 작업 일지",
    "",
    `날짜: ${day} (Asia/Seoul)`,
    `선택 날짜 작업 시간: ${(total / 60).toFixed(1)}분 · 작업 세션: ${entries.length}개`,
    `검증용 제목: ${excludeTests ? "제외" : "포함"}`,
    "",
    "조회된 PERSONAL 기록의 수동 요약입니다. 진행 중 구간은 생성 시각까지 계산합니다. 조회 제한이 있으면 전체 기록이 아닙니다.",
    "",
  ];
  for (const e of entries) {
    lines.push(
      `## ${String(e.task.title).replace(/[\r\n]/g, " ")}`,
      `${(e.seconds / 60).toFixed(1)}분 · 현재 상태 ${String(e.session.status)}`,
      "",
      "세션 전체 요약 (선택 날짜만의 요약이 아님):",
      String(e.session.summary || "요약 없음"),
      "",
    );
  }
  const ids = new Set(entries.map((e) => e.task.id));
  const next = (data.task_notes || []).filter(
    (n) => ids.has(String(n.task_id)) && n.kind === "next_action" && !n.done,
  );
  if (next.length)
    lines.push(
      "## 현재 미완료 다음 액션",
      ...next.map((n) => `- ${String(n.body).replace(/[\r\n]/g, " ")}`),
      "",
    );
  if (!entries.length) lines.push("선택 날짜에 집계할 작업 구간이 없습니다.");
  return { text: lines.join("\n"), total, count: entries.length };
}
