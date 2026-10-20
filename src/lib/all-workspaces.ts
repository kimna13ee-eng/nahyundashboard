import { automationReceiptRows } from "./automation-receipts.ts";
import { type OpsRow } from "./ops.ts";
import { isArchivedProjectProcess } from "./project-process-view.ts";
import { workspaceApiPath, type ApiWorkspace } from "./workspace-api.ts";

export const allWorkspaces = ["PERSONAL", "FRENGLE"] as const;
export const workspaceHome = (workspace: ApiWorkspace) =>
  workspace === "PERSONAL" ? "/" : "/frengle";

export type WorkspaceSnapshot = {
  workspace: ApiWorkspace;
  status: "loading" | "ready" | "signed-out" | "unconfigured" | "error";
  tasks: OpsRow[] | null;
  schedules: OpsRow[] | null;
  results: OpsRow[] | null;
  opsError?: string;
  resultsError?: string;
  message?: string;
  partial: boolean;
};

export function emptyWorkspaceSnapshot(
  workspace: ApiWorkspace,
  status: WorkspaceSnapshot["status"] = "loading",
  message?: string,
): WorkspaceSnapshot {
  return {
    workspace,
    status,
    tasks: null,
    schedules: null,
    results: null,
    partial: false,
    message,
  };
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function rows(value: unknown): value is OpsRow[] {
  return (
    Array.isArray(value) &&
    value.every((row) => record(row) && typeof row.id === "string")
  );
}

class WorkspaceReadError extends Error {
  readonly status: number;
  constructor(status: number) {
    super("워크스페이스 조회 실패");
    this.status = status;
  }
}

/** Each call uses exactly one workspace's existing authenticated API routes. */
export async function loadWorkspaceSnapshot(
  workspace: ApiWorkspace,
  signal: AbortSignal,
  read: typeof fetch = fetch,
): Promise<WorkspaceSnapshot> {
  async function get(path: string) {
    const response = await read(workspaceApiPath(path, workspace), {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      signal,
    });
    if (!response.ok) throw new WorkspaceReadError(response.status);
    const body: unknown = await response.json();
    if (!record(body)) throw new Error("응답 형식 오류");
    return body;
  }
  try {
    const session = await get("/api/session");
    if (session.configured === false)
      return emptyWorkspaceSnapshot(
        workspace,
        "unconfigured",
        "저장소 연결 설정이 필요해요.",
      );
    if (session.configured !== true) throw new Error("인증 응답 형식 오류");
    if (!session.user)
      return emptyWorkspaceSnapshot(
        workspace,
        "signed-out",
        "이 공간에 로그인하면 여기서 함께 볼 수 있어요.",
      );
    if (!record(session.user)) throw new Error("인증 응답 형식 오류");

    const [ops, automation] = await Promise.allSettled([
      get("/api/ops"),
      get("/api/automation-results"),
    ]);
    const accessFailure = [ops, automation].find(
      (result) =>
        result.status === "rejected" &&
        result.reason instanceof WorkspaceReadError &&
        [401, 403].includes(result.reason.status),
    );
    if (accessFailure)
      return emptyWorkspaceSnapshot(
        workspace,
        "signed-out",
        "로그인 상태와 이 공간의 접근 권한을 확인해 주세요.",
      );

    const snapshot = emptyWorkspaceSnapshot(workspace, "ready");
    if (
      ops.status === "fulfilled" &&
      ops.value.workspace === workspace &&
      record(ops.value.data) &&
      rows(ops.value.data.tasks) &&
      rows(ops.value.data.schedules)
    ) {
      snapshot.tasks = ops.value.data.tasks.filter(
        (task) => !isArchivedProjectProcess(task),
      );
      snapshot.schedules = ops.value.data.schedules.filter(
        (schedule) => !schedule.deleted_at,
      );
      snapshot.partial =
        Array.isArray(ops.value.truncated) &&
        ops.value.truncated.some(
          (name) => name === "tasks" || name === "schedules",
        );
    } else
      snapshot.opsError =
        "업무·일정을 불러오지 못했어요. 해당 공간의 연결 상태를 확인해 주세요.";
    if (
      automation.status === "fulfilled" &&
      automation.value.ready === true &&
      rows(automation.value.results)
    )
      snapshot.results = automationReceiptRows(
        automation.value.results,
        workspace,
      );
    else snapshot.resultsError = "자동화 결과를 불러오지 못했어요.";
    return snapshot;
  } catch {
    return emptyWorkspaceSnapshot(
      workspace,
      "error",
      signal.aborted
        ? "조회 시간이 초과됐어요. 다시 새로고침해 주세요."
        : "연결 상태를 확인한 뒤 다시 새로고침해 주세요.",
    );
  }
}

export type WorkspaceCalendarItem = OpsRow & {
  workspace: ApiWorkspace;
  source: string;
};

/** Only actual saved schedules and task due dates; no synthetic recurrence. */
export function workspaceCalendarItems(
  snapshot: WorkspaceSnapshot,
): WorkspaceCalendarItem[] {
  if (snapshot.status !== "ready") return [];
  const schedules = (snapshot.schedules || [])
    .filter((row) => {
      const start = Date.parse(String(row.starts_at));
      const end = Date.parse(String(row.ends_at));
      return (
        Number.isFinite(start) &&
        Number.isFinite(end) &&
        end > start &&
        !row.deleted_at
      );
    })
    .map((row) => ({ ...row, source: "일정", workspace: snapshot.workspace }));
  const deadlines = (snapshot.tasks || [])
    .filter((row) => {
      const day = row.due_date;
      return (
        !isArchivedProjectProcess(row) &&
        typeof day === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(day) &&
        Number.isFinite(Date.parse(`${day}T00:00:00+09:00`)) &&
        new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day
      );
    })
    .map((row) => ({
      id: `due-${row.id}`,
      title: row.title,
      workspace: snapshot.workspace,
      source: "업무 마감",
      starts_at: `${row.due_date}T00:00:00+09:00`,
      ends_at: `${row.due_date}T23:59:59+09:00`,
    }));
  return [...schedules, ...deadlines];
}
