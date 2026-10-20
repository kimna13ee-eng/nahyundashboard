import { NextRequest } from "next/server";
import { json, sameOrigin } from "@/lib/http";
import { personalClient, personalConfigured } from "@/lib/supabase/server";
import { parsePushEndpoint, pushFailure } from "@/lib/personal-push";
import {
  pushConfiguration,
  sendPersonalPush,
} from "@/lib/personal-push-server";

export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  if (
    req.nextUrl.searchParams.get("workspace") !== "PERSONAL" ||
    !sameOrigin(req)
  )
    return json({ error: "허용되지 않은 요청입니다." }, 403);
  const config = pushConfiguration();
  if (!config || !personalConfigured())
    return json({ error: "운동 알림의 서버 설정이 필요합니다." }, 503);
  try {
    const client = await personalClient();
    const {
      data: { user },
      error,
    } = await client.auth.getUser();
    if (error || !user)
      return json({ error: "개인 계정 로그인이 필요합니다." }, 401);
    const raw = await req.text();
    if (raw.length > 4096) return json({ error: "요청 크기 오류" }, 400);
    const endpoint = parsePushEndpoint(JSON.parse(raw).endpoint);
    const now = new Date();
    const result = await client
      .from("ops_push_subscriptions")
      .update({ last_test_at: now.toISOString() })
      .eq("owner_id", user.id)
      .eq("endpoint", endpoint)
      .eq("enabled", true)
      .or(
        `last_test_at.is.null,last_test_at.lt.${new Date(now.getTime() - 30000).toISOString()}`,
      )
      .select("id,endpoint,keys")
      .maybeSingle();
    if (result.error)
      return json({ error: "테스트 알림을 준비하지 못했습니다." }, 409);
    if (!result.data)
      return json(
        { error: "등록한 기기에서 30초 후 다시 시도해 주세요." },
        429,
      );
    try {
      const day = now.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
      await sendPersonalPush(
        result.data,
        {
          title: "운동 알림 테스트",
          body: "이 기기로 운동 알림을 받을 수 있어요.",
          tag: "exercise-test",
          data: { url: `/?view=calendar&date=${day}` },
        },
        config,
      );
      return json({
        ok: true,
        message: "푸시 서비스에 전달했습니다. 아이폰에서 수신을 확인해 주세요.",
      });
    } catch (error) {
      const failure = pushFailure(error);
      if (failure.outcome === "gone")
        await client
          .from("ops_push_subscriptions")
          .update({ enabled: false })
          .eq("id", result.data.id)
          .eq("owner_id", user.id);
      return json(
        {
          error:
            failure.outcome === "gone"
              ? "기기 구독이 만료됐습니다. 알림을 다시 켜 주세요."
              : "알림 발송에 실패했습니다. 잠시 후 다시 시도해 주세요.",
        },
        502,
      );
    }
  } catch {
    return json({ error: "알림 요청을 확인해 주세요." }, 400);
  }
}
