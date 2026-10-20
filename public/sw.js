/* Exercise reminders only. This worker does not intercept or cache requests. */
const EXERCISE_TITLE = "운동할 시간이에요";
const EXERCISE_BODY = "오늘의 운동 영상을 확인하세요";
const APP_ICON = "/icons/my-ops-192.png";

function calendarTarget(raw) {
  if (typeof raw !== "string" || raw.length > 1000) return null;
  try {
    const url = new URL(raw, self.location.origin);
    if (
      url.origin !== self.location.origin ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.hash ||
      url.searchParams.get("view") !== "calendar" ||
      [...url.searchParams.keys()].some(
        (key) => !["view", "date", "schedule"].includes(key),
      ) ||
      url.searchParams.getAll("schedule").length > 1 ||
      ["view", "date"].some((key) => url.searchParams.getAll(key).length !== 1)
    )
      return null;
    const date = url.searchParams.get("date");
    const schedule = url.searchParams.get("schedule");
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date || "") ||
      (schedule !== null &&
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          schedule,
        ))
    )
      return null;
    const day = new Date(`${date}T00:00:00Z`);
    if (
      !Number.isFinite(day.getTime()) ||
      day.toISOString().slice(0, 10) !== date
    )
      return null;
    const relative = `/?view=calendar&date=${date}${schedule ? `&schedule=${schedule}` : ""}`;
    return {
      relative,
      absolute: self.location.origin + relative,
      tag: `my-ops-exercise:${schedule || "test"}:${date}`,
    };
  } catch {
    return null;
  }
}

function sameOriginClient(client) {
  try {
    return new URL(client.url).origin === self.location.origin;
  } catch {
    return false;
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload;
  try {
    payload = event.data?.json();
  } catch {
    return;
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return;
  const target = calendarTarget(payload.data?.url);
  if (!target) return;
  event.waitUntil(
    self.registration.showNotification(EXERCISE_TITLE, {
      body: EXERCISE_BODY,
      icon: APP_ICON,
      badge: APP_ICON,
      tag: target.tag,
      // Do not retain exercise titles, account details, or external video URLs.
      data: { url: target.relative },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = calendarTarget(event.notification.data?.url);
  if (!target) return;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of windows) {
        if (!sameOriginClient(client)) continue;
        try {
          if (typeof client.navigate === "function") {
            const navigated = await client.navigate(target.absolute);
            if (navigated && sameOriginClient(navigated)) {
              await navigated.focus();
              return;
            }
          } else if (client.url === target.absolute) {
            await client.focus();
            return;
          }
        } catch {
          // A tab may have closed while the notification was being opened.
        }
      }
      await self.clients.openWindow(target.absolute);
    })().catch(() => {
      // The OS may deny window creation after the originating tab is closed.
    }),
  );
});
