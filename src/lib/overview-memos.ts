import { uuid } from "./ops.ts";

export const overviewMemoLimits = { active: 200, archived: 50 } as const;
export const overviewMemoColumns =
  "id,body,done,deleted_at,created_at,updated_at";

export type OverviewMemo = {
  id: string;
  body: string;
  done: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export class OverviewMemoInputError extends Error {}

function object(raw: unknown): Record<string, unknown> {
  if (
    !raw ||
    typeof raw !== "object" ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(raw))
  )
    throw new OverviewMemoInputError("메모 입력을 확인해 주세요.");
  return raw as Record<string, unknown>;
}

function keys(value: Record<string, unknown>, allowed: readonly string[]) {
  if (
    Reflect.ownKeys(value).some(
      (key) => typeof key !== "string" || !allowed.includes(key),
    )
  )
    throw new OverviewMemoInputError("허용된 메모 입력 항목만 보내 주세요.");
}

export function parseOverviewMemoBody(raw: unknown) {
  if (typeof raw !== "string")
    throw new OverviewMemoInputError("메모 내용을 입력해 주세요.");
  const body = raw.trim();
  if (!body || Array.from(body).length > 1000)
    throw new OverviewMemoInputError("메모는 1~1000자로 입력해 주세요.");
  return body;
}

export function parseOverviewMemoCreate(raw: unknown) {
  const value = object(raw);
  keys(value, ["body"]);
  return { body: parseOverviewMemoBody(value.body) };
}

type MemoIdentity = { id: string; expected_updated_at: string };
export type OverviewMemoPatch = MemoIdentity &
  (
    | { action: "archive" | "restore" }
    | { action?: never; body?: string; done?: boolean }
  );

/** Preserve Postgres microsecond precision: never reformat a CAS token with Date. */
export function parseOverviewMemoPatch(raw: unknown): OverviewMemoPatch {
  const value = object(raw);
  if (!uuid(value.id))
    throw new OverviewMemoInputError("메모 항목을 확인해 주세요.");
  if (
    typeof value.expected_updated_at !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value.expected_updated_at,
    ) ||
    !Number.isFinite(Date.parse(value.expected_updated_at)) ||
    value.expected_updated_at.startsWith("0000") ||
    value.expected_updated_at.slice(11, 13) === "24" ||
    new Date(`${value.expected_updated_at.slice(0, 10)}T00:00:00Z`)
      .toISOString()
      .slice(0, 10) !== value.expected_updated_at.slice(0, 10) ||
    (value.expected_updated_at.endsWith("Z")
      ? false
      : Number(value.expected_updated_at.slice(-5, -3)) > 15)
  )
    throw new OverviewMemoInputError(
      "메모 저장 시각을 확인한 뒤 다시 시도해 주세요.",
    );
  const identity = {
    id: value.id,
    expected_updated_at: value.expected_updated_at,
  };
  if (Object.hasOwn(value, "action")) {
    keys(value, ["id", "expected_updated_at", "action"]);
    if (value.action !== "archive" && value.action !== "restore")
      throw new OverviewMemoInputError("메모 보관·복구 요청을 확인해 주세요.");
    return { ...identity, action: value.action };
  }
  keys(value, ["id", "expected_updated_at", "body", "done"]);
  const hasBody = Object.hasOwn(value, "body");
  const hasDone = Object.hasOwn(value, "done");
  if (!hasBody && !hasDone)
    throw new OverviewMemoInputError("변경할 메모 내용을 확인해 주세요.");
  if (hasDone && typeof value.done !== "boolean")
    throw new OverviewMemoInputError("메모 체크 상태를 확인해 주세요.");
  return {
    ...identity,
    ...(hasBody ? { body: parseOverviewMemoBody(value.body) } : {}),
    ...(hasDone ? { done: value.done as boolean } : {}),
  };
}

/** Company endpoint accepts no scope override, including duplicate query fields. */
export function overviewMemoQueryAllowed(params: URLSearchParams) {
  return (
    [...params].every(
      ([key, value]) => key === "workspace" && value === "FRENGLE",
    ) && params.getAll("workspace").length <= 1
  );
}

export function overviewMemoFailure(error: { code?: string } | null) {
  if (["42P01", "42703", "PGRST204", "PGRST205"].includes(error?.code || ""))
    return {
      status: 503,
      body: {
        ready: false,
        setupRequired: true,
        error:
          "FRENGLE 메모 저장소 설정이 필요합니다. 회사 SQL005 적용을 확인해 주세요.",
      },
    };
  if (["23514", "23502", "22P02"].includes(error?.code || ""))
    return {
      status: 400,
      body: { error: "메모 입력과 체크 상태를 확인해 주세요." },
    };
  return {
    status: 503,
    body: {
      ready: false,
      error: "메모 저장소에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.",
    },
  };
}
