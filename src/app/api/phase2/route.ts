import { NextRequest } from "next/server";
import { json, sameOrigin } from "@/lib/http";
import { personalClient, personalConfigured } from "@/lib/supabase/server";
import { phase2Tables, parsePhase2, type Phase2Resource } from "@/lib/phase2";
import { uuid } from "@/lib/ops";
import { personalStages } from "@/lib/personal-content";
async function handle(req: NextRequest) {
  if (
    !["PERSONAL", "ALL"].includes(
      req.nextUrl.searchParams.get("workspace") || "",
    )
  )
    return json({ error: "FRENGLE 저장소는 미연결입니다." }, 403);
  if (req.method !== "GET" && !sameOrigin(req))
    return json({ error: "허용되지 않은 요청입니다." }, 403);
  if (!personalConfigured())
    return json({ error: "PERSONAL 연결이 필요합니다." }, 503);
  try {
    const client = await personalClient();
    const {
      data: { user },
      error,
    } = await client.auth.getUser();
    if (error || !user)
      return json({ error: "개인 계정 로그인이 필요합니다." }, 401);
    if (req.method === "GET") {
      const results = await Promise.all(
        Object.entries(phase2Tables).map(async ([name, table]) => {
          const result = await client
            .from(table)
            .select("*", { count: "exact" })
            .eq("owner_id", user.id)
            .order("created_at", { ascending: false })
            .limit(1000);
          return { name, ...result };
        }),
      );
      if (results.some((r) => r.error))
        return json(
          {
            error:
              "Phase 2 DB 조회 실패. 003 SQL 적용 여부와 권한을 확인해 주세요.",
            migrationRequired: results.some(
              (r) => r.error?.code === "PGRST205" || r.error?.code === "42P01",
            ),
          },
          503,
        );
      const capability = await client.rpc("ops_recurrence_at", {
        p_start: "2026-01-31T09:00:00+09:00",
        p_frequency: "monthly",
        p_interval: 1,
        p_index: 1,
      });
      return json({
        recurrenceArchive: !(
          await client.from("ops_recurrence").select("archived_at").limit(0)
        ).error,
        contentHistory: !(
          await client.from("ops_content_versions").select("id").limit(0)
        ).error,
        versions:
          (
            await client
              .from("ops_content_versions")
              .select("*")
              .eq("owner_id", user.id)
              .order("created_at", { ascending: false })
              .limit(1000)
          ).data || [],
        contentTasks:
          (
            await client
              .from("ops_content_tasks")
              .select("*")
              .eq("owner_id", user.id)
              .order("created_at", { ascending: false })
              .limit(1000)
          ).data || [],
        personalContent: !(
          await client.from("ops_content").select("personal_details").limit(0)
        ).error,
        calendarRecurrence: !capability.error,
        data: Object.fromEntries(results.map((r) => [r.name, r.data])),
        truncated: results
          .filter((r) => (r.count || 0) > 1000)
          .map((r) => r.name),
      });
    }
    const body = await req.json();
    if (body.action === "recurrence_archive") {
      if (
        req.method !== "PATCH" ||
        !uuid(body.id) ||
        typeof body.archived !== "boolean"
      )
        return json({ error: "반복 일정 보관 요청을 확인해 주세요." }, 400);
      const result = await client
        .from("ops_recurrence")
        .update({
          archived_at: body.archived ? new Date().toISOString() : null,
        })
        .eq("owner_id", user.id)
        .eq("id", body.id)
        .select("id")
        .maybeSingle();
      return result.error
        ? json(
            { error: "반복 일정 보관·복원 실패. 연결과 권한을 확인해 주세요." },
            409,
          )
        : result.data
          ? json({ ok: true })
          : json({ error: "반복 일정을 찾을 수 없습니다." }, 404);
    }
    if (body.action === "content_task") {
      if (!uuid(body.id) || !personalStages.includes(body.step))
        return json({ error: "콘텐츠·단계 확인 필요" }, 400);
      const result = await client.rpc("ops_content_task", {
        p_content: body.id,
        p_step: body.step,
      });
      return result.error
        ? json(
            {
              error: "단계 업무 연결 실패. SQL008 적용과 권한을 확인해 주세요.",
            },
            409,
          )
        : json({ ok: true, id: result.data });
    }
    if (body.action === "recurrence_change") {
      if (
        !uuid(body.id) ||
        !["one", "future", "all"].includes(body.scope) ||
        typeof body.cancel !== "boolean" ||
        typeof body.original_at !== "string" ||
        !Number.isFinite(Date.parse(body.original_at))
      )
        return json({ error: "반복 변경 요청을 확인해 주세요." }, 400);
      const value = body.cancel ? {} : parsePhase2("recurrence", body.value);
      const { error } = await client.rpc("ops_recurrence_change", {
        p_rule: body.id,
        p_original: body.original_at,
        p_scope: body.scope,
        p_value: value,
        p_cancel: body.cancel,
      });
      return error
        ? json(
            {
              error:
                "반복 일정 변경 실패. 다른 탭의 상태와 입력을 확인해 주세요.",
            },
            409,
          )
        : json({ ok: true });
    }
    if (
      typeof body.resource !== "string" ||
      !Object.hasOwn(phase2Tables, body.resource) ||
      body.resource === "exceptions"
    )
      return json({ error: "지원하지 않는 항목입니다." }, 400);
    const resource = body.resource as Phase2Resource;
    if (req.method !== "POST" && !uuid(body.id))
      return json({ error: "ID를 확인해 주세요." }, 400);
    if (resource === "recurrence" && req.method !== "POST")
      return json({ error: "반복 일정 변경 범위를 선택해 주세요." }, 400);
    const table = phase2Tables[resource];
    if (req.method === "DELETE") {
      const result = await client
        .from(table)
        .delete()
        .eq("owner_id", user.id)
        .eq("id", body.id)
        .select("id")
        .maybeSingle();
      return result.error
        ? json({ error: "삭제 실패. 연결된 항목을 확인해 주세요." }, 409)
        : result.data
          ? json({ ok: true })
          : json({ error: "항목을 찾을 수 없습니다." }, 404);
    }
    const value = parsePhase2(resource, body.value);
    if (
      resource === "content" &&
      "personal_details" in value &&
      (await client.from("ops_content").select("personal_details").limit(0))
        .error
    )
      return json(
        { error: "개인 콘텐츠 확장 SQL 006 적용이 필요합니다." },
        503,
      );
    const q =
      req.method === "POST"
        ? client.from(table).insert({ ...value, owner_id: user.id })
        : client
            .from(table)
            .update(value)
            .eq("owner_id", user.id)
            .eq("id", body.id);
    const result = await q.select("*").maybeSingle();
    return result.error
      ? json(
          { error: "저장 실패. DB 적용·권한·연결 항목을 확인해 주세요." },
          409,
        )
      : result.data
        ? json({ row: result.data }, req.method === "POST" ? 201 : 200)
        : json({ error: "항목을 찾을 수 없습니다." }, 404);
  } catch (e) {
    return json(
      {
        error:
          e instanceof Error && /확인|입력|종료|연차|검수|발행/.test(e.message)
            ? e.message
            : "요청을 처리하지 못했습니다.",
      },
      400,
    );
  }
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
