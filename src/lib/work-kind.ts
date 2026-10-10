import { intervalSecondsForDay, type OpsRow } from "./ops.ts";
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
