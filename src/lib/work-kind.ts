import { intervalSecondsForDay, type OpsRow } from "./ops.ts";
import {
  taskCategories,
  taskCategoryLabels,
  type TaskCategory,
} from "./task-process.ts";
import {
  projectCategories,
  projectCategoryLabels,
  type ProjectCategory,
} from "./project-process.ts";
import { isProjectProcess } from "./project-process-view.ts";
export function workKindSeconds(
  tasks: OpsRow[],
  sessions: OpsRow[],
  intervals: OpsRow[],
  day: string,
  now: number,
) {
  const result = { planned: 0, unexpected: 0, unclassified: 0 };
  const taskKinds = new Map(tasks.map((t) => [t.id, t.work_kind]));
  const sessionKinds = new Map(
    sessions
      .filter((s) => taskKinds.has(String(s.task_id)))
      .map((s) => [s.id, taskKinds.get(String(s.task_id))]),
  );
  for (const [kind, value] of Object.entries(result)) {
    result[kind as keyof typeof result] =
      value +
      intervalSecondsForDay(
        intervals.filter((i) => {
          if (!sessionKinds.has(String(i.session_id))) return false;
          const classification = sessionKinds.get(String(i.session_id));
          return kind === "unclassified"
            ? !["planned", "unexpected"].includes(String(classification))
            : classification === kind;
        }),
        now,
        day,
      );
  }
  return result;
}

export function taskCategorySeconds(
  tasks: OpsRow[],
  sessions: OpsRow[],
  intervals: OpsRow[],
  day: string,
  now: number,
): Record<TaskCategory, number> {
  return categorySeconds(
    taskCategories,
    tasks,
    sessions,
    intervals,
    day,
    now,
    (task) =>
      taskCategories.includes(task.task_category as TaskCategory)
        ? (task.task_category as TaskCategory)
        : "other",
  );
}

export const analyticsCategories = [
  "content",
  "development",
  "operations",
  "sales",
  "design",
  "other",
] as const;
export type AnalyticsCategory = (typeof analyticsCategories)[number];
export const analyticsCategoryLabels: Record<AnalyticsCategory, string> = {
  ...taskCategoryLabels,
  ...projectCategoryLabels,
};

/** Managed steps use their current parent classification. Legacy tasks keep
 * their existing task category. Completed and archived steps remain history. */
export function analyticsCategorySeconds(
  tasks: OpsRow[],
  sessions: OpsRow[],
  intervals: OpsRow[],
  day: string,
  now: number,
  projects: OpsRow[] = [],
): Record<AnalyticsCategory, number> {
  const parents = new Map(projects.map((project) => [project.id, project]));
  return categorySeconds(
    analyticsCategories,
    tasks,
    sessions,
    intervals,
    day,
    now,
    (task) => {
      if (isProjectProcess(task)) {
        const category = parents.get(String(task.project_id))?.project_category;
        return projectCategories.includes(category as ProjectCategory)
          ? (category as ProjectCategory)
          : "other";
      }
      return taskCategories.includes(task.task_category as TaskCategory)
        ? (task.task_category as TaskCategory)
        : "other";
    },
  );
}

function categorySeconds<Category extends string>(
  categories: readonly Category[],
  tasks: OpsRow[],
  sessions: OpsRow[],
  intervals: OpsRow[],
  day: string,
  now: number,
  classify: (task: OpsRow) => Category,
): Record<Category, number> {
  const result = Object.fromEntries(
    categories.map((category) => [category, 0]),
  ) as Record<Category, number>;
  const categoriesByTask = new Map(
    tasks.map((task) => [task.id, classify(task)]),
  );
  const categoriesBySession = new Map(
    sessions
      .filter((session) => categoriesByTask.has(String(session.task_id)))
      .map((session) => [
        session.id,
        categoriesByTask.get(String(session.task_id)),
      ]),
  );
  for (const category of categories) {
    result[category] = intervalSecondsForDay(
      intervals.filter(
        (interval) =>
          categoriesBySession.get(String(interval.session_id)) === category,
      ),
      now,
      day,
    );
  }
  return result;
}
