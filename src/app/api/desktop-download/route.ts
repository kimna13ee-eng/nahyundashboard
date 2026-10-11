import { validDesktopInstaller } from "@/lib/desktop-integrity";
import { NextRequest } from "next/server";
import { personalClient, personalConfigured } from "@/lib/supabase/server";
import { json, sameOrigin } from "@/lib/http";
import { desktopAccess, desktopArtifact } from "@/lib/desktop-artifact";

export const runtime = "nodejs";
async function handle(request: NextRequest) {
  if (request.method === "POST" && !sameOrigin(request))
    return json({ error: "허용되지 않은 요청입니다." }, 403);
  if (!personalConfigured())
    return json(
      { ready: false, error: "PERSONAL 연결 설정이 필요합니다." },
      503,
    );
  try {
    const client = await personalClient();
    const {
      data: { user },
      error,
    } = await client.auth.getUser();
    const status = desktopAccess(
      error ? null : (user?.id ?? null),
      process.env.MYOPS_DESKTOP_ALLOWED_USER_ID,
      process.env.MYOPS_DESKTOP_DOWNLOAD_ENABLED,
    );
    if (status !== 200)
      return json(
        {
          ready: false,
          error:
            status === 401
              ? "개인 계정 로그인이 필요합니다."
              : status === 403
                ? "다운로드 권한이 없습니다."
                : "Windows 다운로드 준비 중입니다.",
        },
        status,
      );
    // The existing user session and Storage RLS remain the authorization boundary.
    const { data, error: storageError } = await client.storage
      .from(desktopArtifact.bucket)
      .download(desktopArtifact.object);
    if (storageError || !data)
      return json(
        {
          ready: false,
          error: "설치 파일을 확인하지 못했습니다. 잠시 후 다시 확인해 주세요.",
        },
        503,
      );
    if (data.size !== desktopArtifact.bytes)
      return json(
        { ready: false, error: "설치 파일 무결성 확인에 실패했습니다." },
        503,
      );
    const bytes = Buffer.from(await data.arrayBuffer());
    if (!validDesktopInstaller(bytes))
      return json(
        { ready: false, error: "설치 파일 무결성 확인에 실패했습니다." },
        503,
      );
    if (request.method === "GET")
      return json({ ready: true, artifact: desktopArtifact });
    return new Response(bytes, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="MY-OPS-2.1.0-x64-setup.exe"; filename*=UTF-8''${encodeURIComponent(desktopArtifact.filename)}`,
        "Content-Length": String(bytes.length),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Artifact-SHA256": desktopArtifact.sha256,
      },
    });
  } catch {
    return json(
      {
        ready: false,
        error: "다운로드 연결을 확인하지 못했습니다. 다시 시도해 주세요.",
      },
      503,
    );
  }
}
export const GET = handle;
export const POST = handle;
