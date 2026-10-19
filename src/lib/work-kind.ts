import { intervalSecondsForDay, type OpsRow } from "./ops.ts";
import { taskCategories, type TaskCategory } from "./task-process.ts";
export function workKindSeconds(tasks: OpsRow[], sessions: OpsRow[], intervals: OpsRow[], day: string, now: number) {
  const result = { planned: 0, unexpected: 0, unclassified: 0 };
  const taskKinds = new Map(tasks.map(t => [t.id, t.work_kind]));
  const sessionKinds = new Map(sessions.filter(s => taskKinds.has(String(s.task_id))).map(s => [s.id, taskKinds.get(String(s.task_id))]));
  for (const [kind, value] of Object.entries(result)) {
    result[kind as keyof typeof result] = value + intervalSecondsForDay(intervals.filter(i => {
      if (!sessionKinds.has(String(i.session_id))) return false;
      const classification = sessionKinds.get(String(i.session_id));
      return kind === "unclassified" ? !["planned", "unexpected"].includes(String(classification)) : classification === kind;
    }), now, day);
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
  const result: Record<TaskCategory, number> = {
    content: 0,
    sales: 0,
    design: 0,
    other: 0,
  };
  const categoriesByTask = new Map(
    tasks.map((task) => [
      task.id,
      taskCategories.includes(task.task_category as TaskCategory)
        ? (task.task_category as TaskCategory)
        : "other",
    ]),
  );
  const categoriesBySession = new Map(
    sessions
      .filter((session) => categoriesByTask.has(String(session.task_id)))
      .map((session) => [
        session.id,
        categoriesByTask.get(String(session.task_id)),
      ]),
  );
  for (const category of taskCategories) {
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
