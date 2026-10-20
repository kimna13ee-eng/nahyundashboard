import { test } from "node:test";
import assert from "node:assert/strict";
import { journalReport } from "../src/lib/journal-report.ts";
test("일지 내보내기는 서울 자정에서 구간을 나누고 검증 데이터를 제외", () => {
  const data = {
    tasks: [{ id: "t", title: "[Time Tracker 테스트] A" }],
    work_sessions: [
      { id: "s", task_id: "t", status: "ENDED", summary: "세션 요약" },
    ],
    session_intervals: [
      {
        id: "i",
        session_id: "s",
        starts_at: "2026-10-09T23:50:00+09:00",
        ends_at: "2026-10-10T00:10:00+09:00",
      },
    ],
  };
  const report = journalReport(
    data,
    "2026-10-10",
    Date.parse("2026-10-10T12:00:00+09:00"),
    false,
  );
  assert.equal(report.total, 600);
  assert.equal(report.count, 1);
  assert.match(report.text, /세션 요약/);
  assert.equal(journalReport(data, "2026-10-10", Date.now(), true).count, 0);
});
test("QA 표시를 제외하면 일지 합계와 원문에서만 제외하고 일반 검수 업무는 보존", () => {
  const data = {
    tasks: [
      { id: "qa", title: "[QA 테스트] 전환 A" },
      { id: "real", title: "QA 검수 업무" },
    ],
    work_sessions: [
      { id: "s-qa", task_id: "qa", status: "ENDED" },
      { id: "s-real", task_id: "real", status: "ENDED" },
    ],
    session_intervals: [
      {
        id: "i-qa",
        session_id: "s-qa",
        starts_at: "2026-10-11T09:00:00+09:00",
        ends_at: "2026-10-11T09:10:00+09:00",
      },
      {
        id: "i-real",
        session_id: "s-real",
        starts_at: "2026-10-11T09:10:00+09:00",
        ends_at: "2026-10-11T09:15:00+09:00",
      },
    ],
  };
  const now = Date.parse("2026-10-11T10:00:00+09:00");
  const filtered = journalReport(data, "2026-10-11", now, true);
  assert.equal(filtered.count, 1);
  assert.equal(filtered.total, 300);
  assert.doesNotMatch(filtered.text, /\[QA 테스트\]/);
  assert.match(filtered.text, /QA 검수 업무/);
  assert.equal(journalReport(data, "2026-10-11", now, false).total, 900);
});

test("회사 일지는 회사 범위로 표시하고 기록 원문은 변형하지 않음", () => {
  const data = {
    tasks: [{ id: "t", title: "회사 운영 업무" }],
    work_sessions: [
      {
        id: "s",
        task_id: "t",
        status: "ENDED",
        summary: "원문 PERSONAL 문자열 보존",
      },
    ],
    session_intervals: [
      {
        id: "i",
        session_id: "s",
        starts_at: "2026-10-20T09:00:00+09:00",
        ends_at: "2026-10-20T09:05:00+09:00",
      },
    ],
  };
  const report = journalReport(
    data,
    "2026-10-20",
    Date.parse("2026-10-20T10:00:00+09:00"),
    true,
    "FRENGLE",
  );
  assert.match(report.text, /^# FRENGLE 작업 일지/);
  assert.match(report.text, /조회된 FRENGLE 기록/);
  assert.match(report.text, /원문 PERSONAL 문자열 보존/);
  assert.equal(report.total, 300);
});
