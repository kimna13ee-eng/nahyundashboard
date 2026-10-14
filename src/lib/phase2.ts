import { uuid, containsSecret, type OpsRow } from "./ops.ts";
import { parsePersonalContent } from "./personal-content.ts";
export const phase2Tables = {
  content: "ops_content",
  inspiration: "ops_inspiration",
  leave: "ops_leave_entries",
  recurrence: "ops_recurrence",
  exceptions: "ops_recurrence_exceptions",
};
export type Phase2Resource = keyof typeof phase2Tables;
const str = (v: unknown, max: number, required = false) => {
  if (typeof v !== "string" || v.length > max || (required && !v.trim()))
    throw new Error("필수값과 입력 길이를 확인해 주세요.");
  return v;
};
const option = (v: unknown, allowed: string[]) => {
  if (typeof v !== "string" || !allowed.includes(v))
    throw new Error("선택값을 확인해 주세요.");
  return v;
};
const date = (v: unknown) => {
  const s = str(v, 10, true);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(s) ||
    new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) !== s
  )
    throw new Error("날짜를 확인해 주세요.");
  return s;
};
const instant = (v: unknown) => {
  const s = str(v, 50, true);
  if (!/(Z|[+-]\d{2}:\d{2})$/.test(s) || !Number.isFinite(Date.parse(s)))
    throw new Error("시간과 타임존을 확인해 주세요.");
  return new Date(s).toISOString();
};
const url = (v: unknown) => {
  const s = str(v ?? "", 2000);
  if (s && !/^https?:\/\//i.test(s))
    throw new Error("HTTP/HTTPS URL을 입력해 주세요.");
  if (s) new URL(s);
  return s;
};
export function parsePhase2(resource: Phase2Resource, raw: unknown) {
  if (!raw || typeof raw !== "object")
    throw new Error("입력값을 확인해 주세요.");
  const v = raw as Record<string, unknown>;
  if (
    [v.title, v.notes, v.url, v.result_url].some(
      (s) => typeof s === "string" && containsSecret(s),
    )
  )
    throw new Error("비밀정보를 제거하고 입력해 주세요.");
  if (resource === "leave") {
    const amount = Number(v.amount);
    if (
      !Number.isFinite(amount) ||
      amount === 0 ||
      Math.abs(amount) > 365 ||
      !Number.isInteger(amount * 2)
    )
      throw new Error("연차는 0.5일 단위로 입력해 주세요.");
    const kind = option(v.kind, ["grant", "use", "adjust"]);
    if ((kind === "grant" && amount < 0) || (kind === "use" && amount > 0))
      throw new Error("발생은 양수, 사용은 음수로 입력해 주세요.");
    return { title: str(v.title, 120, true), date: date(v.date), amount, kind };
  }
  if (resource === "exceptions")
    throw new Error("반복 변경 전용 요청을 사용해 주세요.");
  const common = {
    title: str(v.title, 120, true),
    notes: str(v.notes ?? "", 2000),
  };
  if (resource === "inspiration")
    return {
      ...common,
      url: url(str(v.url, 2000, true)),
      category: option(v.category, [
        "개발",
        "디자인",
        "이미지 콘텐츠",
        "영상 콘텐츠",
        "운영",
      ]),
      favorite: v.favorite === true,
      inbox: v.inbox !== false,
    };
  if (resource === "content") {
    const details =
      v.personal_details !== undefined
        ? parsePersonalContent(v.personal_details)
        : undefined;
    const stage = details
      ? {
          idea: "idea",
          planning: "production",
          shooting: "production",
          editing: "production",
          review: "review",
          revision: "review",
          scheduled: "approval",
          published: "published",
          results: "results",
        }[String(details.step)] || "idea"
      : v.stage;
    const approval = details
      ? details.review === "approved"
        ? "approved"
        : ["pending", "revision"].includes(String(details.review))
          ? "pending"
          : "none"
      : v.approval;
    if (
      ["published", "results"].includes(String(stage)) &&
      approval === "pending"
    )
      throw new Error(
        "검수·수정 대기 콘텐츠는 발행 단계로 변경할 수 없습니다.",
      );
    return {
      ...(details ? { personal_details: details } : {}),
      ...common,
      channel: str(v.channel ?? "", 80),
      stage: option(stage, [
        "idea",
        "production",
        "review",
        "approval",
        "published",
        "results",
      ]),
      approval: option(approval, ["none", "pending", "approved"]),
      publish_at: v.publish_at ? instant(v.publish_at) : null,
      result_url: url(v.result_url),
      project_id: v.project_id
        ? uuid(v.project_id)
          ? v.project_id
          : (() => {
              throw new Error("프로젝트 연결값을 확인해 주세요.");
            })()
        : null,
    };
  }
  const starts_at = instant(v.starts_at),
    ends_at = instant(v.ends_at);
  if (
    Date.parse(ends_at) <= Date.parse(starts_at) ||
    Date.parse(ends_at) - Date.parse(starts_at) > 31 * 86400000
  )
    throw new Error("종료는 시작 이후이며 최대 31일입니다.");
  const until_date = date(v.until_date);
  if (Date.parse(`${until_date}T23:59:59+09:00`) < Date.parse(starts_at))
    throw new Error("반복 종료일을 확인해 주세요.");
  const interval = Number(v.interval);
  if (!Number.isInteger(interval) || interval < 1 || interval > 52)
    throw new Error("반복 간격은 1~52입니다.");
  return {
    ...common,
    starts_at,
    ends_at,
    until_date,
    frequency: option(v.frequency, ["daily", "weekly", "monthly", "yearly"]),
    interval,
  };
}
// Calculate from the original Seoul date so clamping never shifts later months.
export function recurrenceAt(
  start: number,
  frequency: unknown,
  interval: number,
  index: number,
) {
  if (frequency === "daily" || frequency === "weekly")
    return (
      start + index * interval * (frequency === "weekly" ? 7 : 1) * 86400000
    );
  if (frequency !== "monthly" && frequency !== "yearly") return NaN;
  const local = new Date(start + 9 * 3600000);
  const month =
    local.getUTCMonth() + index * interval * (frequency === "yearly" ? 12 : 1);
  const target = new Date(Date.UTC(local.getUTCFullYear(), month, 1));
  const last = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(local.getUTCDate(), last));
  target.setUTCHours(
    local.getUTCHours(),
    local.getUTCMinutes(),
    local.getUTCSeconds(),
    local.getUTCMilliseconds(),
  );
  return target.getTime() - 9 * 3600000;
}
export function occurrences(
  rules: OpsRow[],
  exceptions: OpsRow[],
  from: string,
  to: string,
) {
  const lower = Date.parse(`${from}T00:00:00+09:00`),
    upper = Date.parse(`${to}T00:00:00+09:00`);
  const output: OpsRow[] = [];
  for (const r of rules) {
    if (r.archived_at) continue;
    if (output.length >= 10000) break;
    const start = Date.parse(String(r.starts_at)),
      duration = Date.parse(String(r.ends_at)) - start;
    const step =
      Number(r.interval) * (r.frequency === "weekly" ? 7 : 1) * 86400000;
    const limit = Date.parse(`${r.until_date}T23:59:59.999+09:00`);
    if (
      !Number.isFinite(start + duration + step + limit) ||
      step <= 0 ||
      duration <= 0
    )
      continue;
    const anchor = new Date(start + 9 * 3600000);
    const window = new Date(lower - duration + 9 * 3600000);
    const months =
      (window.getUTCFullYear() - anchor.getUTCFullYear()) * 12 +
      window.getUTCMonth() -
      anchor.getUTCMonth();
    const first =
      r.frequency === "monthly" || r.frequency === "yearly"
        ? Math.max(
            0,
            Math.floor(
              months /
                (Number(r.interval) * (r.frequency === "yearly" ? 12 : 1)),
            ) - 1,
          )
        : Math.max(0, Math.ceil((lower - duration - start) / step));
    for (let n = first, count = 0; count < 1000; n++, count++) {
      if (output.length >= 10000) break;
      const at = recurrenceAt(start, r.frequency, Number(r.interval), n);
      if (!Number.isFinite(at)) break;
      if (at > limit || at >= upper) break;
      const original = new Date(at).toISOString();
      const e = exceptions.find(
        (e) => e.rule_id === r.id && Date.parse(String(e.original_at)) === at,
      );
      if (e) continue;
      if (at + duration > lower)
        output.push({
          ...r,
          id: `${r.id}:${original}`,
          rule_id: r.id,
          original_at: original,
          starts_at: original,
          ends_at: new Date(at + duration).toISOString(),
        });
    }
    for (const e of exceptions.filter(
      (e) => e.rule_id === r.id && !e.cancelled,
    )) {
      if (output.length >= 10000) break;
      if (
        Date.parse(String(e.starts_at)) < upper &&
        Date.parse(String(e.ends_at)) > lower
      )
        output.push({
          ...r,
          ...e,
          id: `${r.id}:${e.original_at}`,
          rule_id: r.id,
        });
    }
  }
  return output.sort((a, b) =>
    String(a.starts_at).localeCompare(String(b.starts_at)),
  );
}
