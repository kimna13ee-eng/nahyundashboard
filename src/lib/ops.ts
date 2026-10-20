import { parseTask } from "./domain.ts";
import { parseTaskCategory, parseProcessSteps } from "./task-process.ts";
import { parseProjectCategory } from "./project-process.ts";
import {
  parseScheduleCategory,
  parseScheduleVideoUrl,
} from "./schedule-category.ts";
import { containsSecret } from "./secrets.ts";
export { containsSecret } from "./secrets.ts";
export type Resource =
  | "projects"
  | "tasks"
  | "task_notes"
  | "schedules"
  | "library_items";
export type OpsRow = { id: string; title?: string; [key: string]: unknown };
export type OpsData = Record<string, OpsRow[]>;
export const resources: Resource[] = [
  "projects",
  "tasks",
  "task_notes",
  "schedules",
  "library_items",
];
export const uuid = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
function text(v: unknown, max: number, required = false) {
  if (typeof v !== "string" || v.length > max || (required && !v.trim()))
    throw new Error("입력 길이와 필수값을 확인해 주세요.");
  return v;
}
function link(v: unknown) {
  const s = text(v ?? "", 2000);
  if (s) {
    let u;
    try {
      u = new URL(s);
    } catch {
      throw new Error("URL 형식을 확인해 주세요.");
    }
    if (!["http:", "https:"].includes(u.protocol))
      throw new Error("HTTP/HTTPS 링크만 허용합니다.");
  }
  return s;
}
function fk(v: unknown) {
  if (v === null || v === undefined || v === "") return null;
  if (!uuid(v)) throw new Error("연결 항목 ID를 확인해 주세요.");
  return v;
}
function choice(v: unknown, allowed: string[]) {
  if (typeof v !== "string" || !allowed.includes(v))
    throw new Error("선택 항목을 확인해 주세요.");
  return v;
}
export function parseYogaDurationMinutes(value: unknown): number | null {
  if (value === null) return null;
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > 1440
  )
    throw new Error("운동 소요 시간은 1~1440분의 정수로 입력해 주세요.");
  return value;
}
/** A personal schedule's hidden fields must never be reconstructed on edit. */
export function parsePersonalScheduleEdit(raw: unknown) {
  if (
    !raw ||
    typeof raw !== "object" ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(raw))
  )
    throw new Error("입력 정보를 확인해 주세요.");
  const value = raw as Record<string, unknown>;
  if (
    Reflect.ownKeys(value).some(
      (key) =>
        key !== "title" && key !== "video_url" && key !== "duration_minutes",
    )
  )
    throw new Error("수정할 일정 입력 항목을 확인해 주세요.");
  return {
    title: text(
      Object.hasOwn(value, "title") ? value.title : undefined,
      120,
      true,
    ),
    ...(Object.hasOwn(value, "video_url")
      ? { video_url: parseScheduleVideoUrl(value.video_url) }
      : {}),
    ...(Object.hasOwn(value, "duration_minutes")
      ? { duration_minutes: parseYogaDurationMinutes(value.duration_minutes) }
      : {}),
  };
}
export function parseResource(resource: Resource, raw: unknown) {
  if (!raw || typeof raw !== "object")
    throw new Error("입력 정보를 확인해 주세요.");
  const v = raw as Record<string, unknown>;
  if (resource === "tasks") {
    const task = parseTask(v);
    const minutes = Number(v.estimated_minutes ?? 0);
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > 100000)
      throw new Error("계획 시간은 0~100000분입니다.");
    if (
      v.is_test !== undefined &&
      v.is_test !== null &&
      typeof v.is_test !== "boolean"
    )
      throw new Error("테스트 데이터 구분을 확인해 주세요.");
    return {
      ...task,
      ...(v.task_category !== undefined
        ? { task_category: parseTaskCategory(v.task_category) }
        : {}),
      ...(v.process_steps !== undefined
        ? { process_steps: parseProcessSteps(v.process_steps) }
        : {}),
      ...(v.is_test !== undefined
        ? { is_test: v.is_test as boolean | null }
        : {}),
      project_id: fk(v.project_id),
      ...(v.tool !== undefined ? { tool: text(v.tool, 80) } : {}),
      ...(v.assignee !== undefined ? { assignee: text(v.assignee, 80) } : {}),
      result_url: link(v.result_url),
      ...(v.estimated_minutes !== undefined
        ? { estimated_minutes: minutes }
        : {}),
      ...(v.work_kind !== undefined
        ? {
            work_kind: choice(v.work_kind, [
              "unclassified",
              "planned",
              "unexpected",
            ]),
          }
        : {}),
      approval: choice(v.approval ?? "none", ["none", "pending", "approved"]),
      ...(v.contact_status !== undefined
        ? {
            contact_status: choice(v.contact_status, [
              "none",
              "planned",
              "sent",
              "waiting",
              "materials",
              "follow_up",
              "answered",
              "closed",
            ]),
            follow_up_at: v.follow_up_at
              ? (() => {
                  if (
                    typeof v.follow_up_at !== "string" ||
                    !/(Z|[+-]\d{2}:\d{2})$/.test(v.follow_up_at) ||
                    !Number.isFinite(Date.parse(v.follow_up_at))
                  )
                    throw new Error("후속 시각을 확인해 주세요.");
                  return new Date(v.follow_up_at).toISOString();
                })()
              : null,
          }
        : {}),
    };
  }
  if (resource === "projects")
    return {
      title: text(v.title, 120, true),
      description: text(v.description ?? "", 2000),
      status: choice(v.status, ["planning", "active", "completed"]),
      ...(v.project_category !== undefined
        ? { project_category: parseProjectCategory(v.project_category) }
        : {}),
    };
  if (resource === "task_notes")
    return {
      task_id:
        fk(v.task_id) ??
        (() => {
          throw new Error("업무 연결이 필요합니다.");
        })(),
      body: text(v.body, 10000, true),
      kind: choice(v.kind, ["general", "issue", "next_action"]),
      pinned: v.pinned === true,
      done: v.done === true,
    };
  if (resource === "schedules") {
    const starts = text(v.starts_at, 50, true),
      ends = text(v.ends_at, 50, true);
    if (
      !/(Z|[+-]\d{2}:\d{2})$/.test(starts) ||
      !/(Z|[+-]\d{2}:\d{2})$/.test(ends) ||
      !Number.isFinite(Date.parse(starts)) ||
      !Number.isFinite(Date.parse(ends)) ||
      Date.parse(ends) <= Date.parse(starts)
    )
      throw new Error("일정 종료 시각은 시작 이후여야 합니다.");
    return {
      title: text(v.title, 120, true),
      starts_at: new Date(starts).toISOString(),
      ends_at: new Date(ends).toISOString(),
      project_id: fk(v.project_id),
      notes: text(v.notes ?? "", 2000),
      timezone: "Asia/Seoul",
      ...(v.category !== undefined
        ? { category: parseScheduleCategory(v.category) }
        : {}),
      ...(v.video_url !== undefined
        ? { video_url: parseScheduleVideoUrl(v.video_url) }
        : {}),
      ...(Object.hasOwn(v, "duration_minutes")
        ? { duration_minutes: parseYogaDurationMinutes(v.duration_minutes) }
        : {}),
    };
  }
  const kind = choice(v.kind, ["prompt", "skill"]),
    body = text(v.body ?? "", 50000);
  if (
    containsSecret(body) ||
    containsSecret(String(v.title ?? "")) ||
    containsSecret(String(v.url ?? "")) ||
    containsSecret(String(v.tool ?? "")) ||
    containsSecret(String(v.change_reason ?? ""))
  )
    throw new Error(
      "인증정보로 보이는 내용이 있습니다. 비밀정보를 제거해 주세요.",
    );
  return {
    title: text(v.title, 120, true),
    kind,
    category: choice(v.category, [
      "개발",
      "디자인",
      "이미지 콘텐츠",
      "영상 콘텐츠",
      "운영",
    ]),
    body,
    url: link(v.url),
    favorite: v.favorite === true,
    ...(v.tool !== undefined
      ? {
          tool: text(v.tool, 80),
          project_id: fk(v.project_id),
          change_reason: text(v.change_reason ?? "", 2000),
          status: choice(v.status ?? "active", ["active", "archived"]),
          approved_version_id: fk(v.approved_version_id),
        }
      : {}),
  };
}
export function seoulDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function scheduleOverlaps(s: OpsRow, day: string, view = "day") {
  if (view === "list") return true;
  const first = view === "month" ? `${day.slice(0, 7)}-01` : day;
  const start = Date.parse(`${first}T00:00:00+09:00`);
  const end =
    view === "month"
      ? Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)), 1) -
        9 * 3600000
      : start + (view === "week" ? 7 : 1) * 86400000;
  return (
    Date.parse(String(s.starts_at)) < end &&
    Date.parse(String(s.ends_at)) > start
  );
}
export function intervalSeconds(intervals: OpsRow[], now: number) {
  return intervals.reduce(
    (sum, i) =>
      sum +
      Math.max(
        0,
        ((i.ends_at ? Date.parse(String(i.ends_at)) : now) -
          Date.parse(String(i.starts_at))) /
          1000,
      ),
    0,
  );
}
export function longRunningInterval(
  intervals: OpsRow[],
  sessionId: string,
  now: number,
) {
  return intervals.find((i) => {
    const start = Date.parse(String(i.starts_at));
    return (
      i.session_id === sessionId &&
      !i.ends_at &&
      Number.isFinite(start) &&
      now - start >= 8 * 3600000
    );
  });
}
export function intervalSecondsForDay(
  intervals: OpsRow[],
  now: number,
  day: string,
) {
  const start = Date.parse(`${day}T00:00:00+09:00`);
  const end = start + 86400000;
  if (!Number.isFinite(start)) return 0;
  return intervals.reduce((sum, i) => {
    const from = Math.max(start, Date.parse(String(i.starts_at)));
    const to = Math.min(end, i.ends_at ? Date.parse(String(i.ends_at)) : now);
    return (
      sum +
      (Number.isFinite(from) && Number.isFinite(to)
        ? Math.max(0, to - from) / 1000
        : 0)
    );
  }, 0);
}
