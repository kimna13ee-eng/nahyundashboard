import { test } from "node:test";
import assert from "node:assert/strict";
import { taskCategorySeconds } from "../src/lib/work-kind.ts";

test("업무 분류 시간은 서울 날짜 경계를 잘라 콘텐츠·영업·디자인별로 집계한다", () => {
  const tasks = [
    { id: "content-task", task_category: "content", work_kind: "unexpected" },
    { id: "sales-task", task_category: "sales", work_kind: "planned" },
    { id: "design-task", task_category: "design" },
  ];
  const sessions = [
    { id: "content-session", task_id: "content-task" },
    { id: "sales-session", task_id: "sales-task" },
    { id: "design-session", task_id: "design-task" },
  ];
  const intervals = [
    {
      id: "cross-start",
      session_id: "content-session",
      starts_at: "2026-10-18T14:50:00Z",
      ends_at: "2026-10-18T15:10:00Z",
    },
    {
      id: "sales",
      session_id: "sales-session",
      starts_at: "2026-10-19T09:00:00+09:00",
      ends_at: "2026-10-19T09:30:00+09:00",
    },
    {
      id: "cross-end",
      session_id: "design-session",
      starts_at: "2026-10-19T23:50:00+09:00",
      ends_at: "2026-10-20T00:20:00+09:00",
    },
  ];
  assert.deepEqual(
    taskCategorySeconds(
      tasks,
      sessions,
      intervals,
      "2026-10-19",
      Date.parse("2026-10-20T01:00:00+09:00"),
    ),
    { content: 600, sales: 1800, design: 600, other: 0 },
  );
  assert.equal(tasks[0].work_kind, "unexpected");
  assert.equal(tasks[1].work_kind, "planned");
});

test("기존 미지정 분류는 기타로 집계하고 제외된 업무의 세션은 더하지 않는다", () => {
  const tasks = [
    { id: "legacy", work_kind: "planned" },
    { id: "other", task_category: "other" },
    { id: "unknown", task_category: "invalid" },
  ];
  const sessions = [
    { id: "legacy-session", task_id: "legacy" },
    { id: "other-session", task_id: "other" },
    { id: "unknown-session", task_id: "unknown" },
    { id: "excluded-session", task_id: "excluded" },
  ];
  const intervals = sessions.map((session, index) => ({
    id: `interval-${index}`,
    session_id: session.id,
    starts_at: "2026-10-19T10:00:00+09:00",
    ends_at: index === 0 ? null : "2026-10-19T10:05:00+09:00",
  }));
  assert.deepEqual(
    taskCategorySeconds(
      tasks,
      sessions,
      intervals,
      "2026-10-19",
      Date.parse("2026-10-19T10:10:00+09:00"),
    ),
    { content: 0, sales: 0, design: 0, other: 1200 },
  );
  assert.equal(Object.hasOwn(tasks[0], "task_category"), false);
});
