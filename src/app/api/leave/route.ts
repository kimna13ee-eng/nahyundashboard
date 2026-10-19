import { NextRequest } from "next/server";
import { json, sameOrigin } from "@/lib/http";
import { personalClient, personalConfigured } from "@/lib/supabase/server";
import {
  calculateLeave,
  parseLeaveProfile,
  parseLeaveUsage,
  seoulToday,
  type LeaveEntry,
} from "@/lib/leave";

async function handle(req: NextRequest) {
  if (
    !["PERSONAL", "ALL"].includes(
      req.nextUrl.searchParams.get("workspace") || "",
    )
  )
    return json({ error: "연차는 PERSONAL에서 관리합니다." }, 403);
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
      const setting = await client
        .from("ops_leave_settings")
        .select("hire_date,prior_used,prior_used_date")
        .eq("owner_id", user.id)
        .maybeSingle();
      if (setting.error)
        return json(
          {
            error: "연차 설정 SQL 015 적용과 권한을 확인해 주세요.",
            migrationRequired: ["PGRST205", "42P01"].includes(
              setting.error.code,
            ),
          },
          503,
        );
      const entries: LeaveEntry[] = [];
      // Supabase limits a single response to 1,000 rows by default. Read every
      // page so old grants and usage cannot silently drop out of the balance.
      for (let start = 0; ; start += 1000) {
        const page = await client
          .from("ops_leave_entries")
          .select("id,title,date,kind,amount,created_at")
          .eq("owner_id", user.id)
          .order("date", { ascending: true })
          .order("id", { ascending: true })
          .range(start, start + 999);
        if (page.error)
          return json({ error: "연차 기록을 불러오지 못했습니다." }, 503);
        entries.push(...((page.data || []) as LeaveEntry[]));
        if ((page.data?.length || 0) < 1000) break;
      }
      const profile = setting.data
        ? parseLeaveProfile({
            ...setting.data,
            prior_used: Number(setting.data.prior_used),
          })
        : null;
      const asOf = seoulToday();
      return json({
        profile,
        entries,
        asOf,
        calculation: profile ? calculateLeave(profile, entries, asOf) : null,
      });
    }
    const body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body))
      return json({ error: "연차 입력값을 확인해 주세요." }, 400);
    if (body.action === "profile") {
      const value = parseLeaveProfile(body.value);
      const result = await client
        .from("ops_leave_settings")
        .upsert({ ...value, owner_id: user.id }, { onConflict: "owner_id" })
        .select("hire_date,prior_used,prior_used_date")
        .single();
      return result.error
        ? json(
            {
              error:
                "연차 설정 저장 실패. SQL 015 적용과 권한을 확인해 주세요.",
            },
            409,
          )
        : json({ profile: result.data });
    }
    if (req.method === "POST" && body.action === "usage") {
      const setting = await client
        .from("ops_leave_settings")
        .select("hire_date,prior_used,prior_used_date")
        .eq("owner_id", user.id)
        .maybeSingle();
      if (setting.error)
        return json(
          {
            error:
              "연차 설정을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
          },
          503,
        );
      if (!setting.data)
        return json({ error: "입사일과 연차 설정을 먼저 저장해 주세요." }, 409);
      const profile = parseLeaveProfile({
        ...setting.data,
        prior_used: Number(setting.data.prior_used),
      });
      const value = parseLeaveUsage(body.value, profile.hire_date);
      const result = await client
        .from("ops_leave_entries")
        .insert({ ...value, owner_id: user.id })
        .select("*")
        .single();
      return result.error
        ? json({ error: "연차 사용 기록을 저장하지 못했습니다." }, 409)
        : json({ row: result.data }, 201);
    }
    return json({ error: "연차 요청을 확인해 주세요." }, 400);
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error && /연차|입사일/.test(error.message)
            ? error.message
            : "연차 요청을 처리하지 못했습니다.",
      },
      400,
    );
  }
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
