import { NextRequest } from "next/server";
import { personalClient, personalConfigured } from "@/lib/supabase/server";
import { json, sameOrigin } from "@/lib/http";
function validRedirect(value: string) {
  const url = new URL(value);
  return (
    url.protocol === "https:" &&
    ["chatgpt.com", "chat.openai.com"].includes(url.hostname)
  );
}
async function handle(request: NextRequest) {
  if (!personalConfigured()) return json({ error: "PERSONAL 연결 필요" }, 503);
  if (request.method === "POST" && !sameOrigin(request))
    return json({ error: "허용되지 않은 요청" }, 403);
  const id = request.nextUrl.searchParams.get("authorization_id") || "";
  if (!/^[a-zA-Z0-9_-]{1,200}$/.test(id))
    return json({ error: "인증 요청 ID 확인 필요" }, 400);
  const client = await personalClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user)
    return json(
      { error: "대시보드에서 개인 계정 로그인 후 다시 확인해 주세요." },
      401,
    );
  const details = await client.auth.oauth.getAuthorizationDetails(id);
  if (details.error || !details.data)
    return json({ error: "인증 요청을 불러오지 못했습니다." }, 400);
  if ("redirect_url" in details.data) {
    return validRedirect(details.data.redirect_url)
      ? json({ redirect_url: details.data.redirect_url })
      : json({ error: "허용되지 않은 반환 주소" }, 403);
  }
  if (
    !process.env.PERSONAL_MCP_CLIENT_ID ||
    details.data.client.id !== process.env.PERSONAL_MCP_CLIENT_ID ||
    !validRedirect(details.data.redirect_uri)
  )
    return json(
      {
        error:
          "승인된 ChatGPT 도구 연결이 아닙니다. OAuth 클라이언트 설정을 확인해 주세요.",
      },
      403,
    );
  if (request.method === "GET")
    return json({
      client: details.data.client.name,
      scope: details.data.scope,
      redirect_uri: details.data.redirect_uri,
    });
  const body = await request.json();
  if (typeof body.approve !== "boolean")
    return json({ error: "승인 선택 필요" }, 400);
  const decision = body.approve
    ? await client.auth.oauth.approveAuthorization(id, {
        skipBrowserRedirect: true,
      })
    : await client.auth.oauth.denyAuthorization(id, {
        skipBrowserRedirect: true,
      });
  if (
    decision.error ||
    !decision.data ||
    !validRedirect(decision.data.redirect_url)
  )
    return json({ error: "인증 처리 실패" }, 400);
  return json({ redirect_url: decision.data.redirect_url });
}
export const GET = handle;
export const POST = handle;
