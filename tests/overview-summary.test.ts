import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dailyTaskGroups,
  dailyTaskSummary,
  seoulWeek,
  taskCompletionTime,
  weeklyScheduleRows,
  weeklyScheduleTime,
} from "../src/lib/overview-summary.ts";
import { projectProcessSteps } from "../src/lib/project-process-view.ts";
test("오늘 등록 또는 마감 업무를 서울 날짜로 중복 없이 집계", () => {
  const tasks = [
    {
      id: "1",
      created_at: "2026-10-13T15:00:00Z",
      due_date: "2026-10-14",
      status: "completed",
    },
    {
      id: "2",
      created_at: "2026-10-13T14:59:59Z",
      due_date: null,
      status: "completed",
    },
    {
      id: "3",
      created_at: "2026-10-01T00:00:00Z",
      due_date: "2026-10-14",
      status: "pending",
    },
    {
      id: "4",
      created_at: "2026-10-14T14:59:59Z",
      due_date: "2026-10-20",
      status: "completed",
    },
    { id: "5", created_at: "invalid", due_date: null, status: "pending" },
  ];
  assert.deepEqual(dailyTaskSummary(tasks, "2026-10-14"), {
    total: 3,
    completed: 2,
  });
  assert.deepEqual(dailyTaskSummary(tasks, "2026-10-15"), {
    total: 0,
    completed: 0,
  });
});

test("오늘 업무는 등록 또는 마감 미완료, 완료는 실제 완료 서울 날짜로 구분", () => {
  const tasks = [
    { id: "new", status: "pending", created_at: "2026-10-18T15:00:00Z" },
    { id: "due", status: "pending", due_date: "2026-10-19" },
    {
      id: "done-old",
      status: "completed",
      created_at: "2026-10-19T01:00:00Z",
      completed_at: "2026-10-18T14:59:59Z",
    },
    {
      id: "done-today",
      status: "completed",
      created_at: "2026-09-01T01:00:00Z",
      completed_at: "2026-10-18T15:00:00Z",
    },
    {
      id: "tomorrow",
      status: "completed",
      completed_at: "2026-10-19T15:00:00Z",
    },
    {
      id: "unknown",
      status: "completed",
      completed_at: null,
      updated_at: "2026-10-19T01:00:00Z",
    },
  ];
  const result = dailyTaskGroups(tasks, "2026-10-19");
  assert.deepEqual(
    result.pending.map((task) => task.id),
    ["new", "due"],
  );
  assert.deepEqual(
    result.completed.map((task) => task.id),
    ["done-today"],
  );
  assert.equal(
    taskCompletionTime({ id: "legacy", updated_at: "2026-10-19T01:00:00Z" }),
    "2026-10-19T01:00:00Z",
  );
  assert.equal(taskCompletionTime({ id: "bad", updated_at: "invalid" }), null);
});

test("프로젝트의 미완료 단계는 날짜와 관계없이 매일 표시하고 보관 단계는 제외", () => {
  const tasks = [
    {
      id: "a",
      project_id: "p",
      project_step_id: "a",
      project_step_order: 1,
      status: "pending",
      created_at: "2026-09-01T00:00:00Z",
    },
    {
      id: "b",
      project_id: "p",
      project_step_id: "b",
      project_step_order: 0,
      status: "running",
      due_date: "2026-11-01",
    },
    {
      id: "c",
      project_id: "p",
      project_step_id: "c",
      project_step_order: 2,
      status: "completed",
      completed_at: "2026-10-19T15:00:00Z",
    },
    {
      id: "old",
      project_id: "p",
      project_step_id: "old",
      status: "completed",
      completed_at: "2026-10-19T14:59:59Z",
    },
    {
      id: "archive",
      project_id: "p",
      project_step_id: "archive",
      project_step_archived_at: "2026-10-19T12:00:00Z",
      status: "pending",
      due_date: "2026-10-20",
    },
    {
      id: "archived-done",
      project_id: "p",
      project_step_id: "archived-done",
      project_step_archived_at: "2026-10-20T03:00:00Z",
      status: "completed",
      completed_at: "2026-10-20T01:00:00Z",
    },
    { id: "legacy", status: "pending", created_at: "2026-09-01T00:00:00Z" },
    { id: "legacy-today", status: "pending", due_date: "2026-10-20" },
  ];
  const today = dailyTaskGroups(tasks, "2026-10-20");
  assert.deepEqual(
    today.pending.map((t) => t.id),
    ["b", "a", "legacy-today"],
  );
  assert.deepEqual(
    today.completed.map((t) => t.id),
    ["archived-done", "c"],
  );
  assert.deepEqual(dailyTaskSummary(tasks, "2026-10-20"), {
    total: 5,
    completed: 2,
  });
  const tomorrow = dailyTaskGroups(tasks, "2026-10-21");
  assert.deepEqual(
    tomorrow.pending.map((t) => t.id),
    ["b", "a"],
  );
  assert.deepEqual(tomorrow.completed, []);
  assert.deepEqual(
    projectProcessSteps(tasks, "p").map((s) => [s.id, s.done]),
    [
      ["b", false],
      ["old", true],
      ["a", false],
      ["c", true],
    ],
  );
  assert.deepEqual(
    projectProcessSteps(tasks, "p", true).map((s) => s.id),
    ["archive", "archived-done"],
  );
});

