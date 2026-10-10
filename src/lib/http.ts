import { NextRequest, NextResponse } from "next/server";
export function json(data: unknown, status = 200) { return NextResponse.json(data, {status,headers:{"Cache-Control":"no-store"}}); }
export function sameOrigin(request: NextRequest) {
  // Next.js가 로컬 서버의 내부 URL을 localhost로 정규화할 수 있으므로
  // 실제 요청 Host와 비교합니다. 클라이언트 임의의 forwarded-host는 사용하지 않습니다.
  const host = request.headers.get("host");
  const origin = request.headers.get("origin");
  return Boolean(host && origin && origin === `${request.nextUrl.protocol}//${host}`);
}
