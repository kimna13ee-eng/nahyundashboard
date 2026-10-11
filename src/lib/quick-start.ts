import type { OpsRow } from "./ops.ts";
import { resumeContext } from "./workflow-context.ts";
import { savedSnapshot } from "./workflow.ts";

export function quickStartContext(
  task: OpsRow,
  session: OpsRow,
  notes: OpsRow[],
  events: OpsRow[],
  contexts: OpsRow[],
) {
  const current = resumeContext(task, notes, events, session.id);
  const snapshot = savedSnapshot(contexts, session.id);
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  const recordedNext = Array.isArray(snapshot?.next_actions)
    ? snapshot.next_actions
        .map((n) => text((n as OpsRow)?.body))
        .filter(Boolean)
    : [];
  const next = snapshot
    ? [text(snapshot.next_action), ...recordedNext].filter(Boolean)
    : current.next.map((n) => text(n.body)).filter(Boolean);
  const issue = [...notes]
    .filter((n) => n.task_id === task.id && n.kind === "issue")
    .sort((a, b) =>
      String(b.updated_at || b.created_at || "").localeCompare(
        String(a.updated_at || a.created_at || ""),
      ),
    )[0];
  const capturedIssues = Array.isArray(snapshot?.issues) ? snapshot.issues : [];
  let resultUrl = "";
  for (const candidate of [
    snapshot?.result_url,
    snapshot?.last_file,
    task.result_url,
  ]) {
    try {
      const url = new URL(text(candidate));
      if (["https:", "http:"].includes(url.protocol)) {
        resultUrl = url.href;
        break;
      }
    } catch {
      /* No recorded web link. */
    }
  }
  return {
    next: [...new Set(next)],
    historical: Boolean(snapshot),
    issue: text(issue?.body) || text((capturedIssues[0] as OpsRow)?.body),
    issueDone: issue?.done === true,
    lastNote:
      text(snapshot?.last_note) ||
      text(current.latest?.body) ||
      text(task.notes),
    parkedAt:
      text(snapshot?.paused_at) || text(current.interruption?.created_at),
    reason: text(snapshot?.reason),
    resultUrl,
  };
}
