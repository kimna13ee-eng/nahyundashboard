import { test } from "node:test";
import assert from "node:assert/strict";
import { attentionTasks, resumeContext } from "../src/lib/workflow-context.ts";
import {
  contentCalendar,
  parsePersonalContent,
} from "../src/lib/personal-content.ts";
test("오늘 마감·승인·실패를 표시하고 수동 우선순위를 보존", () => {
  const tasks = [
    { id: "a", status: "pending", due_date: "2026-10-10", priority: "low" },
    { id: "b", status: "failed", priority: "high" },
    { id: "c", status: "completed", due_date: "2026-10-09" },
  ];
  assert.deepEqual(
    attentionTasks(tasks, "2026-10-10").map((t) => t.id),
    ["b", "a"],
  );
  assert.equal(tasks[0].priority, "low");
});
test("재개 맥락은 해당 업무의 실제 메모와 이전 세션 중단 이벤트만 표시", () => {
  const context = resumeContext(
    { id: "a" },
    [
      {
        id: "n",
        task_id: "a",
        body: "실제 메모",
        kind: "issue",
        created_at: "2026-10-10",
      },
      { id: "other", task_id: "b", body: "다른 업무" },
    ],
    [
      {
        id: "e",
        kind: "switch",
        session_id: "new",
        previous_session_id: "old",
        created_at: "2026-10-10",
      },
    ],
    "old",
  );
  assert.equal(context.latest?.body, "실제 메모");
  assert.equal(context.issues.length, 1);
  assert.equal(context.interruption?.id, "e");
  assert.equal(resumeContext({ id: "empty" }, [], []).latest, undefined);
});
test("개인 콘텐츠 촬영·편집·발행과 실제 시각·성과 검증", () => {
  const details = parsePersonalContent({
    type: "reel",
    step: "results",
    review: "approved",
    shoot_at: "2026-10-11T09:00:00+09:00",
    edit_at: "2026-10-12T09:00:00+09:00",
    published_at: "2026-10-13T09:00:00+09:00",
    metrics_at: "2026-10-14T09:00:00+09:00",
    views: 120,
    follower_change: -1,
  });
  assert.equal(details.views, 120);
  assert.equal(details.likes, null);
  assert.equal(
    contentCalendar([
      {
        id: "c",
        personal_details: details,
        publish_at: "2026-10-13T09:00:00+09:00",
      },
    ]).length,
    3,
  );
  assert.throws(() =>
    parsePersonalContent({
      type: "reel",
      step: "published",
      review: "pending",
    }),
  );
  assert.throws(() =>
    parsePersonalContent({
      type: "reel",
      step: "idea",
      review: "none",
      views: -1,
    }),
  );
  assert.throws(() =>
    parsePersonalContent({
      type: "reel",
      step: "idea",
      review: "none",
      views: 1,
    }),
  );
});
