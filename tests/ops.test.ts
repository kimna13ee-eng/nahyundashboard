import { test } from "node:test";
import assert from "node:assert/strict";
test("업무 테스트 구분은 boolean/null만 허용하고 미전송 값은 보존", () => {
  const value = { title: "QA 일반 업무", notes: "", due_date: null, status: "pending", priority: "normal" };
  for (const is_test of [true, false, null])
    assert.equal(
      (parseResource("tasks", { ...value, is_test }) as Record<string, unknown>).is_test,
      is_test,
    );
  assert.equal(Object.hasOwn(parseResource("tasks", value), "is_test"), false);
  for (const is_test of ["false", "true", 0, {}, []])
    assert.throws(() => parseResource("tasks", { ...value, is_test }), /구분/);
});
import {
  parseResource,
  containsSecret,
  seoulDate,
  intervalSeconds,
  intervalSecondsForDay,
  scheduleOverlaps,
  longRunningInterval,
} from "../src/lib/ops.ts";
test("장기 미종료 검사는 현재 열린 구간에만 적용", () => {
  const now = Date.parse("2026-10-10T18:00:00+09:00");
  const i = {
    id: "1",
    session_id: "s",
    starts_at: "2026-10-10T10:00:00+09:00",
    ends_at: null,
  };
  assert.equal(longRunningInterval([i], "s", now)?.id, "1");
  assert.equal(longRunningInterval([i], "s", now - 1), undefined);
  assert.equal(
    longRunningInterval(
      [{ ...i, ends_at: "2026-10-10T18:00:00+09:00" }],
      "s",
      now,
    ),
    undefined,
  );
  assert.equal(longRunningInterval([i], "other", now), undefined);
  assert.equal(
    longRunningInterval([{ ...i, starts_at: "bad" }], "s", now),
    undefined,
  );
});
test("일정은 월 경계와 자정을 넘어 표시하고 종료 자정은 제외", () => {
  const s = {
    id: "cross",
    starts_at: "2026-09-30T23:30:00+09:00",
    ends_at: "2026-10-01T00:30:00+09:00",
  };
  assert.equal(scheduleOverlaps(s, "2026-10-10", "month"), true);
  assert.equal(scheduleOverlaps(s, "2026-10-01"), true);
  assert.equal(scheduleOverlaps(s, "2026-10-02"), false);
  assert.equal(scheduleOverlaps(s, "2026-09-28", "week"), true);
  assert.equal(
    scheduleOverlaps(
      { ...s, ends_at: "2026-10-01T00:00:00+09:00" },
      "2026-10-01",
    ),
    false,
  );
});
test("서울 자정 경계에서 날짜별 시간 분할과 진행 구간 제한", () => {
  const rows = [
    {
      id: "cross",
      starts_at: "2026-10-10T23:30:00+09:00",
      ends_at: "2026-10-11T00:30:00+09:00",
    },
  ];
  const now = Date.parse("2026-10-11T01:00:00+09:00");
  assert.equal(intervalSecondsForDay(rows, now, "2026-10-10"), 1800);
  assert.equal(intervalSecondsForDay(rows, now, "2026-10-11"), 1800);
  assert.equal(intervalSecondsForDay(rows, now, "2026-10-12"), 0);
  assert.equal(
    intervalSecondsForDay([{ ...rows[0], ends_at: null }], now, "2026-10-11"),
    3600,
  );
  assert.equal(intervalSecondsForDay(rows, now, "2026-10-09"), 0);
});
test("서울 날짜와 진행 구간 시간 계산", () => {
  assert.equal(seoulDate(new Date("2026-10-11T14:59:59Z")), "2026-10-11");
  assert.equal(seoulDate(new Date("2026-10-11T15:00:00Z")), "2026-10-12");
  assert.equal(seoulDate(new Date("2026-10-10T16:00:00Z")), "2026-10-11");
  assert.equal(
    intervalSeconds(
      [
        {
          id: "1",
          starts_at: "2026-10-10T00:00:00Z",
          ends_at: "2026-10-10T00:00:30Z",
        },
        { id: "2", starts_at: "2026-10-10T00:01:00Z", ends_at: null },
      ],
      Date.parse("2026-10-10T00:02:00Z"),
    ),
    90,
  );
});
test("프롬프트 원문 보존과 인증정보 검사", () => {
  const body = "  원문\n\n공백 보존  ";
  const value = parseResource("library_items", {
    title: "예시",
    kind: "prompt",
    body,
    category: "개발",
  });
  assert.equal(value.body, body);
  assert.ok(containsSecret("api_key=abcdefghijklmnop"));
  assert.ok(containsSecret("sk-proj-abcdefghijklmnopqrstuv"));
  assert.throws(() =>
    parseResource("library_items", {
      title: "예시",
      kind: "prompt",
      body: "password=secretpass1234",
      category: "개발",
    }),
  );
  assert.throws(() =>
    parseResource("library_items", {
      title: "예시",
      kind: "skill",
      body: "설명",
      url: "javascript:alert(1)",
      category: "개발",
    }),
  );
});
test("일정의 timezone과 유효한 시간 범위", () => {
  const value = parseResource("schedules", {
    title: "회의",
    starts_at: "2026-10-10T09:00:00+09:00",
    ends_at: "2026-10-10T10:00:00+09:00",
  });
  assert.equal(value.starts_at, "2026-10-10T00:00:00.000Z");
  assert.throws(() =>
    parseResource("schedules", {
      title: "회의",
      starts_at: "2026-10-10T09:00:00",
      ends_at: "2026-10-10T10:00:00",
    }),
  );
  assert.throws(() =>
    parseResource("schedules", {
      title: "회의",
      starts_at: "2026-10-10T09:00:00Z",
      ends_at: "2026-10-10T08:00:00Z",
    }),
  );
});
