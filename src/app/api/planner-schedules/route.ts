import { NextRequest } from "next/server";
import { json, sameOrigin } from "@/lib/http";
import {
  workspaceSession,
  WorkspaceAccessError,
} from "@/lib/workspaces/server";
import {
  parsePlannerMutation,
  parsePlannerQuery,
  PlannerScheduleInputError,
  plannerScheduleColumns,
  plannerScheduleLimit,
  plannerScheduleMatches,
} from "@/lib/planner-schedules";

const table = "ops_schedules";
function failure(error?: { code?: string } | null) {
  return error?.code === "42501"
    ? json({ error: "요가 일정에 접근할 권한이 없어요." }, 403)
    : json(
        { error: "요가 일정을 처리하지 못했어요. 잠시 후 다시 시도해 주세요." },
        503,
      );
}
const missing = () => json({ error: "요가 일정을 찾을 수 없어요." }, 404);

async function handle(req: NextRequest) {
  if (req.method !== "GET" && !sameOrigin(req))
    return json({ error: "허용되지 않은 요청입니다." }, 403);
  try {
    const range = parsePlannerQuery(req.nextUrl.searchParams, req.method);
    const { client, user } = await workspaceSession(
      new URLSearchParams({ workspace: "PERSONAL" }),
    );
    if (req.method === "GET") {
      const result = await client
        .from(table)
        .select(plannerScheduleColumns, { count: "exact" })
        .eq("owner_id", user.id)
        .eq("category", "exercise")
        .is("deleted_at", null)
        .gte("starts_at", range!.from)
        .lte("starts_at", range!.to)
        .order("starts_at", { ascending: true })
        .order("id", { ascending: true })
        .limit(plannerScheduleLimit + 1);
      if (result.error) return failure(result.error);
      return json({
        schedules: (result.data || []).slice(0, plannerScheduleLimit),
        truncated:
          (result.count || 0) > plannerScheduleLimit ||
          (result.data?.length || 0) > plannerScheduleLimit,
      });
    }
    const raw = await req.text();
    if (new TextEncoder().encode(raw).length > 16_000)
      return json({ error: "영상 입력이 너무 커요. 내용을 줄여 주세요." }, 413);
    const mutation = parsePlannerMutation(JSON.parse(raw), req.method);
    if (mutation.action === "create") {
      const id = mutation.id ?? crypto.randomUUID();
      const result = await client
        .from(table)
        .insert({
          ...mutation.value,
          id,
          owner_id: user.id,
          category: "exercise",
          timezone: "Asia/Seoul",
        })
        .select(plannerScheduleColumns)
        .maybeSingle();
      if (result.error?.code === "23505") {
        const existing = await client
          .from(table)
          .select(plannerScheduleColumns)
          .eq("id", id)
          .eq("owner_id", user.id)
          .eq("category", "exercise")
          .is("deleted_at", null)
          .maybeSingle();
        if (existing.error) return failure(existing.error);
        return existing.data &&
          plannerScheduleMatches(existing.data, mutation.value)
          ? json({ schedule: existing.data })
          : json(
              {
                error:
                  "같은 영상 등록 요청이 이미 처리됐어요. 최신 일정을 확인해 주세요.",
              },
              409,
            );
      }
      return result.error || !result.data
        ? failure(result.error)
        : json({ schedule: result.data }, 201);
    }
    if (mutation.action === "update") {
      const result = await client
        .from(table)
        .update(mutation.value)
        .eq("id", mutation.id!)
        .eq("owner_id", user.id)
        .eq("category", "exercise")
        .is("deleted_at", null)
        .select(plannerScheduleColumns)
        .maybeSingle();
      return result.error
        ? failure(result.error)
        : result.data
          ? json({ schedule: result.data })
          : missing();
    }
    // The existing RPCs enforce owner ownership and serialize delete/restore.
    // First restrict this narrow endpoint to exercise schedules only.
    const target = await client
      .from(table)
      .select("id")
      .eq("id", mutation.id)
      .eq("owner_id", user.id)
      .eq("category", "exercise")
      .maybeSingle();
    if (target.error) return failure(target.error);
    if (!target.data) return missing();
    const result = await client.rpc(
      mutation.action === "delete"
        ? "ops_schedule_soft_delete"
        : "ops_schedule_restore",
      { p_schedule_id: mutation.id },
    );
    if (result.error) return failure(result.error);
    if (result.data === "not_found") return missing();
    if (result.data === "expired")
      return json({ error: "12시간의 복구 가능 시간이 지났어요." }, 410);
    const expected =
      mutation.action === "delete"
        ? ["deleted", "already_deleted"]
        : ["restored", "already_active"];
    return expected.includes(result.data)
      ? json({ ok: true, status: result.data })
      : failure();
  } catch (error) {
    if (
      error instanceof WorkspaceAccessError ||
      error instanceof PlannerScheduleInputError
    )
      return json({ error: error.message }, error.status);
    if (error instanceof SyntaxError)
      return json({ error: "영상 입력 형식을 확인해 주세요." }, 400);
    return failure();
  }
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
