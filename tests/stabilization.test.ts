import { test } from "node:test";
import assert from "node:assert/strict";
import { quickStartContext } from "../src/lib/quick-start.ts";
import { isVerificationRecord } from "../src/lib/content-analytics.ts";
import { contentCalendar } from "../src/lib/personal-content.ts";
import { seoulDate } from "../src/lib/ops.ts";

test("명시적 테스트 구분 우선, 미분류 기존 제목 폴백", () => {
  assert.equal(
    isVerificationRecord({ id: "1", title: "제목 변경", is_test: true }),
    true,
  );
  assert.equal(
    isVerificationRecord({
      id: "2",
      title: "[QA 테스트] 실제 업무",
      is_test: false,
    }),
    false,
  );
  assert.equal(
    isVerificationRecord({ id: "3", title: "[QA 테스트] 검증", is_test: null }),
    true,
  );
  assert.equal(isVerificationRecord({ id: "4", title: "QA 검수" }), false);
});
test("Quick Start는 저장된 스냅샷과 최근 특이사항을 표시하고 링크 프로토콜을 제한", () => {
  const c = quickStartContext(
    { id: "t", result_url: "https://example.com/result" },
    { id: "s" },
    [
      {
        id: "n",
        task_id: "t",
        kind: "issue",
        body: "실제 기록",
        updated_at: "2026-10-11",
      },
    ],
    [],
    [
      {
        id: "c",
        session_id: "s",
        created_at: "2026-10-11",
        payload: {
          next_action: "확인",
          next_actions: [{ body: "확인" }, { body: "수정" }],
          paused_at: "2026-10-10T17:25:00Z",
          reason: "요청",
          last_note: "원문",
          last_file: "javascript:alert(1)",
        },
      },
    ],
  );
  assert.deepEqual(c.next, ["확인", "수정"]);
  assert.equal(c.parkedAt, "2026-10-10T17:25:00Z");
  assert.equal(c.reason, "요청");
  assert.equal(c.issue, "실제 기록");
  assert.equal(c.resultUrl, "https://example.com/result");
  const empty = quickStartContext({ id: "t" }, { id: "s" }, [], [], []);
  assert.deepEqual(empty.next, []);
  assert.equal(empty.reason, "");
  assert.equal(empty.parkedAt, "");
});
test("Calendar 예정/실제 분리; 실제 서울 02:25 기준 24/72/168시간", () => {
  const content = {
    id: "c",
    title: "검증",
    publish_at: "2026-10-10T12:00:00+09:00",
    personal_details: {
      published_at: "2026-10-11T02:25:00+09:00",
      performance_checks: [24, 72, 168],
    },
  };
  const events = contentCalendar([content]);
  assert.equal(events.length, 5);
  assert.equal(
    events.find((e) => e.id === "publish-c")?.starts_at,
    content.publish_at,
  );
  assert.equal(
    events.find((e) => e.id === "actual-publish-c")?.starts_at,
    content.personal_details.published_at,
  );
  for (const [h, day] of [
    [24, "2026-10-12"],
    [72, "2026-10-14"],
    [168, "2026-10-18"],
  ] as const) {
    const at = String(events.find((e) => e.id === `check-${h}-c`)?.starts_at);
    assert.equal(
      Date.parse(at) - Date.parse(content.personal_details.published_at),
      h * 3600000,
    );
    assert.equal(seoulDate(new Date(at)), day);
    assert.equal(
      new Date(Date.parse(at) + 9 * 3600000).toISOString().slice(11, 16),
      "02:25",
    );
  }
  const changed = contentCalendar([
    { ...content, publish_at: "2026-12-01T10:00:00+09:00" },
  ]);
  assert.equal(
    changed.find((e) => e.id === "check-24-c")?.starts_at,
    events.find((e) => e.id === "check-24-c")?.starts_at,
  );
  assert.equal(
    contentCalendar([
      {
        id: "empty",
        personal_details: { published_at: "invalid", performance_checks: [24] },
      },
    ]).length,
    0,
  );
});
