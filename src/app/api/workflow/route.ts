import { NextRequest } from "next/server";
import { json, sameOrigin } from "@/lib/http";
import { personalClient, personalConfigured } from "@/lib/supabase/server";
import { uuid, seoulDate } from "@/lib/ops";
import {
  parseCapture,
  parseParkContext,
  safeText,
  timestamp,
  runStates,
} from "@/lib/workflow";
const tables = {
  inbox: "ops_inbox",
  contexts: "ops_parked_context",
  runs: "ops_recurrence_runs",
};
async function handle(req: NextRequest) {
  if (
    !["PERSONAL", "ALL"].includes(
      req.nextUrl.searchParams.get("workspace") || "",
    )
  )
    return json({ error: "FRENGLE 미연결" }, 403);
  if (req.method !== "GET" && !sameOrigin(req))
    return json({ error: "허용되지 않은 요청" }, 403);
  if (!personalConfigured()) return json({ error: "PERSONAL 연결 필요" }, 503);
  try {
    const client = await personalClient();
    const {
      data: { user },
      error,
    } = await client.auth.getUser();
    if (error || !user) return json({ error: "개인 계정 로그인 필요" }, 401);
    if (req.method === "GET") {
      const results = await Promise.all(
        Object.entries(tables).map(async ([key, table]) => ({
          key,
          ...(await client
            .from(table)
            .select("*", { count: "exact" })
            .eq("owner_id", user.id)
            .order("created_at", { ascending: false })
            .limit(1000)),
        })),
      );
      if (results.some((r) => r.error))
        return json({
          ready: false,
          data: {},
          error:
            "업무 흐름 SQL007 미적용 또는 조회 실패. 기존 기능은 계속 사용할 수 있습니다.",
        });
      return json({
        ready: true,
        data: Object.fromEntries(results.map((r) => [r.key, r.data])),
        truncated: results
          .filter((r) => (r.count || 0) > 1000)
          .map((r) => r.key),
      });
    }
    const b = await req.json();
    if (!uuid(b.id)) return json({ error: "ID 확인 필요" }, 400);
    if (b.action === "capture") {
      if (!["inbox", "task", "now", "schedule", "archive"].includes(b.mode))
        return json({ error: "수집 동작 확인 필요" }, 400);
      const value = parseCapture(b.value);
      if (b.mode === "now") {
        const guard = await client.rpc("ops_timer_guard_ready");
        if (guard.error || guard.data !== true)
          return json(
            { error: "타이머 보호 SQL010 적용·연결 확인이 필요합니다." },
            503,
          );
      }
      const context = parseParkContext(b.context || {});
      if (b.mode === "schedule" && !value.schedule_at)
        return json({ error: "일정 시각을 입력해 주세요." }, 400);
      const result = await client.rpc("ops_capture", {
        p_id: b.id,
        p_mode: b.mode,
        p_value: value,
        p_context: context,
      });
      return result.error
        ? json(
            { error: "수집·변환 실패. SQL007·연결·입력을 확인해 주세요." },
            409,
          )
        : json({ ok: true, id: result.data });
    }
    if (b.action === "inbox_restore") {
      const previous = await client
        .from(tables.inbox)
        .select("converted_task_id")
        .eq("id", b.id)
        .eq("owner_id", user.id)
        .eq("status", "archived")
        .maybeSingle();
      if (previous.error) return json({ error: "보관 이력 조회 실패" }, 409);
      if (!previous.data)
        return json({ error: "보관 항목을 찾지 못했습니다." }, 404);
      const restored = await client
        .from(tables.inbox)
        .update({
          status: previous.data.converted_task_id ? "converted" : "inbox",
        })
        .eq("id", b.id)
        .eq("owner_id", user.id)
        .eq("status", "archived")
        .select("id")
        .maybeSingle();
      return restored.error || !restored.data
        ? json(
            { error: "복원 실패 또는 다른 창에서 상태가 변경되었습니다." },
            409,
          )
        : json({ ok: true });
    }
    if (b.action === "inbox_update") {
      const value = parseCapture(b.value);
      const r = await client
        .from(tables.inbox)
        .update(value)
        .eq("id", b.id)
        .eq("owner_id", user.id)
        .eq("status", "inbox")
        .select("id")
        .maybeSingle();
      return r.error
        ? json({ error: "Inbox 수정 실패" }, 409)
        : r.data
          ? json({ ok: true })
          : json({ error: "미분류 Inbox 항목을 찾지 못했습니다." }, 404);
    }
    if (b.action === "run") {
      if (!Object.hasOwn(runStates, b.status))
        return json({ error: "실행 상태 확인 필요" }, 400);
      const at = timestamp(b.original_at);
      if (!at) throw new Error("회차 시각 확인 필요");
      const rule = await client
        .from("ops_recurrence")
        .select("*")
        .eq("owner_id", user.id)
        .eq("id", b.id)
        .maybeSingle();
      if (!rule.data || rule.error)
        return json({ error: "반복 규칙 확인 필요" }, 404);
      const existing = await client
        .from(tables.runs)
        .select("title,notes")
        .eq("owner_id", user.id)
        .eq("rule_id", b.id)
        .eq("original_at", at)
        .maybeSingle();
      if (existing.error)
        return json(
          { error: "반복 실행 원장 조회 실패. SQL007을 확인해 주세요." },
          503,
        );
      // Validate the original anchor in SQL, including monthly/yearly clamping.
      const start = Date.parse(rule.data.starts_at),
        point = Date.parse(at),
        anchor = new Date(start + 9 * 3600000),
        date = new Date(point + 9 * 3600000);
      const interval = Number(rule.data.interval),
        freq = rule.data.frequency;
      const index =
        freq === "monthly" || freq === "yearly"
          ? ((date.getUTCFullYear() - anchor.getUTCFullYear()) * 12 +
              date.getUTCMonth() -
              anchor.getUTCMonth()) /
            (interval * (freq === "yearly" ? 12 : 1))
          : (point - start) /
            (interval * (freq === "weekly" ? 7 : 1) * 86400000);
      if (
        !existing.data &&
        (!Number.isInteger(index) ||
          index < 0 ||
          seoulDate(new Date(at)) > String(rule.data.until_date))
      )
        return json({ error: "유효한 반복 회차가 아닙니다." }, 400);
      const occurrence = existing.data
        ? { error: null, data: at }
        : await client.rpc("ops_recurrence_at", {
            p_start: rule.data.starts_at,
            p_frequency: freq,
            p_interval: interval,
            p_index: index,
          });
      if (
        !existing.data &&
        (occurrence.error || Date.parse(occurrence.data) !== point)
      )
        return json({ error: "유효한 반복 회차가 아닙니다." }, 400);
      const r = await client.from(tables.runs).upsert(
        {
          owner_id: user.id,
          rule_id: b.id,
          original_at: at,
          title: existing.data?.title || rule.data.title,
          status: b.status,
          notes: safeText(b.notes ?? existing.data?.notes ?? ""),
          confirmed_at:
            b.status === "completed" ? new Date().toISOString() : null,
        },
        { onConflict: "owner_id,rule_id,original_at" },
      );
      return r.error
        ? json({ error: "실행 기록 저장 실패" }, 409)
        : json({ ok: true });
    }
    return json({ error: "지원하지 않는 동작" }, 400);
  } catch (e) {
    return json(
      {
        error:
          e instanceof Error && /확인|입력|미연결/.test(e.message)
            ? e.message
            : "요청 처리 실패",
      },
      400,
    );
  }
}
export const GET = handle;
export const POST = handle;
