import { NextRequest } from "next/server";
import { json, sameOrigin } from "@/lib/http";
import { frengleClient, frengleConfigured } from "@/lib/supabase/frengle";
export async function POST(req: NextRequest) {
  if (!sameOrigin(req))
    return json({ error: "허용되지 않은 요청입니다." }, 403);
  if (!frengleConfigured())
    return json({ error: "Supabase 연결 설정이 필요합니다." }, 503);
  try {
    const body = await req.json();
    const client = await frengleClient();
    if (body.action === "logout") {
      const { error } = await client.auth.signOut();
      return error
        ? json({ error: "로그아웃에 실패했습니다." }, 503)
        : json({ ok: true });
    }
    if (
      typeof body.email !== "string" ||
      typeof body.password !== "string" ||
      body.email.length > 254 ||
      body.password.length > 256
    )
      return json({ error: "이메일과 비밀번호를 확인해 주세요." }, 400);
    const { error } = await client.auth.signInWithPassword({
      email: body.email,
      password: body.password,
    });
    return error
      ? json(
          { error: "로그인에 실패했습니다. 계정 정보를 확인해 주세요." },
          401,
        )
      : json({ ok: true });
  } catch {
    return json({ error: "로그인 요청을 처리하지 못했습니다." }, 400);
  }
}
