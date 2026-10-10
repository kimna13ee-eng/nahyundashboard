import { personalClient, personalConfigured } from "@/lib/supabase/server";
import { json } from "@/lib/http";
export async function GET() {
  if (!personalConfigured()) return json({configured:false,user:null});
  try {
    const client = await personalClient();
    const {data:{user},error} = await client.auth.getUser();
    if (error && error.name !== "AuthSessionMissingError") return json({error:"인증 서버 연결을 확인해 주세요."},503);
    return json({configured:true,user:user ? {email:user.email} : null});
  } catch { return json({error:"인증 연결을 확인해 주세요."},503); }
}
