import { seoulDate, type OpsRow } from "./ops.ts";

export const contentStages = [
  ["idea", "아이디어"], ["production", "제작"], ["review", "검수"],
  ["approval", "승인"], ["published", "발행"], ["results", "성과 확인"],
] as const;

export function isVerificationTitle(title: unknown) {
  return /^\[(?:(?:Time Tracker|CRUD|Quick Log|Calendar|캘린더 확장|콘텐츠 통계) 테스트|004 실DB 테스트|운영 검증(?: |\]))/.test(String(title));
}

export function contentSummary(rows: OpsRow[], options: {
  day: string; now: number; excludeTests: boolean; channel: string; project: string;
}) {
  const filtered = rows.filter(row =>
    (!options.excludeTests || !isVerificationTitle(row.title)) &&
    (options.channel === "all" || String(row.channel || "") === options.channel) &&
    (options.project === "all" || String(row.project_id || "") === options.project),
  );
  const stages = Object.fromEntries(contentStages.map(([key]) => [key, 0]));
  let pending = 0, recordedPublished = 0, scheduled = 0, overdue = 0, unscheduled = 0, selectedDay = 0;
  const channels = new Map<string, number>();
  for (const row of filtered) {
    const stage = String(row.stage);
    if (Object.hasOwn(stages, stage)) stages[stage]++;
    if (row.approval === "pending") pending++;
    const published = stage === "published" || stage === "results";
    if (published) recordedPublished++;
    const at = row.publish_at ? Date.parse(String(row.publish_at)) : NaN;
    if (Number.isFinite(at)) {
      if (seoulDate(new Date(at)) === options.day) selectedDay++;
      if (!published) { scheduled++; if (at < options.now) overdue++; }
    } else if (!published) unscheduled++;
    const channel = String(row.channel || "");
    channels.set(channel, (channels.get(channel) || 0) + 1);
  }
  return { total: filtered.length, stages, pending, recordedPublished, scheduled, overdue, unscheduled, selectedDay,
    channels: [...channels].sort(([a], [b]) => a.localeCompare(b)),
  };
}
