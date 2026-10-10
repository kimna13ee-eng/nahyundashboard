import { test } from "node:test";
import assert from "node:assert/strict";
import { workKindSeconds } from "../src/lib/work-kind.ts";
import { parseResource } from "../src/lib/ops.ts";
test("돌발 업무 시간은 서울 날짜 구간만 집계하고 기존 미분류를 보존", () => {
  const tasks = [{ id: "t", work_kind: "unexpected" }, { id: "u" }];
  const sessions = [{ id: "s", task_id: "t" }, { id: "v", task_id: "u" }];
  const intervals = [{ id: "1", session_id: "s", starts_at: "2026-10-09T23:50:00+09:00", ends_at: "2026-10-10T00:10:00+09:00" }, { id: "2", session_id: "v", starts_at: "2026-10-10T01:00:00+09:00", ends_at: "2026-10-10T01:05:00+09:00" }];
  assert.deepEqual(workKindSeconds(tasks, sessions, intervals, "2026-10-10", Date.now()), { planned: 0, unexpected: 600, unclassified: 300 });
  assert.equal(workKindSeconds([], sessions, intervals, "2026-10-10", Date.now()).unexpected, 0);
});
test("분류 입력은 허용 값만 받고 이전 요청은 새 필드를 강제하지 않음", () => {
  const value = { title: "업무", status: "pending", priority: "normal", due_date: null, notes: "" };
  const parsed = parseResource("tasks", { ...value, work_kind: "unexpected" });
  assert.ok("work_kind" in parsed);
  assert.equal(parsed.work_kind, "unexpected");
  assert.equal(Object.hasOwn(parseResource("tasks", value), "work_kind"), false);
  assert.throws(() => parseResource("tasks", { ...value, work_kind: "other" }));
});