test("진행 중 업무는 마감일과 무관하게 매일 표시하고 오늘 완료하면 하루 합계에 남는다", () => {
  const tasks = [
    {
      id: "future",
      status: "running",
      created_at: "2026-09-01T00:00:00Z",
      due_date: "2026-11-01",
      completed_at: null as string | null,
    },
    {
      id: "past",
      status: "running",
      created_at: "2026-09-01T00:00:00Z",
      due_date: "2026-10-01",
    },
    {
      id: "none",
      status: "running",
      created_at: "2026-09-01T00:00:00Z",
      due_date: null,
    },
    {
      id: "today",
      status: "running",
      created_at: "2026-10-20T00:00:00Z",
      due_date: "2026-10-20",
    },
    {
      id: "waiting",
      status: "pending",
      created_at: "2026-09-01T00:00:00Z",
      due_date: "2026-11-01",
    },
    {
      id: "archived",
      project_id: "p",
      project_step_id: "a",
      project_step_archived_at: "2026-10-19T00:00:00Z",
      status: "running",
    },
    {
      id: "done-before",
      status: "completed",
      created_at: "2026-09-01T00:00:00Z",
      due_date: "2026-11-01",
      completed_at: "2026-10-19T14:59:59Z",
    },
  ];
  assert.deepEqual(
    dailyTaskGroups(tasks, "2026-10-20").pending.map((task) => task.id),
    ["future", "past", "none", "today"],
  );
  assert.deepEqual(dailyTaskSummary(tasks, "2026-10-20"), {
    total: 4,
    completed: 0,
  });
  tasks[0].status = "completed";
  tasks[0].completed_at = "2026-10-19T15:00:00Z";
  const today = dailyTaskGroups(tasks, "2026-10-20");
  assert.deepEqual(
    today.pending.map((task) => task.id),
    ["past", "none", "today"],
  );
  assert.deepEqual(
    today.completed.map((task) => task.id),
    ["future"],
  );
  assert.deepEqual(dailyTaskSummary(tasks, "2026-10-20"), {
    total: 4,
    completed: 1,
  });
  assert.deepEqual(dailyTaskSummary(tasks, "2026-10-21"), {
    total: 3,
    completed: 0,
  });
});

test("이번 주는 월요일부터 일요일, 선택 날짜와 관계없이 오늘을 기준으로 계산", () => {
  assert.deepEqual(seoulWeek("2026-10-19").days, [
    "2026-10-19",
    "2026-10-20",
    "2026-10-21",
    "2026-10-22",
    "2026-10-23",
    "2026-10-24",
    "2026-10-25",
  ]);
  assert.equal(seoulWeek("2026-10-25").from, "2026-10-19");
  assert.equal(seoulWeek("2026-11-01").from, "2026-10-26");
  assert.equal(seoulWeek("2027-01-01").to, "2027-01-04");
});

test("주간 표는 겹치는 날짜별 표시, 자정 종료는 다음 날에서 제외, 소스 시간 구분", () => {
  const overnight = {
    id: "overnight",
    source: "일정",
    starts_at: "2026-10-19T23:00:00+09:00",
    ends_at: "2026-10-21T00:00:00+09:00",
  };
  const task = {
    id: "due",
    source: "업무 마감",
    starts_at: "2026-10-19T00:00:00+09:00",
    ends_at: "2026-10-19T23:59:59+09:00",
  };
  const content = {
    id: "content",
    source: "콘텐츠 발행 예정",
    starts_at: "2026-10-20T09:00:00+09:00",
    ends_at: "2026-10-20T09:01:00+09:00",
  };
  const rows = weeklyScheduleRows([overnight, task, content], "2026-10-25");
  assert.deepEqual(
    rows[0].items.map((item) => item.id),
    ["due", "overnight"],
  );
  assert.deepEqual(
    rows[1].items.map((item) => item.id),
    ["overnight", "content"],
  );
  assert.equal(rows[2].items.length, 0);
  assert.equal(weeklyScheduleTime(overnight, "2026-10-19"), "23:00–24:00");
  assert.equal(weeklyScheduleTime(overnight, "2026-10-20"), "종일");
  assert.equal(weeklyScheduleTime(task, "2026-10-19"), "종일 · 마감");
  assert.equal(weeklyScheduleTime(content, "2026-10-20"), "09:00");
});
