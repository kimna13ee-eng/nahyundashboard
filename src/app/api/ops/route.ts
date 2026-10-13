import { NextRequest } from "next/server";
import { json, sameOrigin } from "@/lib/http";
import { personalClient, personalConfigured } from "@/lib/supabase/server";
import { parseResource, resources, uuid, type Resource } from "@/lib/ops";
import { parseTimerRequest, timerRpcFailure } from "@/lib/timer-request";
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
      const serverNow = new Date().toISOString();
      const [results, deletedSchedules] = await Promise.all([
        Promise.all(
          Object.entries(tables).map(async ([name, table]) => {
            let query = client
              .from(table)
              .select("*", { count: "exact" })
              .eq("owner_id", user.id);
            if (name === "schedules") query = query.is("deleted_at", null);
            const { data, error, count } = await query
              .order("created_at", { ascending: false })
              .limit(1000);
            return { name, data, error, count };
          }),
        ),
        client
          .from("ops_schedules")
          .select("*", { count: "exact" })
          .eq("owner_id", user.id)
          .not("deleted_at", "is", null)
          .gt("purge_after", serverNow)
          .order("deleted_at", { ascending: false })
          .limit(1000),
      ]);
      if (results.some((r) => r.error) || deletedSchedules.error)
        return json(
          {
            error:
              "DB 조회에 실패했습니다. 001/002/011 마이그레이션 적용과 권한을 확인해 주세요.",
          },
          503,
        );
      const classification = await client
        .from("tasks")
        .select("work_kind")
        .limit(0);
      const guardCapability = await client.rpc("ops_timer_guard_ready");
      return json({
        timerGuardReady:
          !guardCapability.error && guardCapability.data === true,
        libraryWorkflow: !(
          await client
            .from("ops_library_items")
            .select("approved_version_id")
            .limit(0)
        ).error,
        taskClassification: !classification.error,
        data: {
          ...Object.fromEntries(results.map((r) => [r.name, r.data])),
          deleted_schedules: deletedSchedules.data,
        },
        serverNow,
        truncated: [
          ...results.filter((r) => (r.count || 0) > 1000).map((r) => r.name),
          ...((deletedSchedules.count || 0) > 1000
            ? ["deleted_schedules"]
            : []),
        ],
        companyConnected: false,
      });
    }
    const body = await req.json();
    if (body.action === "timer") {
      const { data, error } = await client.rpc(
        "ops_timer_guarded",
        parseTimerRequest(body),
      );
      if (error) {
        const failure = timerRpcFailure(error);
        return json(failure.body, failure.status);
      }
      return json({ ok: true, session_id: data });
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
    if (body.action === "restore_schedule") {
      if (!uuid(body.id)) return json({ error: "일정 ID 오류" }, 400);
      const { data, error } = await client.rpc("ops_schedule_restore", {
        p_schedule_id: body.id,
      });
      if (error)
        return json(
          { error: "일정 복구에 실패했습니다. SQL011 적용을 확인해 주세요." },
          409,
        );
      if (data === "expired")
        return json({ error: "12시간의 복구 가능 시간이 지났습니다." }, 410);
      if (data === "not_found")
        return json({ error: "복구할 일정을 찾을 수 없습니다." }, 404);
      return json({ ok: true, status: data });
    }
    if (!resources.includes(body.resource))
      return json({ error: "지원하지 않는 항목입니다." }, 400);
    const resource = body.resource as Resource,
      table = tables[resource];
    if (req.method !== "POST" && !uuid(body.id))
      return json({ error: "항목 ID 오류" }, 400);
    if (req.method === "DELETE") {
      if (resource === "schedules") {
        const { data, error } = await client.rpc("ops_schedule_soft_delete", {
          p_schedule_id: body.id,
        });
        if (error)
          return json(
            {
              error:
                "일정을 휴지통으로 옮기지 못했습니다. SQL011 적용을 확인해 주세요.",
            },
            409,
          );
        return data === "not_found"
          ? json({ error: "일정을 찾을 수 없습니다." }, 404)
          : json({ ok: true, status: data });
      }
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
