import { frengleClient, frengleConfigured } from "@/lib/supabase/frengle";
import { json } from "@/lib/http";
export async function GET() {
  if (!frengleConfigured()) return json({ ready: false, results: [] }, 503);
  const client = await frengleClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user) return json({ error: "회사 계정 로그인 필요" }, 401);
  const member = await client
    .from("ops_company_members")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (member.error || !member.data)
    return json({ error: "FRENGLE 사용자 권한이 필요합니다." }, 403);
  const result = await client
    .from("ops_automation_results")
    .select("*")
    .eq("owner_id", user.id)
    .order("received_at", { ascending: false })
    .limit(100);
  if (result.error)
    return json(
      {
        ready: false,
        results: [],
        error: "자동화 결과 저장소 연결이 필요합니다.",
      },
      503,
    );
  return json({ ready: true, results: result.data });
}
