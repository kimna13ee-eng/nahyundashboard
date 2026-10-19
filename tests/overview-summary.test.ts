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
