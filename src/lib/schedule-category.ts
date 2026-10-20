import { containsSecret } from "./secrets.ts";

export const scheduleCategories = ["work", "exercise", "other"] as const;
export type ScheduleCategory = (typeof scheduleCategories)[number];
export const scheduleCategoryLabels: Record<ScheduleCategory, string> = {
  work: "업무",
  exercise: "운동",
  other: "기타",
};

export function parseScheduleCategory(raw: unknown): ScheduleCategory {
  if (raw === undefined) return "other";
  if (
    typeof raw !== "string" ||
    !scheduleCategories.includes(raw as ScheduleCategory)
  )
    throw new Error("일정 분류를 확인해 주세요.");
  return raw as ScheduleCategory;
}

/** Store a user-facing link only; this does not fetch or embed the URL. */
export function parseScheduleVideoUrl(raw: unknown): string {
  if (typeof raw !== "string" || raw.length > 2000)
    throw new Error("영상 링크는 2000자 이내로 입력해 주세요.");
  const value = raw.trim();
  if (value === "") return "";
  if (/[\u0000-\u0020\u007f]/.test(value))
    throw new Error("영상 URL의 공백과 제어문자를 확인해 주세요.");
  const authority = /^https:\/\/([^/?#]+)/i.exec(value)?.[1];
  if (!authority) throw new Error("영상 링크는 HTTPS URL로 입력해 주세요.");
  let url: URL;
  let decoded: string;
  try {
    url = new URL(value);
    decoded = decodeURIComponent(value);
  } catch {
    throw new Error("영상 URL 형식을 확인해 주세요.");
  }
  if (url.protocol !== "https:" || !url.hostname)
    throw new Error("영상 링크는 HTTPS URL로 입력해 주세요.");
  if (url.username || url.password || authority.includes("@"))
    throw new Error(
      "영상 링크에서 사용자명·비밀번호 등 인증정보를 제거해 주세요.",
    );
  const privateKey =
    /^(?:api[_-]?key|password|pass|pwd|secret|access[_-]?token|refresh[_-]?token|authorization|client[_-]?secret)$/i;
  const fragmentParams = new URLSearchParams(
    decodeURIComponent(url.hash.slice(1)),
  );
  if (
    containsSecret(value) ||
    containsSecret(decoded) ||
    [...url.searchParams.keys(), ...fragmentParams.keys()].some((key) =>
      privateKey.test(key),
    )
  )
    throw new Error(
      "영상 링크에 인증정보로 보이는 내용이 있습니다. 비밀정보를 제거해 주세요.",
    );
  // Preserve Unicode rather than expanding the path into percent escapes, so
  // a valid 2,000-character link remains within the database column limit.
  return value;
}
