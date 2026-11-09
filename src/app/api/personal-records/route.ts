import { NextRequest } from "next/server";
import { json, sameOrigin } from "@/lib/http";
import {
  workspaceSession,
  WorkspaceAccessError,
} from "@/lib/workspaces/server";
import {
  personalRecordColumns,
  personalRecordLimits,
  personalRecordQueryAllowed,
  personalRecordFailure,
  personalRecordCreateMatches,
  parsePersonalRecordCreate,
  parsePersonalRecordPatch,
  PersonalRecordInputError,
  type PersonalRecord,
} from "@/lib/personal-records";

const table = "ops_personal_records";
const conflict = () =>
  json(
    {
      conflict: true,
      error:
        "다른 화면에서 기록이 바뀌었어요. 최신 기록을 불러온 뒤 다시 저장해 주세요.",
    },
    409,
  );

async function handle(req: NextRequest) {
  if (req.method !== "GET" && !sameOrigin(req))
    return json({ error: "허용되지 않은 요청입니다." }, 403);
  if (!personalRecordQueryAllowed(req.nextUrl.searchParams))
    return json({ error: "나의 기록은 PERSONAL에서만 사용할 수 있어요." }, 403);
  try {
    const { client, user } = await workspaceSession(
      new URLSearchParams({ workspace: "PERSONAL" }),
    );
    if (req.method === "GET") {
      const [active, archived] = await Promise.all([
        client
          .from(table)
          .select(personalRecordColumns, { count: "exact" })
          .eq("owner_id", user.id)
          .is("archived_at", null)
          .order("entry_date", { ascending: false })
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(personalRecordLimits.active + 1),
        client
          .from(table)
          .select(personalRecordColumns, { count: "exact" })
          .eq("owner_id", user.id)
          .not("archived_at", "is", null)
          .order("archived_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(personalRecordLimits.archived + 1),
      ]);
      if (active.error || archived.error) {
        const failure = personalRecordFailure(active.error || archived.error);
        return json(failure.body, failure.status);
      }
      return json({
        ready: true,
        items: (active.data || []).slice(0, personalRecordLimits.active),
        archived: (archived.data || []).slice(0, personalRecordLimits.archived),
        truncated:
          (active.count || 0) > personalRecordLimits.active ||
          (active.data?.length || 0) > personalRecordLimits.active,
        archivedTruncated:
          (archived.count || 0) > personalRecordLimits.archived ||
          (archived.data?.length || 0) > personalRecordLimits.archived,
      });
    }
    const raw = await req.text();
    if (new TextEncoder().encode(raw).length > 100_000)
      return json({ error: "기록 입력이 너무 커요. 내용을 줄여 주세요." }, 413);
    if (req.method === "POST") {
      const value = parsePersonalRecordCreate(JSON.parse(raw));
      const result = await client
        .from(table)
        .insert(value)
        .select(personalRecordColumns)
        .eq("owner_id", user.id)
        .maybeSingle();
      if (result.error?.code === "23505") {
        // Retrying a lost response may return the same record, but never overwrite edits.
        const current = await client
          .from(table)
          .select(personalRecordColumns)
          .eq("id", value.id)
          .eq("owner_id", user.id)
          .maybeSingle();
        if (current.error) {
          const failure = personalRecordFailure(current.error);
          return json(failure.body, failure.status);
        }
        return current.data &&
          personalRecordCreateMatches(current.data as PersonalRecord, value)
          ? json({ item: current.data })
          : conflict();
      }
      if (result.error || !result.data) {
        const failure = personalRecordFailure(result.error);
        return json(failure.body, failure.status);
      }
      return json({ item: result.data }, 201);
    }
    const value = parsePersonalRecordPatch(JSON.parse(raw));
    const change = value.action
      ? {
          archived_at:
            value.action === "archive" ? new Date().toISOString() : null,
        }
      : {
          ...(Object.hasOwn(value, "body") ? { body: value.body } : {}),
          ...(Object.hasOwn(value, "kind") ? { kind: value.kind } : {}),
          ...(Object.hasOwn(value, "entry_date")
            ? { entry_date: value.entry_date }
            : {}),
          ...(Object.hasOwn(value, "done") ? { done: value.done } : {}),
        };
    let query = client
      .from(table)
      .update(change)
      .eq("id", value.id)
      .eq("owner_id", user.id)
      .eq("updated_at", value.expectedUpdatedAt);
    query =
      value.action === "restore"
        ? query.not("archived_at", "is", null)
        : query.is("archived_at", null);
    const result = await query.select(personalRecordColumns).maybeSingle();
    if (result.error) {
      const failure = personalRecordFailure(result.error);
      return json(failure.body, failure.status);
    }
    if (result.data) return json({ item: result.data });
    const current = await client
      .from(table)
      .select("id")
      .eq("id", value.id)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (current.error) {
      const failure = personalRecordFailure(current.error);
      return json(failure.body, failure.status);
    }
    return current.data
      ? conflict()
      : json({ error: "기록을 찾을 수 없어요." }, 404);
  } catch (error) {
    if (error instanceof WorkspaceAccessError)
      return json({ error: error.message }, error.status);
    if (error instanceof PersonalRecordInputError)
      return json({ error: error.message }, 400);
    if (error instanceof SyntaxError)
      return json({ error: "기록 입력 형식을 확인해 주세요." }, 400);
    const failure = personalRecordFailure(null);
    return json(failure.body, failure.status);
  }
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
