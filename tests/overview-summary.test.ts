import { test } from "node:test";
import assert from "node:assert/strict";
import { dailyTaskSummary } from "../src/lib/overview-summary.ts";
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
