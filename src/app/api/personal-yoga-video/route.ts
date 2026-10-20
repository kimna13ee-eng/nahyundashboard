import { NextRequest } from "next/server";
import { json, sameOrigin } from "@/lib/http";
import { personalClient, personalConfigured } from "@/lib/supabase/server";
import { fetchYogaVideoTitle, YogaVideoError } from "@/lib/yoga-video";

export const runtime = "nodejs";
const requestLimit = 4096;

async function videoInput(request: NextRequest) {
  if (
    !request.body ||
    Number(request.headers.get("content-length")) > requestLimit
  )
    throw new YogaVideoError("영상 URL 입력 크기를 확인해 주세요.", 413);
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let body = "";
  let bytes = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > requestLimit)
        throw new YogaVideoError("영상 URL 입력 크기를 확인해 주세요.", 413);
      body += decoder.decode(part.value, { stream: true });
    }
    body += decoder.decode();
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
  const value: unknown = JSON.parse(body);
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => key !== "url")
  )
    throw new YogaVideoError("영상 URL 입력을 확인해 주세요.", 400);
  return (value as Record<string, unknown>).url;
}

export async function POST(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  if (
    !sameOrigin(request) ||
    params.getAll("workspace").length !== 1 ||
    params.get("workspace") !== "PERSONAL"
  )
    return json(
      { error: "개인 공간에서만 영상 제목을 확인할 수 있습니다." },
      403,
    );
  if ([...params.keys()].some((key) => key !== "workspace"))
    return json({ error: "영상 제목 조회 요청을 확인해 주세요." }, 400);
  if (!personalConfigured())
    return json({ error: "PERSONAL 연결이 필요합니다." }, 503);
  try {
    const client = await personalClient();
    const {
      data: { user },
      error,
    } = await client.auth.getUser();
    if (error || !user)
      return json({ error: "개인 계정 로그인이 필요합니다." }, 401);
  } catch {
    return json({ error: "개인 계정 연결을 확인하지 못했습니다." }, 503);
  }
  try {
    return json(await fetchYogaVideoTitle(await videoInput(request)));
  } catch (error) {
    if (error instanceof YogaVideoError)
      return json({ error: error.message }, error.status);
    return json({ error: "영상 URL 입력을 확인해 주세요." }, 400);
  }
}
