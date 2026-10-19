import type { OpsRow } from "./ops.ts";

export type AutomationWorkspace = "PERSONAL" | "FRENGLE";

const sources: Record<AutomationWorkspace, readonly string[]> = {
  PERSONAL: ["metricool_personal"],
  FRENGLE: [
    "frengle_keywords",
    "frengle_site_recommendations",
    "frengle_work_check",
  ],
};

export function automationSourceLabel(source: unknown) {
  switch (source) {
    case "metricool_personal":
      return "Metricool 데이터 확인";
    case "frengle_keywords":
      return "키워드 검색";
    case "frengle_site_recommendations":
      return "사이트 소재 추천";
    case "frengle_work_check":
      return "출근 업무 체크";
    default:
      return "자동화 결과";
  }
}

export function chatGptSourceUrl(value: unknown): string | undefined {
  if (
    typeof value !== "string" ||
    value.length > 2000 ||
    /[\u0000-\u0020\u007f]/.test(value)
  )
    return undefined;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "chatgpt.com" ||
      (url.port !== "" && url.port !== "443") ||
      url.username ||
      url.password ||
      !/^\/(c\/[^/]+|scheduled)$/.test(url.pathname)
    )
      return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

export function automationReceiptIso(value: unknown): string | undefined {
  if (typeof value !== "string" || !value) return undefined;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

export function automationReceiptTime(value: unknown) {
  const iso = automationReceiptIso(value);
  return iso
    ? new Intl.DateTimeFormat("ko-KR", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(iso))
    : "시각 기록 없음";
}

export function automationReceiptRows(
  results: OpsRow[],
  workspace: AutomationWorkspace,
  limit?: number,
) {
  const rows = results.filter((row) =>
    sources[workspace].includes(String(row.source)),
  );
  rows.sort((left, right) => {
    const leftTime = automationReceiptIso(left.received_at);
    const rightTime = automationReceiptIso(right.received_at);
    return (
      (rightTime ? Date.parse(rightTime) : 0) -
      (leftTime ? Date.parse(leftTime) : 0)
    );
  });
  return limit === undefined
    ? rows
    : rows.slice(0, Math.max(0, Math.floor(limit)));
}
