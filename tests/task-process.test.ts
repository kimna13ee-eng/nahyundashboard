import { test } from "node:test";
import assert from "node:assert/strict";
import { parseResource } from "../src/lib/ops.ts";
import {
  parseProcessSteps,
  parseTaskCategory,
  processSummary,
  reconcileProcessSteps,
  taskCategoryLabels,
} from "../src/lib/task-process.ts";

test("업무 저장 API는 단계 검증과 숨긴 기존 값 보존을 적용", () => {
  const base = {
    title: "업무",
    notes: "기존 메모",
    status: "pending",
    priority: "normal",
    due_date: null,
  };
  const legacy = parseResource("tasks", base);
  for (const field of [
    "task_category",
    "process_steps",
    "tool",
    "assignee",
    "estimated_minutes",
  ])
    assert.equal(Object.hasOwn(legacy, field), false);
  const updated: Record<string, unknown> = parseResource("tasks", {
    ...base,
    task_category: "sales",
    process_steps: [{ id: "a", title: " 연락 준비 ", done: true }],
  });
  assert.equal(updated.task_category, "sales");
  assert.deepEqual(updated.process_steps, [
    { id: "a", title: "연락 준비", done: true },
  ]);
  assert.throws(() =>
    parseResource("tasks", {
      ...base,
      process_steps: [{ id: "a", title: "단계", done: "yes" }],
    }),
  );
});

test("업무 분류는 콘텐츠·영업·디자인·기타만 저장", () => {
  assert.equal(parseTaskCategory(undefined), "other");
  assert.equal(taskCategoryLabels[parseTaskCategory("content")], "콘텐츠");
  assert.equal(parseTaskCategory("sales"), "sales");
  assert.equal(parseTaskCategory("design"), "design");
  assert.throws(() => parseTaskCategory("planned"));
  assert.throws(() => parseTaskCategory(null));
});

test("프로세스 저장은 단계 수·이름·완료 상태·고유 ID를 검증", () => {
  assert.deepEqual(parseProcessSteps(undefined), []);
  assert.deepEqual(
    parseProcessSteps([
      { id: "a", title: "  자료 수집  ", done: true, extra: 1 },
    ]),
    [{ id: "a", title: "자료 수집", done: true }],
  );
  const step = { id: "a", title: "검토", done: false };
  assert.throws(() => parseProcessSteps([step, step]));
  assert.throws(() => parseProcessSteps([{ ...step, id: " " }]));
  assert.throws(() => parseProcessSteps([{ ...step, id: "a".repeat(81) }]));
  assert.throws(() => parseProcessSteps([{ ...step, title: " " }]));
  assert.throws(() =>
    parseProcessSteps([{ ...step, title: "가".repeat(121) }]),
  );
  assert.throws(() => parseProcessSteps([{ ...step, done: "false" }]));
  assert.throws(() => parseProcessSteps({ steps: [step] }));
  assert.throws(() => parseProcessSteps(null));
  assert.throws(() =>
    parseProcessSteps(
      Array.from({ length: 31 }, (_, i) => ({ ...step, id: String(i) })),
    ),
  );
  assert.equal(
    parseProcessSteps(
      Array.from({ length: 30 }, (_, i) => ({ ...step, id: String(i) })),
    ).length,
    30,
  );
});

test("현재 단계는 첫 미완료 단계이며 빈 목록을 완료로 표시하지 않음", () => {
  const steps = [
    { id: "a", title: "자료 수집", done: true },
    { id: "b", title: "초안 작성", done: false },
    { id: "c", title: "검토", done: true },
  ];
  assert.deepEqual(processSummary(steps), {
    current: steps[1],
    completed: 2,
    total: 3,
    allDone: false,
  });
  assert.deepEqual(processSummary([]), {
    current: null,
    completed: 0,
    total: 0,
    allDone: false,
  });
  assert.deepEqual(
    processSummary(steps.map((step) => ({ ...step, done: true }))),
    {
      current: null,
      completed: 3,
      total: 3,
      allDone: true,
    },
  );
});

test("프로세스 순서 변경·단계 추가 시 기존 ID와 체크 상태 보존", () => {
  const original = [
    { id: "a", title: "자료 수집", done: true },
    { id: "b", title: "초안 작성", done: false },
    { id: "c", title: "검토", done: true },
  ];
  const result = reconcileProcessSteps(
    "검토\r\n\n 자료 수집 \n발행",
    original,
    () => "new",
  );
  assert.deepEqual(result, [
    original[2],
    original[0],
    { id: "new", title: "발행", done: false },
  ]);
  assert.equal(original.length, 3);
  result[0].done = false;
  assert.equal(original[2].done, true);
  assert.deepEqual(reconcileProcessSteps(" \n", original), []);
});

test("중복 이름은 기존 순서대로 매칭하고 바꾼 이름은 미완료로 시작", () => {
  let nextId = 0;
  const previous = [
    { id: "a", title: "검토", done: true },
    { id: "b", title: "검토", done: false },
    { id: "c", title: "초안", done: true },
  ];
  assert.deepEqual(
    reconcileProcessSteps(
      "검토\n검토\n최종 초안\n검토",
      previous,
      () => `new-${++nextId}`,
    ),
    [
      previous[0],
      previous[1],
      { id: "new-1", title: "최종 초안", done: false },
      { id: "new-2", title: "검토", done: false },
    ],
  );
  assert.throws(() => reconcileProcessSteps("새 단계", previous, () => "a"));
  assert.throws(() => reconcileProcessSteps(Array(31).fill("단계").join("\n")));
  assert.throws(() => reconcileProcessSteps("가".repeat(121)));
});
