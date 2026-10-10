export const statuses = ["pending", "running", "completed", "failed"] as const;
export type Status = typeof statuses[number];
export type Workspace = "PERSONAL" | "FRENGLE";
export type Task = { id: string; title: string; notes: string; status: Status; priority: "high" | "normal" | "low"; due_date: string | null; created_at: string };
export type TaskInput = Omit<Task, "id" | "created_at">;
export const statusLabels: Record<Status, string> = { pending: "대기", running: "진행 중", completed: "완료", failed: "실패" };
export function parseTask(input: unknown): TaskInput {
  if (!input || typeof input !== "object") throw new Error("업무 정보를 확인해 주세요.");
  const v = input as Record<string, unknown>;
  if (typeof v.title !== "string" || !v.title.trim() || v.title.trim().length > 120) throw new Error("업무 제목은 1~120자로 입력해 주세요.");
  if (typeof v.notes !== "string" || v.notes.length > 2000) throw new Error("메모는 2,000자 이하로 입력해 주세요.");
  if (!statuses.includes(v.status as Status)) throw new Error("올바른 상태를 선택해 주세요.");
  if (!["high", "normal", "low"].includes(v.priority as string)) throw new Error("우선순위를 확인해 주세요.");
  if (v.due_date !== null) {
    if (typeof v.due_date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v.due_date)) throw new Error("마감일을 확인해 주세요.");
    const d = new Date(v.due_date + "T00:00:00Z");
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0,10) !== v.due_date) throw new Error("존재하는 날짜를 입력해 주세요.");
  }
  return { title: v.title.trim(), notes: v.notes.trim(), status: v.status as Status, priority: v.priority as TaskInput["priority"], due_date: v.due_date as string | null };
}
export function storageKey(workspace: Workspace) { return `my-ops:demo:v1:${workspace}`; }
