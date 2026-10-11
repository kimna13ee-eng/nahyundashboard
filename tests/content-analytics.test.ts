import { test } from "node:test";
import assert from "node:assert/strict";
import { contentSummary } from "../src/lib/content-analytics.ts";
const options = { day: "2026-10-10", now: Date.parse("2026-10-10T12:00:00+09:00"), excludeTests: true, channel: "all", project: "all" };
const rows = [
  { id: "1", title: "제작", stage: "production", approval: "pending", channel: "블로그", project_id: "p", publish_at: "2026-10-09T15:30:00Z" },
  { id: "2", title: "발행", stage: "results", approval: "approved", channel: "블로그", publish_at: "2026-10-09T00:00:00Z" },
  { id: "3", title: "아이디어", stage: "idea", approval: "none", channel: "", publish_at: null },
  { id: "4", title: "[콘텐츠 통계 테스트] 검수", stage: "review", approval: "pending", channel: "테스트", publish_at: "2026-10-11T00:00:00Z" },
];
test("콘텐츠 집계는 서울 날짜·미발행 지연·수동 발행 기록을 구분", () => {
  const s = contentSummary(rows, options);
  assert.equal(s.total, 3); assert.equal(s.pending, 1); assert.equal(s.recordedPublished, 1);
  assert.equal(s.scheduled, 1); assert.equal(s.overdue, 1); assert.equal(s.unscheduled, 1); assert.equal(s.selectedDay, 1);
  assert.equal(s.stages.production, 1); assert.equal(s.stages.results, 1);
});
test("명시적인 QA 테스트 콘텐츠만 제외하고 일반 QA 제목은 집계", () => {
  const data = [
    { id: "qa", title: "[QA 테스트] 개인 릴스", stage: "results", approval: "approved" },
    { id: "real", title: "QA 검수용 개인 릴스", stage: "review", approval: "pending" },
  ];
  assert.equal(contentSummary(data, options).total, 1);
  assert.equal(contentSummary(data, options).pending, 1);
  assert.equal(contentSummary(data, { ...options, excludeTests: false }).total, 2);
});
test("검증 데이터 포함 및 채널·프로젝트 필터", () => {
  assert.equal(contentSummary(rows, { ...options, excludeTests: false }).total, 4);
  assert.equal(contentSummary(rows, { ...options, channel: "블로그", project: "p" }).total, 1);
  assert.equal(contentSummary(rows, { ...options, project: "" }).total, 2);
  assert.equal(contentSummary(rows, { ...options, channel: "없음" }).total, 0);
});
