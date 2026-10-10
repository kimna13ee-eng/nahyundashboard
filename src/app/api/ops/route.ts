import { NextRequest } from "next/server";
import { json, sameOrigin } from "@/lib/http";
import { personalClient, personalConfigured } from "@/lib/supabase/server";
import { parseResource, resources, uuid, type Resource } from "@/lib/ops";
import { parseParkContext } from "@/lib/workflow";
const tables: Record<string, string> = {
  projects: "ops_projects",
  tasks: "tasks",
  task_notes: "ops_task_notes",
  note_versions: "ops_note_versions",
  schedules: "ops_schedules",
  work_sessions: "ops_work_sessions",
  session_intervals: "ops_session_intervals",
  session_events: "ops_session_events",
  work_journal: "ops_work_journal",
  library_items: "ops_library_items",
  prompt_versions: "ops_prompt_versions",
};
async function handle(req: NextRequest) {
  if (
    !["PERSONAL", "ALL"].includes(
      req.nextUrl.searchParams.get("workspace") || "",
    )
  )
    return json(
      {
        error:
          "FRENGLE 실제 저장소는 미연결입니다. 개인 DB에 회사 자료를 저장하지 않습니다.",
      },
      403,
    );
  if (req.method !== "GET" && !sameOrigin(req))
    return json({ error: "허용되지 않은 요청입니다." }, 403);
  if (!personalConfigured())
    return json({ error: "PERSONAL 환경변수가 필요합니다." }, 503);
  try {
    const client = await personalClient();
    const {
      data: { user },
      error: authError,
    } = await client.auth.getUser();
    if (authError || !user)
      return json({ error: "개인 계정 로그인이 필요합니다." }, 401);
    if (req.method === "GET") {
      const results = await Promise.all(
        Object.entries(tables).map(async ([name, table]) => {
          const { data, error, count } = await client
            .from(table)
            .select("*", { count: "exact" })
            .eq("owner_id", user.id)
            .order("created_at", { ascending: false })
            .limit(1000);
          return { name, data, error, count };
        }),
      );
      if (results.some((r) => r.error))
        return json(
          {
            error:
              "DB 조회에 실패했습니다. 001/002 마이그레이션 적용과 권한을 확인해 주세요.",
          },
          503,
        );
      const classification = await client
        .from("tasks")
        .select("work_kind")
        .limit(0);
      return json({
        libraryWorkflow: !(
          await client
            .from("ops_library_items")
            .select("approved_version_id")
            .limit(0)
        ).error,
        taskClassification: !classification.error,
        data: Object.fromEntries(results.map((r) => [r.name, r.data])),
        serverNow: new Date().toISOString(),
        truncated: results
          .filter((r) => (r.count || 0) > 1000)
          .map((r) => r.name),
        companyConnected: false,
      });
    }
    const body = await req.json();
    if (body.action === "timer") {
      if (
        !["start", "pause", "finish"].includes(body.command) ||
        !uuid(body.request_id) ||
        (body.task_id != null && !uuid(body.task_id)) ||
        typeof body.summary !== "string" ||
        body.summary.length > 10000
      )
        return json({ error: "타이머 요청을 확인해 주세요." }, 400);
      const { error } = await client.rpc(
        body.context ? "ops_timer_context" : "ops_timer",
        {
          p_command: body.command,
          p_task_id: body.task_id || null,
          p_request_id: body.request_id,
          p_summary: body.summary,
          ...(body.context
            ? { p_context: parseParkContext(body.context) }
            : {}),
        },
      );
      return error
        ? json(
            {
              error:
                "타이머 처리 실패. 다른 탭의 상태를 새로고침하고 재시도하세요.",
            },
            409,
          )
        : json({ ok: true });
    }
    if (body.action === "note_to_task") {
      if (!uuid(body.id)) return json({ error: "메모 ID 오류" }, 400);
      const { data, error } = await client.rpc("ops_note_to_task", {
        p_note_id: body.id,
      });
      return error
        ? json({ error: "다음 액션 변환에 실패했습니다." }, 409)
        : json({ id: data });
    }
    if (!resources.includes(body.resource))
      return json({ error: "지원하지 않는 항목입니다." }, 400);
    const resource = body.resource as Resource,
      table = tables[resource];
    if (req.method !== "POST" && !uuid(body.id))
      return json({ error: "항목 ID 오류" }, 400);
    if (req.method === "DELETE") {
      const { data, error } = await client
        .from(table)
        .delete()
        .eq("id", body.id)
        .eq("owner_id", user.id)
        .select("id")
        .maybeSingle();
      return error
        ? json(
            {
              error:
                "삭제 실패. 연결된 업무·일정·시간 기록이 있으면 먼저 관계를 확인해 주세요.",
            },
            409,
          )
        : data
          ? json({ ok: true })
          : json({ error: "항목을 찾을 수 없습니다." }, 404);
    }
    const value = parseResource(resource, body.value);
    const q =
      req.method === "POST"
        ? client.from(table).insert({ ...value, owner_id: user.id })
        : client
            .from(table)
            .update(value)
            .eq("id", body.id)
            .eq("owner_id", user.id);
    const { data, error } = await q.select("*").maybeSingle();
    return error
      ? json(
          {
            error: "저장 실패. DB 스키마, 권한 또는 연결 항목을 확인해 주세요.",
          },
          409,
        )
      : data
        ? json({ row: data }, req.method === "POST" ? 201 : 200)
        : json({ error: "항목을 찾을 수 없습니다." }, 404);
  } catch (e) {
    return json(
      {
        error:
          e instanceof Error &&
          /확인|입력|시간|연결|URL|링크|인증정보|비밀정보/.test(e.message)
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
