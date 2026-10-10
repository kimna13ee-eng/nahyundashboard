import { test } from "node:test";
import assert from "node:assert/strict";
import { journalReport } from "../src/lib/journal-report.ts";
test("일지 내보내기는 서울 자정에서 구간을 나누고 검증 데이터를 제외", () => {
  const data = { tasks: [{ id: "t", title: "[Time Tracker 테스트] A" }], work_sessions: [{ id: "s", task_id: "t", status: "ENDED", summary: "세션 요약" }], session_intervals: [{ id: "i", session_id: "s", starts_at: "2026-10-09T23:50:00+09:00", ends_at: "2026-10-10T00:10:00+09:00" }] };
  const report = journalReport(data, "2026-10-10", Date.parse("2026-10-10T12:00:00+09:00"), false);
  assert.equal(report.total, 600); assert.equal(report.count, 1); assert.match(report.text, /세션 요약/);
  assert.equal(journalReport(data, "2026-10-10", Date.now(), true).count, 0);
});
