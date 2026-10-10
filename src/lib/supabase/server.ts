import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
export function personalConfigured() { return Boolean(process.env.PERSONAL_SUPABASE_URL && process.env.PERSONAL_SUPABASE_PUBLISHABLE_KEY); }
export async function personalClient() {
  if (!personalConfigured()) throw new Error("PERSONAL Supabase 연결 설정이 필요합니다.");
  const jar = await cookies();
  return createServerClient(process.env.PERSONAL_SUPABASE_URL!, process.env.PERSONAL_SUPABASE_PUBLISHABLE_KEY!, {
    cookieOptions: { name: "my-ops-personal-auth", sameSite: "lax", secure: process.env.NODE_ENV === "production" },
    cookies: { getAll: () => jar.getAll(), setAll: values => { values.forEach(({name,value,options}) => jar.set(name,value,options)); } }
  });
}
