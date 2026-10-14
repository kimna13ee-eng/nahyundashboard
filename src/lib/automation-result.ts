import { containsSecret } from "./ops.ts";
export function parseAutomationResult(raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("결과 입력을 확인해 주세요.");
  const v = raw as Record<string, unknown>;
  if (v.source !== "metricool_personal")
    throw new Error("FRENGLE 결과는 개인 저장소에 저장할 수 없습니다.");
  function text(key: string, max: number) {
    const value = v[key];
    if (
      typeof value !== "string" ||
      !value.trim() ||
      value.length > max ||
      containsSecret(value)
    )
      throw new Error("결과 길이와 비밀정보를 확인해 주세요.");
    return value;
  }
  const run_key = text("run_key", 160),
    title = text("title", 120),
    body = text("body", 50000);
  const source_url = text("source_url", 2000);
  const url = new URL(source_url);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "chatgpt.com" ||
    !/^\/(c\/[^/]+|scheduled)$/.test(url.pathname)
  )
    throw new Error("ChatGPT 원본 주소를 확인해 주세요.");
  const reported = v.reported_at;
  if (
    typeof reported !== "string" ||
    !/(Z|[+-]\d{2}:\d{2})$/.test(reported) ||
    !Number.isFinite(Date.parse(reported))
  )
    throw new Error("실행 시각을 확인해 주세요.");
  return {
    source: "metricool_personal",
    run_key,
    title,
    body,
    source_url,
    reported_at: new Date(reported).toISOString(),
  };
}
