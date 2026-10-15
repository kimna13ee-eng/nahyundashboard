import { frengleClient, frengleConfigured } from "@/lib/supabase/frengle";
import { json } from "@/lib/http";
export async function GET() {
  if (!frengleConfigured()) return json({ configured: false, user: null });
  try {
    const client = await frengleClient();
    const {
      data: { user },
      error,
    } = await client.auth.getUser();
    if (error && error.name !== "AuthSessionMissingError")
      return json({ error: "인증 서버 연결을 확인해 주세요." }, 503);
    return json({
      configured: true,
      user: user ? { email: user.email } : null,
    });
  } catch {
    return json({ error: "인증 연결을 확인해 주세요." }, 503);
  }
}
