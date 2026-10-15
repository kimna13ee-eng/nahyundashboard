import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
export function frengleConfigured() {
  return Boolean(
    process.env.FRENGLE_SUPABASE_URL &&
      process.env.FRENGLE_SUPABASE_PUBLISHABLE_KEY,
  );
}
export async function frengleClient() {
  if (!frengleConfigured())
    throw new Error("FRENGLE Supabase 연결 설정이 필요합니다.");
  const jar = await cookies();
  return createServerClient(
    process.env.FRENGLE_SUPABASE_URL!,
    process.env.FRENGLE_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookieOptions: {
        name: "my-ops-frengle-auth",
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      },
      cookies: {
        getAll: () => jar.getAll(),
        setAll: (values) => {
          values.forEach(({ name, value, options }) =>
            jar.set(name, value, options),
          );
        },
      },
    },
  );
}
