import { parsePersonalScheduleEdit, uuid } from "./ops.ts";
import { validYogaDay } from "./yoga-week.ts";

export const plannerScheduleColumns =
  "id,title,starts_at,ends_at,category,video_url,duration_minutes,updated_at";
export const plannerScheduleLimit = 500;

export class PlannerScheduleInputError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "PlannerScheduleInputError";
    this.status = status;
  }
}

function invalid(message: string, status = 400): never {
  throw new PlannerScheduleInputError(message, status);
}

/** This endpoint never selects a workspace from caller input. */
export function parsePlannerQuery(params: URLSearchParams, method: string) {
  const workspace = params.getAll("workspace");
  if (
    workspace.length > 1 ||
    (workspace.length === 1 && workspace[0] !== "PERSONAL")
  )
    invalid("요가 플래너는 PERSONAL에서만 사용할 수 있어요.", 403);
  const allowed =
    method === "GET" ? ["workspace", "from", "to"] : ["workspace"];
  if ([...params.keys()].some((key) => !allowed.includes(key)))
    invalid("조회 조건을 확인해 주세요.");
  if (method !== "GET") return null;
  const from = params.get("from"),
    to = params.get("to");
  if (
    params.getAll("from").length !== 1 ||
    params.getAll("to").length !== 1 ||
    !from ||
    !to ||
    !validYogaDay(from) ||
    !validYogaDay(to)
  )
    invalid("조회할 시작일과 종료일을 확인해 주세요.");
  const days =
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      86400000 +
    1;
  if (days < 1 || days > 31)
    invalid("요가 일정은 한 번에 31일 이내로 조회해 주세요.");
  return { from: `${from}T00:00:00+09:00`, to: `${to}T23:59:59.999999+09:00` };
}

function object(raw: unknown): Record<string, unknown> {
  if (
    !raw ||
    typeof raw !== "object" ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(raw))
  )
    invalid("요가 영상 입력을 확인해 주세요.");
  return raw as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: string[]) {
  if (
    Reflect.ownKeys(value).some(
      (key) => typeof key !== "string" || !allowed.includes(key),
    )
  )
    invalid("수정할 수 있는 요가 영상 항목만 보내 주세요.");
}
function id(raw: unknown) {
  if (!uuid(raw)) invalid("요가 일정 ID를 확인해 주세요.");
  return raw.toLowerCase();
}

export type PlannerScheduleValue = {
  title: string;
  video_url: string;
  duration_minutes: number | null;
  starts_at: string;
  ends_at: string;
};
export type PlannerScheduleMutation =
  | { action: "create" | "update"; id?: string; value: PlannerScheduleValue }
  | { action: "delete" | "restore"; id: string };

export function parsePlannerMutation(
  raw: unknown,
  method: string,
): PlannerScheduleMutation {
  const input = object(raw);
  if (method === "DELETE") {
    keys(input, ["id"]);
    return { action: "delete", id: id(input.id) };
  }
  if (method === "POST" && Object.hasOwn(input, "action")) {
    keys(input, ["id", "action"]);
    if (input.action !== "restore") invalid("요가 복구 요청을 확인해 주세요.");
    return { action: "restore", id: id(input.id) };
  }
  if (!["POST", "PATCH"].includes(method)) invalid("지원하지 않는 요청입니다.");
  keys(input, ["id", "title", "video_url", "duration_minutes", "date"]);
  if (typeof input.date !== "string" || !validYogaDay(input.date))
    invalid("영상을 등록할 날짜를 확인해 주세요.");
  if (typeof input.title !== "string" || input.title.includes("\0"))
    invalid("영상 제목을 입력해 주세요.");
  let fields: ReturnType<typeof parsePersonalScheduleEdit>;
  try {
    fields = parsePersonalScheduleEdit({
      title: input.title.trim(),
      video_url: input.video_url,
      duration_minutes: input.duration_minutes ?? null,
    });
  } catch (error) {
    invalid(
      error instanceof Error ? error.message : "영상 입력을 확인해 주세요.",
    );
  }
  if (!fields.video_url) invalid("요가 영상 URL을 입력해 주세요.");
  const value: PlannerScheduleValue = {
    title: fields.title,
    video_url: fields.video_url,
    duration_minutes: fields.duration_minutes ?? null,
    starts_at: new Date(`${input.date}T21:00:00+09:00`).toISOString(),
    ends_at: new Date(`${input.date}T22:00:00+09:00`).toISOString(),
  };
  return {
    action: method === "POST" ? "create" : "update",
    ...(method === "PATCH" || Object.hasOwn(input, "id")
      ? { id: id(input.id) }
      : {}),
    value,
  };
}

/** A lost POST response may be retried, but must not overwrite subsequent edits. */
export function plannerScheduleMatches(
  row: Record<string, unknown>,
  value: PlannerScheduleValue,
) {
  return (
    row.category === "exercise" &&
    row.title === value.title &&
    row.video_url === value.video_url &&
    row.duration_minutes === value.duration_minutes &&
    Date.parse(String(row.starts_at)) === Date.parse(value.starts_at) &&
    Date.parse(String(row.ends_at)) === Date.parse(value.ends_at)
  );
}
