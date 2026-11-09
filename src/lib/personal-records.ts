export const personalRecordKinds = ["note", "idea", "todo"] as const;
export type PersonalRecordKind = (typeof personalRecordKinds)[number];
export const personalRecordLimits = { body: 6000, active: 300, archived: 100 };
export const personalRecordColumns =
  "id,body,kind,entry_date,done,archived_at,created_at,updated_at";

export type PersonalRecord = {
  id: string;
  body: string;
  kind: PersonalRecordKind;
  entry_date: string;
  done: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};
export type PersonalRecordCreate = Pick<
  PersonalRecord,
  "id" | "body" | "kind" | "entry_date" | "done"
>;
export type PersonalRecordPatch = { id: string; expectedUpdatedAt: string } & (
  | { action: "archive" | "restore" }
  | {
      action?: never;
      body?: string;
      kind?: PersonalRecordKind;
      entry_date?: string;
      done?: boolean;
    }
);

export class PersonalRecordInputError extends Error {}

function fail(message: string): never {
  throw new PersonalRecordInputError(message);
}
function object(raw: unknown): Record<string, unknown> {
  if (
    !raw ||
    typeof raw !== "object" ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(raw))
  )
    fail("기록 입력을 확인해 주세요.");
  return raw as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: string[]) {
  if (
    Reflect.ownKeys(value).some(
      (key) => typeof key !== "string" || !allowed.includes(key),
    )
  )
    fail("허용된 기록 입력 항목만 보내 주세요.");
}
function id(raw: unknown) {
  if (
    typeof raw !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)
  )
    fail("기록 항목을 확인해 주세요.");
  return raw.toLowerCase();
}
export function parsePersonalRecordBody(raw: unknown) {
  if (typeof raw !== "string") fail("기록 내용을 입력해 주세요.");
  const body = raw.trim();
  if (
    !body ||
    Array.from(body).length > personalRecordLimits.body ||
    body.includes("\0")
  )
    fail("기록은 1~6,000자로 입력해 주세요.");
  return body;
}
export function isPersonalRecordDate(raw: unknown): raw is string {
  return (
    typeof raw === "string" &&
    /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(raw) &&
    !raw.startsWith("0000") &&
    Number.isFinite(Date.parse(`${raw}T00:00:00Z`)) &&
    new Date(`${raw}T00:00:00Z`).toISOString().slice(0, 10) === raw
  );
}
function date(raw: unknown) {
  if (!isPersonalRecordDate(raw)) fail("존재하는 기록 날짜를 입력해 주세요.");
  return raw;
}
function kind(raw: unknown): PersonalRecordKind {
  if (!personalRecordKinds.includes(raw as PersonalRecordKind))
    fail("기록 종류를 확인해 주세요.");
  return raw as PersonalRecordKind;
}
function done(raw: unknown) {
  if (typeof raw !== "boolean") fail("할 일 완료 상태를 확인해 주세요.");
  return raw;
}
// Keep the database's microsecond precision, rather than round-tripping through Date.
function token(raw: unknown) {
  if (
    typeof raw !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:0\d|1[0-5]):[0-5]\d)$/.test(
      raw,
    ) ||
    !isPersonalRecordDate(raw.slice(0, 10)) ||
    !Number.isFinite(Date.parse(raw))
  )
    fail("기록 저장 시각을 확인한 뒤 다시 시도해 주세요.");
  return raw;
}
export function parsePersonalRecordCreate(raw: unknown): PersonalRecordCreate {
  const v = object(raw);
  keys(v, ["id", "body", "kind", "entry_date", "done"]);
  const value = {
    id: id(v.id),
    body: parsePersonalRecordBody(v.body),
    kind: kind(v.kind),
    entry_date: date(v.entry_date),
    done: Object.hasOwn(v, "done") ? done(v.done) : false,
  };
  if (value.done && value.kind !== "todo")
    fail("할 일만 완료로 체크할 수 있어요.");
  return value;
}
export function parsePersonalRecordPatch(raw: unknown): PersonalRecordPatch {
  const v = object(raw);
  const identity = {
    id: id(v.id),
    expectedUpdatedAt: token(v.expectedUpdatedAt),
  };
  if (Object.hasOwn(v, "action")) {
    keys(v, ["id", "expectedUpdatedAt", "action"]);
    if (v.action !== "archive" && v.action !== "restore")
      fail("기록 보관·복구 요청을 확인해 주세요.");
    return { ...identity, action: v.action };
  }
  keys(v, ["id", "expectedUpdatedAt", "body", "kind", "entry_date", "done"]);
  if (
    !["body", "kind", "entry_date", "done"].some((key) => Object.hasOwn(v, key))
  )
    fail("변경할 기록 내용을 확인해 주세요.");
  const value = {
    ...identity,
    ...(Object.hasOwn(v, "body")
      ? { body: parsePersonalRecordBody(v.body) }
      : {}),
    ...(Object.hasOwn(v, "kind") ? { kind: kind(v.kind) } : {}),
    ...(Object.hasOwn(v, "entry_date")
      ? { entry_date: date(v.entry_date) }
      : {}),
    ...(Object.hasOwn(v, "done") ? { done: done(v.done) } : {}),
  };
  if (value.kind && value.kind !== "todo") {
    if (value.done) fail("할 일만 완료로 체크할 수 있어요.");
    value.done = false;
  }
  return value;
}
export function personalRecordCreateMatches(
  row: PersonalRecord,
  value: PersonalRecordCreate,
) {
  return (
    !row.archived_at &&
    row.id === value.id &&
    row.body === value.body &&
    row.kind === value.kind &&
    row.entry_date === value.entry_date &&
    row.done === value.done
  );
}
export function personalRecordQueryAllowed(params: URLSearchParams) {
  return (
    [...params].every(
      ([key, value]) => key === "workspace" && value === "PERSONAL",
    ) && params.getAll("workspace").length <= 1
  );
}
export function personalRecordFailure(error: { code?: string } | null) {
  if (["42P01", "42703", "PGRST204", "PGRST205"].includes(error?.code || ""))
    return {
      status: 503,
      body: {
        ready: false,
        setupRequired: true,
        error:
          "개인 기록 저장소를 준비 중이에요. 설정 완료 후 다시 시도해 주세요.",
      },
    };
  if (["23514", "23502", "22P02", "22007", "22008"].includes(error?.code || ""))
    return {
      status: 400,
      body: { error: "기록 내용과 날짜, 완료 상태를 확인해 주세요." },
    };
  return {
    status: 503,
    body: {
      ready: false,
      error: "기록을 저장소에서 확인하지 못했어요. 잠시 후 다시 시도해 주세요.",
    },
  };
}
