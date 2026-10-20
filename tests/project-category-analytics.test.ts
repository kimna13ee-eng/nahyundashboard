import { test } from "node:test";
import assert from "node:assert/strict";
import {
  analyticsCategories,
  analyticsCategoryLabels,
  analyticsCategorySeconds,
  taskCategorySeconds,
} from "../src/lib/work-kind.ts";

test("프로세스는 부모 프로젝트 분류를 따르고 기존 영업·디자인 분류는 유지", () => {
  const projects = [
    { id: "dev", project_category: "development" },
    { id: "ops", project_category: "operations" },
    { id: "content", project_category: "content" },
  ];
  const tasks = [
    {
      id: "managed-dev",
      project_id: "dev",
      project_step_id: "step-1",
      task_category: "other",
    },
    {
      id: "managed-ops",
      project_id: "ops",
      project_step_id: "step-2",
      task_category: "sales",
    },
    {
      id: "managed-content",
      project_id: "content",
      project_step_id: "step-3",
      task_category: "design",
    },
    { id: "legacy-sales", project_id: "dev", task_category: "sales" },
    { id: "legacy-design", task_category: "design" },
    { id: "legacy-content", task_category: "content" },
  ];
  const sessions = tasks.map((task) => ({
    id: `s:${task.id}`,
    task_id: task.id,
  }));
  const intervals = sessions.map((session) => ({
    id: `i:${session.id}`,
    session_id: session.id,
    starts_at: "2026-10-20T09:00:00+09:00",
    ends_at: "2026-10-20T09:05:00+09:00",
  }));
  const original = structuredClone({ tasks, projects });
  assert.deepEqual(
    analyticsCategorySeconds(
      tasks,
      sessions,
      intervals,
      "2026-10-20",
      Date.parse("2026-10-20T12:00:00+09:00"),
      projects,
    ),
    {
      content: 600,
      development: 300,
      operations: 300,
      sales: 300,
      design: 300,
      other: 0,
    },
  );
  assert.deepEqual({ tasks, projects }, original);
  assert.deepEqual(
    analyticsCategories.map((category) => analyticsCategoryLabels[category]),
    ["콘텐츠", "개발", "운영", "영업", "디자인", "기타"],
  );
  // The legacy helper keeps its four-key API and old classification contract.
  assert.deepEqual(
    taskCategorySeconds(
      tasks,
      sessions,
      intervals,
      "2026-10-20",
      Date.parse("2026-10-20T12:00:00+09:00"),
    ),
    { content: 300, sales: 600, design: 600, other: 300 },
  );
});

test("완료·보관한 프로세스의 시간도 보존하고 현재 부모 분류 변경에 반영", () => {
  const tasks = [
    {
      id: "archived",
      project_id: "p",
      project_step_id: "old",
      project_step_archived_at: "2026-10-20T10:00:00Z",
      status: "completed",
      task_category: "other",
    },
    {
      id: "complete",
      project_id: "p",
      project_step_id: "done",
      status: "completed",
      task_category: "other",
    },
  ];
  const sessions = tasks.map((task) => ({
    id: `s:${task.id}`,
    task_id: task.id,
    status: "ENDED",
  }));
  const intervals = sessions.map((session) => ({
    id: `i:${session.id}`,
    session_id: session.id,
    starts_at: "2026-10-20T01:00:00+09:00",
    ends_at: "2026-10-20T01:10:00+09:00",
  }));
  const asOf = Date.parse("2026-10-20T12:00:00+09:00");
  assert.equal(
    analyticsCategorySeconds(tasks, sessions, intervals, "2026-10-20", asOf, [
      { id: "p", project_category: "development", status: "completed" },
    ]).development,
    1200,
  );
  assert.equal(
    analyticsCategorySeconds(tasks, sessions, intervals, "2026-10-20", asOf, [
      { id: "p", project_category: "operations", status: "completed" },
    ]).operations,
    1200,
  );
});

test("분류 집계는 한국시간 경계·진행 중 구간을 자르고 누락 세션은 더하지 않음", () => {
  const tasks = [
    { id: "dev", project_id: "p", project_step_id: "a" },
    {
      id: "unknown-parent",
      project_id: "missing",
      project_step_id: "b",
      task_category: "sales",
    },
    { id: "legacy", task_category: "invalid" },
  ];
  const sessions = tasks.map((task) => ({
    id: `s:${task.id}`,
    task_id: task.id,
  }));
  const intervals = [
    {
      id: "cross",
      session_id: "s:dev",
      starts_at: "2026-10-19T14:50:00Z",
      ends_at: "2026-10-19T15:10:00Z",
    },
    {
      id: "missing",
      session_id: "s:unknown-parent",
      starts_at: "2026-10-20T09:00:00+09:00",
      ends_at: null,
    },
    {
      id: "legacy",
      session_id: "s:legacy",
      starts_at: "2026-10-20T09:00:00+09:00",
      ends_at: "2026-10-20T09:05:00+09:00",
    },
    {
      id: "excluded",
      session_id: "not-in-sessions",
      starts_at: "2026-10-20T09:00:00+09:00",
      ends_at: "2026-10-20T12:00:00+09:00",
    },
  ];
  assert.deepEqual(
    analyticsCategorySeconds(
      tasks,
      sessions,
      intervals,
      "2026-10-20",
      Date.parse("2026-10-20T09:10:00+09:00"),
      [{ id: "p", project_category: "development" }],
    ),
    {
      content: 0,
      development: 600,
      operations: 0,
      sales: 0,
      design: 0,
      other: 900,
    },
  );
});
