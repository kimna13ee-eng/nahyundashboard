import type { OpsRow } from "./ops.ts";
import { isVerificationRecord } from "./content-analytics.ts";
export function calendarLabel(row: OpsRow): string {
  if (isVerificationRecord(row)) return "QA";
  const labels: Record<string, string> = {
    reel: "릴스",
    selfie: "셀카",
    carousel: "캐러셀",
    review: "리뷰",
    sponsored: "협찬",
  };
  return (
    labels[String(row.content_type)] ||
    (String(row.source).startsWith("콘텐츠")
      ? "콘텐츠"
      : row.source === "업무 마감"
        ? "업무"
        : row.source === "반복 일정"
          ? "반복"
          : "일정")
  );
}
export function calendarTitle(row: OpsRow): string {
  const title = String(row.title || "");
  const letters = Array.from(
    new Intl.Segmenter("ko", { granularity: "grapheme" }).segment(
      title.replace(/^\[(?:QA 테스트|Time Tracker 테스트)\]\s*/, ""),
    ),
    (part) => part.segment,
  );
  return `[${calendarLabel(row)}] ${letters.slice(0, 3).join("")}${letters.length > 3 ? "…" : ""}`;
}
