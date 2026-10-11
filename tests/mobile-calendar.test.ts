import assert from "node:assert/strict";
import { test } from "node:test";
import { calendarLabel, calendarTitle } from "../src/lib/mobile-calendar.ts";
import { contentCalendar } from "../src/lib/personal-content.ts";
test("모바일 제목은 표시만 축약하고 콘텐츠 유형·QA 명시값을 분리", () => {
  const row = { id: "c", title: "출근메이크업 긴 제목", content_type: "reel" };
  assert.equal(calendarTitle(row), "[릴스] 출근메…");
  assert.equal(row.title, "출근메이크업 긴 제목");
  assert.equal(calendarLabel({ ...row, is_test: true }), "QA");
  assert.equal(
    calendarLabel({ ...row, title: "[QA 테스트] 제목", is_test: false }),
    "릴스",
  );
  assert.equal(calendarLabel({ ...row, title: "[QA 테스트] 제목" }), "QA");
  assert.equal(
    calendarTitle({ ...row, title: "👩🏽‍💻가나다라" }),
    "[릴스] 👩🏽‍💻가나…",
  );
  assert.equal(calendarTitle({ ...row, title: "메모" }), "[릴스] 메모");
});
test("Calendar 생성 항목은 상세 연결과 원문·메모·QA 메타데이터 유지", () => {
  const c = {
    id: "content-id",
    title: "원문 제목",
    notes: "메모 원문",
    project_id: "p",
    is_test: true,
    personal_details: {
      type: "carousel",
      step: "planning",
      shoot_at: "2026-10-15T01:00:00Z",
    },
    publish_at: "2026-10-16T09:00:00Z",
  };
  const rows = contentCalendar([c]);
  assert.equal(rows.length, 2);
  for (const r of rows) {
    assert.equal(r.content_id, c.id);
    assert.equal(r.title, c.title);
    assert.equal(r.notes, c.notes);
    assert.equal(r.project_id, "p");
    assert.equal(calendarLabel(r), "QA");
  }
});
