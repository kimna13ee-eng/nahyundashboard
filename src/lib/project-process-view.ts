import type { OpsRow } from "./ops.ts";
import type { ProcessStep } from "./task-process.ts";

export function isProjectProcess(task: OpsRow) {
  return Boolean(task.project_id && task.project_step_id);
}

export function isArchivedProjectProcess(task: OpsRow) {
  return isProjectProcess(task) && Boolean(task.project_step_archived_at);
}

export function orderedProjectTasks(tasks: OpsRow[]) {
  const groups = new Map<unknown, number>();
  for (const task of tasks) {
    if (!groups.has(task.project_id)) groups.set(task.project_id, groups.size);
  }
  return [...tasks].sort(
    (a, b) =>
      groups.get(a.project_id)! - groups.get(b.project_id)! ||
      Number(isProjectProcess(b)) - Number(isProjectProcess(a)) ||
      (isProjectProcess(a) && isProjectProcess(b)
        ? Number(a.project_step_order ?? 0) - Number(b.project_step_order ?? 0)
        : 0),
  );
}

export function projectProcessSteps(
  tasks: OpsRow[],
  projectId: unknown,
  archived = false,
): ProcessStep[] {
  return tasks
    .filter(
      (task) =>
        task.project_id === projectId &&
        isProjectProcess(task) &&
        isArchivedProjectProcess(task) === archived,
    )
    .sort(
      (a, b) =>
        Number(a.project_step_order ?? 0) - Number(b.project_step_order ?? 0) ||
        String(a.id).localeCompare(String(b.id)),
    )
    .map((task) => ({
      id: String(task.project_step_id),
      title: String(task.title),
      done: task.status === "completed",
    }));
}
