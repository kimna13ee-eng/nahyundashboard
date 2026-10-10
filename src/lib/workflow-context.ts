import { seoulDate, type OpsRow } from "./ops.ts";

// This is the current saved context, not an invented historical snapshot.
export function resumeContext(
  task: OpsRow,
  notes: OpsRow[],
  events: OpsRow[],
  sessionId?: string,
) {
  const relevant = notes.filter((n) => n.task_id === task.id);
  const latest = [...relevant].sort((a, b) =>
    String(b.updated_at || b.created_at || "").localeCompare(
      String(a.updated_at || a.created_at || ""),
    ),
  )[0];
  const interruption = events
    .filter(
      (e) =>
        sessionId &&
        ((e.kind === "pause" && e.session_id === sessionId) ||
          (e.kind === "switch" && e.previous_session_id === sessionId)),
    )
    .sort((a, b) =>
      String(b.created_at).localeCompare(String(a.created_at)),
    )[0];
  return {
    latest,
    issues: relevant.filter((n) => n.kind === "issue" && !n.done),
    next: relevant.filter((n) => n.kind === "next_action" && !n.done),
    interruption,
  };
}

export function attentionTasks(tasks: OpsRow[], today: string) {
  const rank = (t: OpsRow) =>
    t.status === "failed"
      ? 0
      : t.due_date && String(t.due_date) <= today
        ? 1
        : t.approval === "pending"
          ? 2
          : t.follow_up_at
            ? 3
            : 4;
  const priority = (t: OpsRow) =>
    ({ high: 0, normal: 1, medium: 1, low: 2 })[String(t.priority)] ?? 3;
  return tasks
    .filter(
      (t) =>
        t.status !== "completed" &&
        (t.status === "failed" ||
          t.approval === "pending" ||
          (t.due_date && String(t.due_date) <= today) ||
          (t.follow_up_at &&
            !["answered", "closed"].includes(String(t.contact_status)) &&
            seoulDate(new Date(String(t.follow_up_at))) <= today) ||
          (t.updated_at &&
            Date.parse(`${today}T00:00:00+09:00`) -
              Date.parse(String(t.updated_at)) >=
              14 * 86400000)),
    )
    .sort(
      (a, b) =>
        rank(a) - rank(b) ||
        priority(a) - priority(b) ||
        String(a.due_date || "9999").localeCompare(
          String(b.due_date || "9999"),
        ),
    );
}
