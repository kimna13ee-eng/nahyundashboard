import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePhase2, occurrences, recurrenceAt } from "../src/lib/phase2.ts";
test("보관된 반복 규칙과 이동한 예외는 숨기고 복원 시 원본 회차를 유지", () => {
  const rule = {
    id: "archive-rule",
    title: "반복",
    starts_at: "2026-10-14T09:00:00+09:00",
    ends_at: "2026-10-14T10:00:00+09:00",
    frequency: "daily",
    interval: 1,
    until_date: "2026-10-16",
    archived_at: null,
  };
  const exceptions = [
    {
      id: "exception",
      rule_id: rule.id,
      original_at: rule.starts_at,
      starts_at: "2026-10-14T11:00:00+09:00",
      ends_at: "2026-10-14T12:00:00+09:00",
      cancelled: false,
    },
  ];
  const original = occurrences([rule], exceptions, "2026-10-14", "2026-10-17");
  assert.equal(original.length, 3);
  assert.equal(
    occurrences(
      [{ ...rule, archived_at: "2026-10-14T00:00:00Z" }],
      exceptions,
      "2026-10-14",
      "2026-10-17",
    ).length,
    0,
  );
  assert.deepEqual(
    occurrences(
      [{ ...rule, archived_at: null }],
      exceptions,
      "2026-10-14",
      "2026-10-17",
    ),
    original,
  );
  assert.equal(exceptions.length, 1);
});
test("운영 입력 검증과 개인 반차 원장", () => {
  assert.equal(
    parsePhase2("leave", {
      title: "반차",
      date: "2026-10-10",
      kind: "use",
      amount: -0.5,
    }).amount,
    -0.5,
  );
  assert.throws(() =>
    parsePhase2("leave", {
      title: "반차",
      date: "2026-10-10",
      kind: "use",
      amount: 0.5,
    }),
  );
  assert.throws(() =>
    parsePhase2("leave", {
      title: "조정",
      date: "2026-10-10",
      kind: "adjust",
      amount: 0.3,
    }),
  );
  assert.throws(() =>
    parsePhase2("inspiration", {
      title: "URL",
      url: "javascript:alert(1)",
      category: "개발",
    }),
  );
  assert.throws(() =>
    parsePhase2("inspiration", {
      title: "secret",
      notes: "password=abcdefghijk",
      url: "https://example.com",
      category: "개발",
    }),
  );
});
test("반복 회차 생성, 한 회차 변경/취소, 이동한 예외의 기간 조회", () => {
  const r = {
    id: "r",
    title: "반복",
    starts_at: "2026-10-10T00:00:00.000Z",
    ends_at: "2026-10-10T01:00:00.000Z",
    frequency: "daily",
    interval: 1,
    until_date: "2026-10-12",
  };
  assert.equal(occurrences([r], [], "2026-10-10", "2026-10-13").length, 3);
  const e = {
    id: "e",
    rule_id: "r",
    original_at: "2026-10-11T00:00:00+00:00",
    cancelled: true,
  };
  assert.equal(occurrences([r], [e], "2026-10-10", "2026-10-13").length, 2);
  const moved = {
    ...e,
    cancelled: false,
    title: "이동",
    starts_at: "2026-10-20T00:00:00.000Z",
    ends_at: "2026-10-20T01:00:00.000Z",
  };
  assert.equal(
    occurrences([r], [moved], "2026-10-20", "2026-10-21")[0].title,
    "이동",
  );
  assert.equal(
    occurrences(
      [{ ...r, frequency: "weekly", until_date: "2026-10-31" }],
      [],
      "2026-10-10",
      "2026-11-01",
    ).length,
    4,
  );
});

test("월말과 윤년 반복은 원래 날짜를 유지", () => {
  const start = Date.parse("2024-01-31T09:00:00+09:00");
  assert.equal(
    new Date(recurrenceAt(start, "monthly", 1, 1)).toISOString(),
    "2024-02-29T00:00:00.000Z",
  );
  assert.equal(
    new Date(recurrenceAt(start, "monthly", 1, 2)).toISOString(),
    "2024-03-31T00:00:00.000Z",
  );
  const leap = Date.parse("2024-02-29T09:00:00+09:00");
  assert.equal(
    new Date(recurrenceAt(leap, "yearly", 1, 1)).toISOString(),
    "2025-02-28T00:00:00.000Z",
  );
  assert.equal(
    new Date(recurrenceAt(leap, "yearly", 1, 4)).toISOString(),
    "2028-02-29T00:00:00.000Z",
  );
});
