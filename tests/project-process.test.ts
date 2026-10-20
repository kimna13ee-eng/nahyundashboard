import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseProjectCategory,
  parseProjectProcessInput,
  projectCategories,
  projectCategoryLabels,
} from "../src/lib/project-process.ts";
import { parseResource } from "../src/lib/ops.ts";

const project = {
  title: " 프로젝트 ",
  description: "기존 설명",
  status: "active",
  project_category: "development",
  process_steps: [{ id: "a", title: " 첫 단계 ", done: false }],
};

test("프로젝트 분류와 안정된 단계 ID·체크 상태를 검증", () => {
  assert.deepEqual(
    projectCategories.map((category) => projectCategoryLabels[category]),
    ["콘텐츠", "개발", "운영", "기타"],
  );
  assert.equal(parseProjectCategory(undefined), "other");
  for (const invalid of [null, "sales", "design", "", 1])
    assert.throws(() => parseProjectCategory(invalid));
  assert.deepEqual(parseProjectProcessInput(project), {
    ...project,
    title: "프로젝트",
    process_steps: [{ id: "a", title: "첫 단계", done: false }],
    expected_updated_at: null,
  });
  const timestamp = "2026-10-20T09:10:11.123456+09:00";
  assert.equal(
    parseProjectProcessInput({ ...project, expected_updated_at: timestamp })
      .expected_updated_at,
    timestamp,
  );
  assert.deepEqual(
    parseProjectProcessInput({ ...project, process_steps: [] }).process_steps,
    [],
  );
});

test("프로젝트 저장에서 모호한 목록·상태·동시편집 시각을 거절", () => {
  for (const invalid of [
    null,
    [],
    { ...project, title: " " },
    { ...project, description: "가".repeat(2001) },
    { ...project, status: ["active"] },
    { ...project, process_steps: undefined },
    { ...project, process_steps: null },
    {
      ...project,
      process_steps: [...project.process_steps, ...project.process_steps],
    },
    {
      ...project,
      process_steps: Array.from({ length: 31 }, (_, i) => ({
        id: `${i}`,
        title: "단계",
        done: false,
      })),
    },
    { ...project, expected_updated_at: "2026-10-20T09:00" },
    { ...project, expected_updated_at: "not-a-dateZ" },
    { ...project, expected_updated_at: true },
  ])
    assert.throws(() => parseProjectProcessInput(invalid));
});

test("legacy 프로젝트 수정은 새 분류 생략 시 유지하고 직접 단계 metadata를 허용하지 않음", () => {
  const base = {
    title: "기존 프로젝트",
    description: "기존 설명",
    status: "planning",
  };
  assert.deepEqual(parseResource("projects", base), base);
  assert.deepEqual(
    parseResource("projects", { ...base, project_category: "operations" }),
    { ...base, project_category: "operations" },
  );
  assert.throws(() =>
    parseResource("projects", { ...base, project_category: "sales" }),
  );
  const task = parseResource("tasks", {
    title: "기존 업무",
    notes: "메모",
    status: "pending",
    priority: "normal",
    due_date: null,
    project_step_id: "fake",
    project_step_order: 2,
    project_step_archived_at: "2026-01-01",
  });
  assert.equal(Object.hasOwn(task, "project_step_id"), false);
  assert.equal(Object.hasOwn(task, "project_step_order"), false);
  assert.equal(Object.hasOwn(task, "project_step_archived_at"), false);
});
