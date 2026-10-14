import { personalClient, personalConfigured } from "@/lib/supabase/server";
import { json } from "@/lib/http";
export async function GET() {
  if (!personalConfigured()) return json({ ready: false, results: [] }, 503);
  const client = await personalClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user) return json({ error: "개인 계정 로그인 필요" }, 401);
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
