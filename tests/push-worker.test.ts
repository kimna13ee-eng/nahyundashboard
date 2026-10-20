import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createContext, runInContext } from "node:vm";

const script = await readFile(
  new URL("../public/sw.js", import.meta.url),
  "utf8",
);
const origin = "https://my-ops.example";
const schedule = "11111111-1111-4111-8111-111111111111";
const target = `/?view=calendar&date=2026-10-20&schedule=${schedule}`;
type WorkerEvent = {
  data?: { json: () => unknown };
  notification?: { data?: { url?: unknown }; close: () => void };
  waitUntil: (promise: Promise<unknown>) => void;
};
type WindowClient = {
  url: string;
  focused: number;
  navigations: string[];
  navigate?: (url: string) => Promise<WindowClient | null>;
  focus: () => Promise<WindowClient>;
};
function windowClient(url: string): WindowClient {
  return {
    url,
    focused: 0,
    navigations: [],
    async navigate(next) {
      this.navigations.push(next);
      this.url = next;
      return this;
    },
    async focus() {
      this.focused++;
      return this;
    },
  };
}
function worker(windows: WindowClient[] = []) {
  const handlers = new Map<string, (event: WorkerEvent) => void>();
  const notifications: Array<{
    title: string;
    options: Record<string, unknown>;
  }> = [];
  const opened: string[] = [];
  let skipped = 0,
    claimed = 0,
    matched = 0;
  const scope = {
    location: { origin },
    addEventListener: (name: string, callback: (event: WorkerEvent) => void) =>
      handlers.set(name, callback),
    async skipWaiting() {
      skipped++;
    },
    registration: {
      async showNotification(title: string, options: Record<string, unknown>) {
        notifications.push({
          title,
          options: JSON.parse(JSON.stringify(options)),
        });
      },
    },
    clients: {
      async claim() {
        claimed++;
      },
      async matchAll(options: { type: string; includeUncontrolled: boolean }) {
        assert.equal(options.type, "window");
        assert.equal(options.includeUncontrolled, true);
        matched++;
        return windows;
      },
      async openWindow(url: string) {
        opened.push(url);
        return null;
      },
    },
  };
  runInContext(script, createContext({ self: scope, URL, Date }));
  async function emit(
    name: string,
    values: Omit<WorkerEvent, "waitUntil"> = {},
  ) {
    const pending: Promise<unknown>[] = [];
    handlers.get(name)?.({
      ...values,
      waitUntil: (promise) => pending.push(promise),
    });
    await Promise.all(pending);
  }
  async function push(payload: unknown) {
    await emit("push", { data: { json: () => payload } });
  }
  async function click(url: unknown) {
    let closed = false;
    await emit("notificationclick", {
      notification: {
        data: { url },
        close: () => {
          closed = true;
        },
      },
    });
    assert.equal(closed, true);
  }
  return {
    emit,
    push,
    click,
    notifications,
    opened,
    handlers,
    stats: () => ({ skipped, claimed, matched }),
  };
}

test("푸시 worker는 설치 즉시 적용·탭 제어하며 캐시/fetch handler는 등록하지 않음", async () => {
  const scope = worker();
  await scope.emit("install");
  await scope.emit("activate");
  assert.deepEqual(scope.stats(), { skipped: 1, claimed: 1, matched: 0 });
  assert.deepEqual(
    [...scope.handlers.keys()],
    ["install", "activate", "push", "notificationclick"],
  );
});

