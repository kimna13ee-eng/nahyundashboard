import { NextRequest } from "next/server";
import { json, sameOrigin } from "@/lib/http";
import { personalClient, personalConfigured } from "@/lib/supabase/server";
import { parsePushEndpoint, parsePushSubscription } from "@/lib/personal-push";
import { pushAdmin, pushConfigurationState } from "@/lib/personal-push-server";

export const runtime = "nodejs";
async function handle(req: NextRequest) {
  if (req.nextUrl.searchParams.get("workspace") !== "PERSONAL")
    return json({ error: "PERSONAL에서만 사용할 수 있습니다." }, 403);
  if (req.method !== "GET" && !sameOrigin(req))
    return json({ error: "허용되지 않은 요청입니다." }, 403);
  if (!personalConfigured())
    return json({ error: "개인 저장소 연결이 필요합니다." }, 503);
  try {
    const client = await personalClient();
    const {
      data: { user },
      error,
    } = await client.auth.getUser();
    if (error || !user)
      return json({ error: "개인 계정 로그인이 필요합니다." }, 401);
    const { config, checks } = pushConfigurationState();
    if (req.method === "GET") {
      const result = await client
        .from("ops_push_subscriptions")
        .select("id,endpoint")
        .eq("owner_id", user.id)
        .eq("enabled", true)
        .limit(100);
      const ready = Boolean(config && !result.error);
      const scheduler = ready
        ? await pushAdmin(config!).rpc("ops_exercise_push_scheduler_ready")
        : null;
      return json({
        ready,
        scheduled: Boolean(
          scheduler && !scheduler.error && scheduler.data === true,
        ),
        publicKey: ready ? config!.publicKey : null,
        subscriptions: result.error ? [] : result.data,
        setup: ready ? undefined : { storageReady: !result.error, checks },
        message: ready
          ? null
          : "운동 알림의 서버 설정을 준비 중입니다. 날짜별 영상은 먼저 저장할 수 있어요.",
      });
    }
    const raw = await req.text();
    if (raw.length > 8192)
      return json({ error: "요청 크기를 확인해 주세요." }, 400);
    const body = JSON.parse(raw);
    if (req.method === "DELETE") {
      const endpoint = parsePushEndpoint(body.endpoint);
      const result = await client
        .from("ops_push_subscriptions")
        .delete()
        .eq("owner_id", user.id)
        .eq("endpoint", endpoint);
      return result.error
        ? json({ error: "알림 해제에 실패했습니다." }, 409)
        : json({ ok: true });
    }
    if (!config)
      return json({ error: "운동 알림의 서버 설정이 필요합니다." }, 503);
    const subscription = parsePushSubscription(body.subscription);
    const existing = await client
      .from("ops_push_subscriptions")
      .select("id")
      .eq("owner_id", user.id)
      .eq("endpoint", subscription.endpoint)
      .maybeSingle();
    if (existing.error)
      return json({ error: "알림 저장소를 확인해 주세요." }, 503);
    const query = existing.data
      ? client
          .from("ops_push_subscriptions")
          .update({ keys: subscription.keys, enabled: true })
          .eq("owner_id", user.id)
          .eq("id", existing.data.id)
      : client
          .from("ops_push_subscriptions")
          .insert({ ...subscription, owner_id: user.id, enabled: true });
    const result = await query.select("id").single();
    return result.error
      ? json(
          {
            error:
              "알림 등록에 실패했습니다. 이 기기의 구독을 다시 연결해 주세요.",
          },
          409,
        )
      : json({ ok: true, id: result.data.id });
  } catch {
    return json({ error: "알림 요청을 확인해 주세요." }, 400);
  }
}
export const GET = handle;
export const POST = handle;
export const DELETE = handle;
