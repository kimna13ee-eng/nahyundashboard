export type StoredPushSubscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

export function parsePushEndpoint(raw: unknown): string {
  if (typeof raw !== "string" || raw.length > 2048)
    throw new Error("알림 주소를 확인해 주세요.");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("알림 주소를 확인해 주세요.");
  }
  const allowed =
    url.hostname === "fcm.googleapis.com" ||
    url.hostname === "updates.push.services.mozilla.com" ||
    /^[a-z0-9-]+\.push\.apple\.com$/.test(url.hostname);
  if (
    !allowed ||
    url.protocol !== "https:" ||
    url.port ||
    url.username ||
    url.password ||
    url.hash ||
    url.pathname === "/" ||
    /[\u0000-\u0020\u007f]/.test(raw)
  )
    throw new Error("지원되는 브라우저의 알림 주소가 필요합니다.");
  return url.href;
}

function pushKey(raw: unknown, length: number) {
  if (typeof raw !== "string" || !/^[A-Za-z0-9_-]+$/.test(raw))
    throw new Error("알림 인증정보를 확인해 주세요.");
  const decoded = Buffer.from(raw, "base64url");
  if (decoded.length !== length || decoded.toString("base64url") !== raw)
    throw new Error("알림 인증정보를 확인해 주세요.");
  return raw;
}

export function parsePushSubscription(raw: unknown): StoredPushSubscription {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("알림 구독을 확인해 주세요.");
  const value = raw as Record<string, unknown>;
  const keys = value.keys as Record<string, unknown> | undefined;
  if (!keys || typeof keys !== "object" || Array.isArray(keys))
    throw new Error("알림 인증정보를 확인해 주세요.");
  const p256dh = pushKey(keys.p256dh, 65);
  if (Buffer.from(p256dh, "base64url")[0] !== 4)
    throw new Error("알림 인증정보를 확인해 주세요.");
  return {
    endpoint: parsePushEndpoint(value.endpoint),
    keys: { p256dh, auth: pushKey(keys.auth, 16) },
  };
}

export function exercisePushPayload(scheduleId: string, day: string) {
  if (
    !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(scheduleId) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(day)
  )
    throw new Error("알림 일정 오류");
  return {
    title: "운동할 시간이에요",
    body: "오늘의 운동 영상을 확인하세요.",
    tag: `exercise-${scheduleId}-${day}`,
    data: { url: `/?view=calendar&date=${day}&schedule=${scheduleId}` },
  };
}

export function pushFailure(error: unknown): {
  outcome: "gone" | "retry" | "failed";
  status: number | null;
} {
  const status = Number((error as { statusCode?: unknown } | null)?.statusCode);
  if (status === 404 || status === 410) return { outcome: "gone", status };
  if (
    !Number.isInteger(status) ||
    status === 408 ||
    status === 429 ||
    status >= 500
  )
    return {
      outcome: "retry",
      status: Number.isInteger(status) ? status : null,
    };
  return { outcome: "failed", status };
}
