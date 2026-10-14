import { seoulDate, type OpsRow } from "./ops.ts";

export function dailyTaskSummary(tasks: OpsRow[], day: string) {
  const daily = tasks.filter((task) => {
    const created = Date.parse(String(task.created_at));
    return (
      task.due_date === day ||
      (Number.isFinite(created) && seoulDate(new Date(created)) === day)
    );
  });
  return {
    total: daily.length,
    completed: daily.filter((t) => t.status === "completed").length,
  };
}
