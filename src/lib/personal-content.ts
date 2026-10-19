import { containsSecret, type OpsRow } from "./ops.ts";
export const contentTypes = [
  "reel",
  "selfie",
  "carousel",
  "review",
  "sponsored",
];
export const personalStages = [
  "idea",
  "planning",
  "shooting",
  "editing",
  "review",
  "revision",
  "scheduled",
  "published",
  "results",
];
export const metricKeys = [
  "views",
  "reach",
  "likes",
  "comments",
  "shares",
  "saves",
  "profile_visits",
  "follower_change",
];
export const personalTemplates: Record<string, string> = {
  reel: "기획\n촬영\n컷 편집\n자막\nBGM\n썸네일\n업로드",
  selfie: "기획\n메이크업\n촬영\n완성컷 선택\n보정\n검수\n업로드",
  carousel:
    "기획\n4:5 비율 확인\n7~8장 구성\n제품·발색 비교\n설명 검수\n업로드",
  review: "기획\n제품 사용\n촬영\n리뷰 편집\n정보 검수\n업로드",
  sponsored:
    "제품명 확인\n제출 기한 확인\n기획\n촬영\n편집\n협찬 표기 확인\n승인\n업로드",
};
export function parsePersonalContent(raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("개인 콘텐츠 입력을 확인해 주세요.");
  const v = raw as Record<string, unknown>,
    out: Record<string, unknown> = {};
  if (v.calendar_hidden !== undefined && typeof v.calendar_hidden !== "boolean")
    throw new Error("캘린더 표시 여부를 확인해 주세요.");
  out.calendar_hidden = v.calendar_hidden ?? false;
  for (const [key, choices] of Object.entries({
    type: contentTypes,
    step: personalStages,
    review: ["none", "pending", "revision", "approved"],
  })) {
    if (!choices.includes(String(v[key])))
      throw new Error("개인 콘텐츠 선택값을 확인해 주세요.");
    out[key] = v[key];
  }
  for (const key of [
    "products",
    "reference_url",
    "review_notes",
    "reviewer",
    "change_reason",
    "outcome",
    "sponsor_disclosure",
    "checklist",
  ]) {
    const value = v[key] ?? "";
    if (
      typeof value !== "string" ||
      value.length > 2000 ||
      containsSecret(value)
    )
      throw new Error("개인 콘텐츠 입력 길이·비밀정보를 확인해 주세요.");
    if (key === "reference_url" && value && !/^https?:\/\//i.test(value))
      throw new Error("레퍼런스 URL을 확인해 주세요.");
    if (key === "reference_url" && value) new URL(value);
    out[key] = value;
  }
  for (const key of [
    "shoot_at",
    "edit_at",
    "published_at",
    "reviewed_at",
    "metrics_at",
    "sponsor_due_at",
  ]) {
    if (!v[key]) {
      out[key] = null;
      continue;
    }
    if (
      typeof v[key] !== "string" ||
      !/(Z|[+-]\d{2}:\d{2})$/.test(v[key]) ||
      !Number.isFinite(Date.parse(v[key]))
    )
      throw new Error("콘텐츠 시각과 타임존을 확인해 주세요.");
    out[key] = new Date(v[key]).toISOString();
  }
  out.sponsored = v.sponsored === true || out.type === "sponsored";
  const checks = v.performance_checks ?? [];
  if (
    !Array.isArray(checks) ||
    checks.length > 3 ||
    checks.some((h) => ![24, 72, 168].includes(h))
  )
    throw new Error("성과 점검 간격을 확인해 주세요.");
  out.performance_checks = [...new Set(checks)];
  for (const key of metricKeys) {
    const value = v[key] === "" || v[key] == null ? null : Number(v[key]);
    if (
      value !== null &&
      (!Number.isSafeInteger(value) || (key !== "follower_change" && value < 0))
    )
      throw new Error("성과는 정수로 입력해 주세요.");
    out[key] = value;
  }
  if (metricKeys.some((key) => out[key] !== null) && !out.metrics_at)
    throw new Error("성과 기록 기준 시각을 입력해 주세요.");
  if (["published", "results"].includes(String(out.step)) && !out.published_at)
    throw new Error("실제 발행 시각을 입력해 주세요.");
  if (
    ["scheduled", "published", "results"].includes(String(out.step)) &&
    ["pending", "revision"].includes(String(out.review))
  )
    throw new Error("검수·수정 대기 콘텐츠는 발행 단계로 변경할 수 없습니다.");
  return out;
}
export function contentCalendar(content: OpsRow[]) {
  return content.flatMap((c) => {
    const p = c.personal_details as Record<string, unknown> | undefined;
    if (p?.calendar_hidden === true) return [];
    return [
      ["shoot", "콘텐츠 촬영", p?.shoot_at],
      ["edit", "콘텐츠 편집", p?.edit_at],
      ["publish", "콘텐츠 발행 예정", c.publish_at],
      ["actual-publish", "콘텐츠 실제 발행", p?.published_at],
      ...(Array.isArray(p?.performance_checks) &&
      Number.isFinite(Date.parse(String(p?.published_at)))
        ? p.performance_checks
            .filter((h) => [24, 72, 168].includes(Number(h)))
            .map((h) => [
              `check-${h}`,
              `콘텐츠 성과 점검 ${h}시간`,
              new Date(
                Date.parse(String(p.published_at)) + Number(h) * 3600000,
              ).toISOString(),
            ])
        : []),
    ]
      .filter(([, , at]) => at && Number.isFinite(Date.parse(String(at))))
      .map(([kind, source, at]) => ({
        id: `${kind}-${c.id}`,
        title: c.title,
        content_id: c.id,
        content_type: p?.type,
        is_test: c.is_test,
        notes: c.notes,
        status: p?.step || c.stage,
        project_id: c.project_id,
        starts_at: at,
        ends_at: new Date(Date.parse(String(at)) + 60000).toISOString(),
        source: String(source),
      }));
  });
}