test("운동 푸시는 개인정보 없는 고정 문구·아이콘·고유 태그·내부URL만 보관", async () => {
  const scope = worker();
  await scope.push({
    title: "개인 운동 제목",
    body: "계정별 민감한 메모",
    tag: "외부 값",
    data: {
      url: target,
      video_url: "https://youtube.com/private",
      schedule_id: schedule,
      date: "2026-10-20",
      email: "private@example.com",
    },
  });
  assert.equal(scope.notifications.length, 1);
  assert.deepEqual(scope.notifications[0], {
    title: "운동할 시간이에요",
    options: {
      body: "오늘의 운동 영상을 확인하세요",
      icon: "/icons/my-ops-192.png",
      badge: "/icons/my-ops-192.png",
      tag: `my-ops-exercise:${schedule}:2026-10-20`,
      data: { url: target },
    },
  });
  await scope.push({
    data: { url: target.replace("2026-10-20", "2026-10-21") },
  });
  assert.notEqual(
    scope.notifications[0].options.tag,
    scope.notifications[1].options.tag,
  );
  await scope.push({ data: { url: origin + target } });
  assert.equal(
    scope.notifications[2].options.tag,
    scope.notifications[0].options.tag,
  );
});

test("불량 JSON·빈 push·잘못된 목적지로 예외나 알림을 만들지 않음", async () => {
  const scope = worker();
  await scope.emit("push");
  await scope.emit("push", {
    data: {
      json: () => {
        throw new SyntaxError("bad json");
      },
    },
  });
  for (const payload of [null, [], "text", {}, { data: {} }])
    await scope.push(payload);
  for (const url of [
    "https://evil.example" + target,
    "//evil.example" + target,
    "javascript:alert(1)",
    "/frengle",
    "/?view=calendar",
    target + "&next=https://evil.example",
    target + "&date=2026-10-21",
    target + "#extra",
    target.replace("2026-10-20", "2026-02-30"),
    target.replace(schedule, "bad-id"),
    "https://user:secret@my-ops.example" + target,
  ]) {
    await scope.push({ data: { url } });
  }
  assert.equal(scope.notifications.length, 0);
});

test("테스트 푸시는 일정ID 없는 날짜 캘린더 링크로 표시하고 열 수 있음", async () => {
  const scope = worker();
  const testTarget = "/?view=calendar&date=2026-10-20";
  await scope.push({
    title: "운동 알림 테스트",
    tag: "exercise-test",
    data: { url: testTarget },
  });
  assert.equal(scope.notifications.length, 1);
  assert.equal(
    scope.notifications[0].options.tag,
    "my-ops-exercise:test:2026-10-20",
  );
  assert.deepEqual(scope.notifications[0].options.data, { url: testTarget });
  await scope.click(testTarget);
  assert.deepEqual(scope.opened, [origin + testTarget]);
});

test("알림 클릭은 같은 origin 탭만 이동·집중하고 외부 탭에는 접근하지 않음", async () => {
  const foreign = windowClient("https://foreign.example/");
  const own = windowClient(origin + "/?view=overview");
  const scope = worker([foreign, own]);
  await scope.click(target);
  assert.deepEqual(own.navigations, [origin + target]);
  assert.equal(own.focused, 1);
  assert.deepEqual(foreign.navigations, []);
  assert.equal(foreign.focused, 0);
  assert.deepEqual(scope.opened, []);
});

test("같은 origin 창이 없으면 내부URL 새 창을 열고 외부 클릭URL은 거절", async () => {
  const foreign = windowClient("https://foreign.example/");
  const scope = worker([foreign]);
  await scope.click(target);
  assert.deepEqual(scope.opened, [origin + target]);
  for (const url of [
    "https://foreign.example" + target,
    "//foreign.example" + target,
    "/?view=calendar",
    undefined,
  ])
    await scope.click(url);
  assert.deepEqual(scope.opened, [origin + target]);
  assert.equal(scope.stats().matched, 1);
  assert.equal(foreign.focused, 0);
});

test("닫힌 탭 이동 실패는 같은 origin 새 창으로 복구", async () => {
  const own = windowClient(origin + "/");
  own.navigate = async () => {
    throw new Error("closed");
  };
  const scope = worker([own]);
  await scope.click(target);
  assert.deepEqual(scope.opened, [origin + target]);
  assert.equal(own.focused, 0);
});
