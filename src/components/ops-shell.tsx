"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { OpsDialog } from "./ops-dialog";
import { OpsFormActions } from "./ops-form-actions";
import { DesktopDownload } from "./desktop-download";
import { AppRecoveryControls } from "./app-recovery-controls";
import { workspaceApiPath, type ApiWorkspace } from "@/lib/workspace-api";
import { occurrences } from "@/lib/phase2";
import { Phase2Panel } from "./phase2-panel";
import { AnalyticsPanel } from "./analytics-panel";
import { ContentAnalyticsPanel } from "./content-analytics-panel";
import { PersonalSheetsPanel } from "./personal-sheets-panel";
import {
  YogaReminderPanel,
  disconnectThisDevicePush,
} from "./yoga-reminder-panel";
import { journalEntries } from "@/lib/journal-report";
import {
  dailyTaskGroups,
  dailyTaskSummary,
  seoulWeek,
  taskCompletionTime,
  weeklyScheduleRows,
  weeklyScheduleTime,
} from "@/lib/overview-summary";
import { AutomationResultsPanel } from "./automation-results-panel";
import { JournalExport } from "./journal-export";
import { calendarLabel, calendarTitle } from "@/lib/mobile-calendar";
import { contentCalendar } from "@/lib/personal-content";
import { WorkflowInbox, ParkFields, parkForm } from "./workflow-inbox";
import { quickStartContext } from "@/lib/quick-start";
import {
  taskCategoryLabels,
  parseProcessSteps,
  processSummary,
} from "@/lib/task-process";
import { TaskProcessEditor } from "./task-process-editor";
import { ProjectProcessEditor } from "./project-process-editor";
import { projectCategoryLabels } from "@/lib/project-process";
import {
  isProjectProcess,
  isArchivedProjectProcess,
  projectProcessSteps,
  orderedProjectTasks,
} from "@/lib/project-process-view";
import {
  addSeoulMinutes,
  scheduleDefaults,
  scheduleRangeError,
} from "@/lib/schedule-form";
import {
  scheduleCategories,
  scheduleCategoryLabels,
} from "@/lib/schedule-category";
import "@/app/schedule-category.css";
import {
  LayoutDashboard,
  CalendarDays,
  FolderKanban,
  Workflow,
  FileSpreadsheet,
  NotebookPen,
  Library,
  ChartNoAxesCombined,
  Settings,
  Plus,
  Play,
  Pause,
  Square,
  ArrowUpRight,
  Command,
  Star,
  Copy,
  Trash2,
  Pencil,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  intervalSeconds,
  intervalSecondsForDay,
  longRunningInterval,
  scheduleOverlaps,
  seoulDate,
  uuid,
  type OpsRow,
  type OpsData,
  type Resource,
} from "@/lib/ops";
import { statusLabels, type Status } from "@/lib/domain";
const menus = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "projects", label: "Projects", icon: FolderKanban },
  { id: "automations", label: "Automations", icon: Workflow },
  { id: "personal-sheets", label: "Content Studio", icon: FileSpreadsheet },
  { id: "journal", label: "Work Journal", icon: NotebookPen },
  { id: "library", label: "Library", icon: Library },
  { id: "analytics", label: "Analytics", icon: ChartNoAxesCombined },
  { id: "settings", label: "Settings", icon: Settings },
];
type Editor = {
  resource: Resource;
  row?: OpsRow;
  taskId?: string;
  kind?: string;
  dueDate?: string;
  scheduleDate?: string;
};
const text = (v: unknown) => String(v ?? "");
type ScheduleCategory = (typeof scheduleCategories)[number];
function calendarCategory(row: OpsRow): ScheduleCategory {
  if (row.source === "업무 마감" || text(row.source).startsWith("콘텐츠"))
    return "work";
  const value = text(row.category) as ScheduleCategory;
  return scheduleCategories.includes(value) ? value : "other";
}
function scheduleVideoLink(value: unknown) {
  try {
    const url = new URL(text(value));
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
function dateTime(v: unknown) {
  return v
    ? new Intl.DateTimeFormat("ko-KR", {
        timeZone: "Asia/Seoul",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(text(v)))
    : "—";
}
function clock(seconds: number) {
  return `${Math.floor(seconds / 3600)
    .toString()
    .padStart(2, "0")}:${Math.floor((seconds % 3600) / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;
}
function localDateTime(v: unknown) {
  if (!v) return `${seoulDate()}T09:00`;
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(text(v)));
  return parts.replace(" ", "T");
}
async function api(path: string, method = "GET", body?: unknown) {
  const r = await fetch(workspaceApiPath(path), {
    method,
    signal: method === "GET" ? AbortSignal.timeout(20000) : undefined,
    cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok)
    throw new Error(
      r.status === 401
        ? "인증이 만료되었습니다. 설정에서 다시 로그인해 주세요."
        : data.error || "요청 실패",
    );
  return data;
}
export function OpsShell({
  workspace = "PERSONAL",
}: {
  workspace?: ApiWorkspace;
}) {
  const router = useRouter();
  const space = workspace;
  const [view, setView] = useState("overview"),
    [data, setData] = useState<OpsData>({}),
    [user, setUser] = useState<{ email?: string } | null>(null),
    [configured, setConfigured] = useState<boolean | null>(null);
  const [authState, setAuthState] = useState<
    "INITIALIZING" | "AUTHENTICATED" | "UNAUTHENTICATED" | "ERROR"
  >("INITIALIZING");
  const [calendarDetail, setCalendarDetail] = useState<OpsRow | null>(null);
  const [linkedSchedule, setLinkedSchedule] = useState<string | null>(null);
  const noteWrites = useRef(new Set<string>());
  const startSubmit = useRef(false);
  const completionSubmit = useRef(false);
  const [contentFocus, setContentFocus] = useState<string | undefined>();
  const [taskClassification, setTaskClassification] = useState(false);
  const [taskProcessReady, setTaskProcessReady] = useState(false);
  const [projectProcessReady, setProjectProcessReady] = useState(false);
  const [scheduleCategoryReady, setScheduleCategoryReady] = useState(false);
  const [automationResults, setAutomationResults] = useState<OpsRow[]>([]);
  const [automationReady, setAutomationReady] = useState(false);
  useEffect(() => {
    if (!user || !["overview", "automations"].includes(view)) return;
    let mounted = true;
    const interval = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const result = await api("/api/automation-results");
        if (mounted) {
          setAutomationResults(result.results || []);
          setAutomationReady(result.ready === true);
        }
      } catch {
        if (mounted) setAutomationReady(false);
      }
    }, 30000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [user, space, view]);
  const [taskTestClassification, setTaskTestClassification] = useState(false);
  const [libraryWorkflow, setLibraryWorkflow] = useState(false);
  const [workflowReady, setWorkflowReady] = useState(false);
  const [timerGuardReady, setTimerGuardReady] = useState(false);
  const [workflowChecked, setWorkflowChecked] = useState(false);
  const [dataReady, setDataReady] = useState(false);
  const [workflowData, setWorkflowData] = useState<OpsData>({});
  const [captureOpen, setCaptureOpen] = useState(false);
  const [parkOpen, setParkOpen] = useState<OpsRow | null>(null);
  const [excludeJournalTests, setExcludeJournalTests] = useState(true);
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [editor, setEditor] = useState<Editor | null>(null),
    [detail, setDetail] = useState<string | null>(null),
    [tab, setTab] = useState("Overview"),
    [project, setProject] = useState("all"),
    [search, setSearch] = useState(""),
    [libTab, setLibTab] = useState("prompt"),
    [calendarView, setCalendarView] = useState("month"),
    [calendarCategoryFilter, setCalendarCategoryFilter] = useState<
      ScheduleCategory | "all"
    >("all"),
    [day, setDay] = useState(seoulDate()),
    [tick, setTick] = useState(() => Date.now()),
    [offset, setOffset] = useState(0),
    [summary, setSummary] = useState<OpsRow | null>(null),
    [moreMenu, setMoreMenu] = useState(false),
    [deleteTarget, setDeleteTarget] = useState<{
      resource: Resource;
      row: OpsRow;
    } | null>(null),
    [truncated, setTruncated] = useState<string[]>([]);
  const generation = useRef(0);
  const backgroundBusy = useRef(false);
  useEffect(() => {
    backgroundBusy.current = busy;
  }, [busy]);
  const pendingTimer = useRef<{ key: string; requestId: string } | null>(null);
  const clearAccountData = useCallback(() => {
    generation.current++;
    setData({});
    setDataReady(false);
    setWorkflowData({});
    setWorkflowReady(false);
    setWorkflowChecked(false);
    setTimerGuardReady(false);
    setAutomationResults([]);
    setAutomationReady(false);
    setProjectProcessReady(false);
  }, []);
  const rows = (name: string) => data[name] || [];
  const tasks = rows("tasks"),
    listedTasks = tasks.filter((task) => !isArchivedProjectProcess(task)),
    projects = rows("projects"),
    notes = rows("task_notes"),
    sessions = rows("work_sessions"),
    intervals = rows("session_intervals"),
    events = rows("session_events"),
    library = rows("library_items"),
    schedules = rows("schedules"),
    deletedSchedules = rows("deleted_schedules").filter(
      (schedule) => Date.parse(text(schedule.purge_after)) > tick + offset,
    );
  const active = sessions.find((s) => s.status === "ACTIVE"),
    selected = tasks.find((t) => t.id === detail);
  const activeTask = tasks.find((t) => t.id === active?.task_id);
  const [recovery, setRecovery] = useState(false);
  const [quickLog, setQuickLog] = useState(false);
  const [resumeTask, setResumeTask] = useState<string | null>(null);
  const resumeTarget = tasks.find((t) => t.id === resumeTask);
  const staleInterval = active
    ? longRunningInterval(intervals, active.id, tick + offset)
    : undefined;
  const canWrite =
    Boolean(user) &&
    authState === "AUTHENTICATED" &&
    configured === true &&
    dataReady &&
    !busy &&
    !loading;
  const activeSeconds = active
    ? intervalSeconds(
        intervals.filter((i) => i.session_id === active.id),
        tick + offset,
      )
    : 0;
  const load = useCallback(async () => {
    const token = ++generation.current;
    setLoading(true);
    try {
      const [result, workflow, automation] = await Promise.all([
        api("/api/ops?workspace=PERSONAL"),
        api("/api/workflow?workspace=PERSONAL").catch(() => ({
          ready: false,
          data: {},
        })),
        api("/api/automation-results").catch(() => ({
          ready: false,
          results: [],
        })),
      ]);
      if (token !== generation.current) return;
      setData(result.data);
      setAutomationResults(automation.results || []);
      setAutomationReady(automation.ready === true);
      setTimerGuardReady(result.timerGuardReady === true);
      setDataReady(true);
      setWorkflowReady(workflow.ready === true);
      setWorkflowChecked(true);
      setWorkflowData(workflow.data || {});
      setTaskClassification(result.taskClassification === true);
      setTaskProcessReady(result.taskProcessReady === true);
      setProjectProcessReady(result.projectProcessReady === true);
      setScheduleCategoryReady(result.scheduleCategoryReady === true);
      setTaskTestClassification(result.taskTestClassification === true);
      setLibraryWorkflow(result.libraryWorkflow === true);
      setOffset(Date.parse(result.serverNow) - Date.now());
      setTruncated(result.truncated);
      setError("");
      return true;
    } catch (e) {
      if (token === generation.current) {
        setError(e instanceof Error ? e.message : "불러오기 실패");
        setData({});
        setDataReady(false);
        setTimerGuardReady(false);
        setWorkflowChecked(true);
        setWorkflowData({});
        setWorkflowReady(false);
      }
      return false;
    } finally {
      if (token === generation.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    let mounted = true;
    const params = new URLSearchParams(window.location.search);
    const requestedView = params.get("view");
    if (
      requestedView &&
      menus.some((menu) => menu.id === requestedView) &&
      (workspace === "PERSONAL" || requestedView !== "personal-sheets")
    )
      queueMicrotask(() => setView(requestedView));
    const linkedDay = params.get("date") || "";
    const parsedDay = Date.parse(`${linkedDay}T00:00:00Z`);
    if (
      params.get("view") === "calendar" &&
      /^\d{4}-\d{2}-\d{2}$/.test(linkedDay) &&
      Number.isFinite(parsedDay) &&
      new Date(parsedDay).toISOString().slice(0, 10) === linkedDay
    ) {
      queueMicrotask(() => {
        if (!mounted) return;
        setView("calendar");
        setCalendarView("day");
        setDay(linkedDay);
        const scheduleId = params.get("schedule");
        if (uuid(scheduleId)) setLinkedSchedule(scheduleId);
      });
    }
    api("/api/session")
      .then((s) => {
        if (mounted) {
          setConfigured(s.configured);
          setUser(s.user);
          setAuthState(s.user ? "AUTHENTICATED" : "UNAUTHENTICATED");
        }
      })
      .catch((e) => {
        if (mounted) {
          setError(e.message);
          setAuthState("ERROR");
        }
      });
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") setTick(Date.now());
    }, 1000);
    return () => {
      mounted = false;
      clearInterval(timer);
      // Request generation counter, not a DOM ref.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++;
    };
  }, [workspace]);
  useEffect(() => {
    if (
      !linkedSchedule ||
      !dataReady ||
      loading ||
      !user ||
      authState !== "AUTHENTICATED" ||
      view !== "calendar"
    )
      return;
    let mounted = true;
    const linked = (data.schedules || []).find(
      (item) => item.id === linkedSchedule,
    );
    queueMicrotask(() => {
      if (!mounted) return;
      if (linked) setCalendarDetail({ ...linked, source: "일정" });
      else
        setNotice("해당 일정이 삭제되었거나 현재 계정에서 조회되지 않습니다.");
      setLinkedSchedule(null);
    });
    return () => {
      mounted = false;
    };
  }, [linkedSchedule, dataReady, loading, user, authState, data, space, view]);
  useEffect(() => {
    if (user) {
      queueMicrotask(() => {
        void load();
      });
      let lastRefresh = 0;
      const focus = () => {
        if (
          document.visibilityState !== "visible" ||
          !navigator.onLine ||
          backgroundBusy.current ||
          document.querySelector("dialog[open]")
        )
          return;
        if (Date.now() - lastRefresh < 2000) return;
        lastRefresh = Date.now();
        void (async () => {
          try {
            const session = await api("/api/session");
            setAuthState(session.user ? "AUTHENTICATED" : "UNAUTHENTICATED");
            if (session.user?.email !== user?.email) {
              clearAccountData();
              setUser(session.user);
            }
            if (session.user) await load();
            else {
              setData({});
              setDataReady(false);
              setWorkflowData({});
              setWorkflowReady(false);
              setTimerGuardReady(false);
            }
          } catch {
            setAuthState("ERROR");
            setError(
              "인증 또는 연결 상태를 확인하지 못했습니다. 새로고침해 주세요.",
            );
          }
        })();
      };
      window.addEventListener("focus", focus);
      window.addEventListener("online", focus);
      document.addEventListener("visibilitychange", focus);
      const refresh = setInterval(focus, 30000);
      return () => {
        // Request generation counter, not a DOM ref.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        generation.current++;
        window.removeEventListener("focus", focus);
        window.removeEventListener("online", focus);
        document.removeEventListener("visibilitychange", focus);
        clearInterval(refresh);
      };
    }
  }, [user, load, clearAccountData]);
  const mutate = useCallback(
    async (body: unknown, method = "POST") => {
      setBusy(true);
      setError("");
      try {
        await api("/api/ops?workspace=PERSONAL", method, body);
        setEditor(null);
        setDeleteTarget(null);
        setSummary(null);
        const refreshed = await load();
        setNotice(
          refreshed
            ? "서버 저장 및 DB 재조회가 확인되었습니다."
            : "서버 저장은 확인됐으나 재조회에 실패했습니다. 다시 새로고침해 주세요.",
        );
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "저장 실패");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [load],
  );
  async function timer(
    command: string,
    taskId?: string,
    summaryText = "",
    context?: Record<string, unknown>,
    expectedSessionId = command === "start" ? null : active?.id || null,
  ) {
    if (!timerGuardReady) {
      setError(
        "타이머 보호 SQL010 적용·연결 확인이 필요합니다. DB 새로고침해 주세요.",
      );
      return false;
    }
    const payload = {
      action: "timer",
      command,
      task_id: taskId || null,
      expected_session_id: expectedSessionId,
      summary: summaryText,
      context: context || {},
    };
    const key = JSON.stringify(payload);
    const requestId =
      pendingTimer.current?.key === key
        ? pendingTimer.current.requestId
        : crypto.randomUUID();
    pendingTimer.current = { key, requestId };
    const ok = await mutate({ ...payload, request_id: requestId });
    if (ok && pendingTimer.current?.requestId === requestId)
      pendingTimer.current = null;
    return ok;
  }
  async function workflowAction(body: unknown) {
    setBusy(true);
    setError("");
    try {
      await api("/api/workflow?workspace=PERSONAL", "POST", body);
      const refreshed = await load();
      setNotice(
        refreshed
          ? "서버 저장 및 DB 재조회가 확인되었습니다."
          : "저장됐으나 재조회 실패. 다시 새로고침해 주세요.",
      );
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function login(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      await api("/api/auth", "POST", {
        email: f.get("email"),
        password: f.get("password"),
      });
      const session = await api("/api/session");
      clearAccountData();
      setUser(session.user);
      setAuthState(session.user ? "AUTHENTICATED" : "UNAUTHENTICATED");
      setNotice(`${space} 계정 로그인 완료`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "로그인 실패");
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    try {
      if (space === "PERSONAL")
        await disconnectThisDevicePush().catch(() => undefined);
      await api("/api/auth", "POST", { action: "logout" });
      clearAccountData();
      setUser(null);
      setCalendarDetail(null);
      setLinkedSchedule(null);
      setAuthState("UNAUTHENTICATED");
      pendingTimer.current = null;
      setCaptureOpen(false);
      setParkOpen(null);
      setSummary(null);
      setResumeTask(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "로그아웃 실패");
    } finally {
      setBusy(false);
    }
  }
  function move(id: string) {
    setLinkedSchedule(null);
    setContentFocus(undefined);
    setView(id);
    setDetail(null);
    setSearch("");
    setNotice("");
  }
  const visibleMenus = menus.filter(
    (menu) => menu.id !== "personal-sheets" || space === "PERSONAL",
  );
  const title =
    view === "legacy-content"
      ? "기존 콘텐츠 기록"
      : menus.find((m) => m.id === view)?.label || "Overview";
  function openTaskEditor(task: OpsRow) {
    if (isProjectProcess(task)) {
      const parent = projects.find((p) => p.id === task.project_id);
      if (parent) setEditor({ resource: "projects", row: parent });
    } else setEditor({ resource: "tasks", row: task });
  }
  function taskCategoryLabel(task: OpsRow) {
    if (isProjectProcess(task)) {
      const parent = projects.find((p) => p.id === task.project_id);
      return (
        projectCategoryLabels[
          parent?.project_category as keyof typeof projectCategoryLabels
        ] || "기타"
      );
    }
    return (
      taskCategoryLabels[
        task.task_category as keyof typeof taskCategoryLabels
      ] || "기타"
    );
  }
  async function toggleTaskCompletion(task: OpsRow) {
    if (completionSubmit.current) return;
    completionSubmit.current = true;
    try {
      if (active?.task_id === task.id && task.status !== "completed") {
        if (!(await timer("finish", task.id, "", {}, active.id))) return;
      }
      await mutate(
        {
          resource: "tasks",
          id: task.id,
          value: {
            ...task,
            status: task.status === "completed" ? "pending" : "completed",
          },
        },
        "PATCH",
      );
    } finally {
      completionSubmit.current = false;
    }
  }
  const taskActions = (t: OpsRow, showRecord = true) => (
    <div className="ops-actions">
      <button
        className="ops-icon"
        title="작업 시작 / 재개"
        aria-label={`${t.title} 작업 시작`}
        disabled={
          !canWrite ||
          !timerGuardReady ||
          active?.task_id === t.id ||
          isArchivedProjectProcess(t) ||
          (isProjectProcess(t) && t.status === "completed")
        }
        onClick={() => setResumeTask(t.id)}
      >
        <Play size={15} />
      </button>
      {showRecord ? (
        <button
          className="ops-task-record"
          aria-label={`${t.title} 작업 기록`}
          onClick={() => {
            setDetail(t.id);
            setTab("Overview");
            setView("projects");
          }}
        >
          기록
        </button>
      ) : null}
      {!isProjectProcess(t) ? (
        <button
          className="ops-icon ops-danger"
          aria-label={`${t.title} 삭제`}
          disabled={!canWrite}
          onClick={() => setDeleteTarget({ resource: "tasks", row: t })}
        >
          <Trash2 size={15} />
        </button>
      ) : null}
    </div>
  );
  const taskList = (list: OpsRow[]) => (
    <div className="ops-list">
      {list.length ? (
        list.map((t) => (
          <div className="ops-task" key={t.id}>
            <button
              className="ops-task-complete"
              disabled={!canWrite || isArchivedProjectProcess(t)}
              aria-label={`${t.title} ${t.status === "completed" ? "완료 취소" : "완료"}`}
              onClick={() => {
                // Only a click invokes this callback; the request ref is never read during render.
                // eslint-disable-next-line react-hooks/refs
                void toggleTaskCompletion(t);
              }}
            >
              {t.status === "completed" ? "완료 취소" : "완료"}
            </button>
            <button
              className="ops-task-title"
              disabled={!canWrite}
              aria-label={`${t.title} 수정`}
              onClick={() => openTaskEditor(t)}
            >
              <strong>{text(t.title)}</strong>
              <small>
                {text(projects.find((p) => p.id === t.project_id)?.title) ||
                  "기존 업무"}{" "}
                · {taskCategoryLabel(t)}
                {isProjectProcess(t)
                  ? ` · ${Number(t.project_step_order) + 1}단계`
                  : ` · ${text(t.due_date) || "마감일 없음"}`}
                {t.status === "completed" && taskCompletionTime(t) ? (
                  <span className="ops-task-progress">
                    완료 {dateTime(taskCompletionTime(t))}
                  </span>
                ) : null}
                {!isProjectProcess(t) &&
                Array.isArray(t.process_steps) &&
                t.process_steps.length ? (
                  <span className="ops-task-progress">
                    현재 단계:{" "}
                    {processSummary(parseProcessSteps(t.process_steps)).current
                      ?.title || "전체 단계 완료"}{" "}
                    ·{" "}
                    {
                      processSummary(parseProcessSteps(t.process_steps))
                        .completed
                    }
                    /{t.process_steps.length} 완료
                  </span>
                ) : null}
              </small>
            </button>
            <span className={`ops-badge ${text(t.status)}`}>
              {statusLabels[t.status as Status] || text(t.status)}
            </span>
            {taskActions(t)}
          </div>
        ))
      ) : (
        <Empty label="표시할 프로세스나 기존 업무가 없습니다." />
      )}
    </div>
  );
  const heads = (name: string, sub: string, action?: React.ReactNode) => (
    <div className="ops-section-head">
      <div>
        <h2>{name}</h2>
        <p>{sub}</p>
      </div>
      {action}
    </div>
  );
  const create = (
    resource: Resource,
    label: string,
    options: Omit<Editor, "resource" | "row"> = {},
  ) => (
    <button
      className="ops-primary"
      disabled={!canWrite || (resource === "projects" && !projectProcessReady)}
      onClick={() => setEditor({ resource, ...options })}
    >
      <Plus size={15} />
      {label}
    </button>
  );
  const itemActions = (resource: Resource, row: OpsRow) => (
    <div className="ops-actions">
      <button
        className="ops-icon"
        disabled={!canWrite}
        aria-label={`${row.title || "메모"} 수정`}
        onClick={() => setEditor({ resource, row, taskId: text(row.task_id) })}
      >
        <Pencil size={15} />
      </button>
      <button
        className="ops-icon ops-danger"
        disabled={!canWrite}
        aria-label={`${row.title || "메모"} 삭제`}
        onClick={() => setDeleteTarget({ resource, row })}
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
  const scheduleActions = (row: OpsRow) => (
    <div className="ops-actions">
      <button
        className="ops-icon"
        disabled={!canWrite}
        aria-label={`${row.title || "일정"} 수정`}
        onClick={() => setEditor({ resource: "schedules", row })}
      >
        <Pencil size={15} />
      </button>
      <button
        className="ops-icon ops-danger"
        disabled={!canWrite}
        aria-label={`${row.title || "일정"} 휴지통으로 이동`}
        onClick={() =>
          void mutate({ resource: "schedules", id: row.id }, "DELETE")
        }
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
  const today = seoulDate(new Date(tick + offset));
  const dailySummary = dailyTaskSummary(tasks, today);
  const todayTasks = dailyTaskGroups(tasks, today);
  const overviewWeek = seoulWeek(today);
  const filteredTasks = orderedProjectTasks(
    listedTasks.filter(
      (t) =>
        (project === "all" || t.project_id === project) &&
        text(t.title).toLowerCase().includes(search.toLowerCase()),
    ),
  );
  const [calendarExtra, setCalendarExtra] = useState<{
    key: string;
    data: OpsData;
    ready: boolean;
    error: string;
    truncated: string[];
  }>({ key: "", data: {}, ready: false, error: "", truncated: [] });
  const calendarKey = (user?.email || "signed-out") + ":" + space;
  const receiveCalendarData = useCallback(
    (data: OpsData) => {
      setCalendarExtra({
        key: calendarKey,
        data,
        ready: true,
        error: "",
        truncated: [],
      });
    },
    [calendarKey],
  );
  useEffect(() => {
    if (!user || view !== "overview") return;
    const controller = new AbortController();
    let requestSequence = 0;
    let activeRequest: AbortController | null = null;
    async function refreshOverviewCalendar(): Promise<boolean> {
      const sequence = ++requestSequence;
      activeRequest?.abort();
      const requestController = new AbortController();
      activeRequest = requestController;
      try {
        const response = await fetch(
          workspaceApiPath("/api/phase2?workspace=PERSONAL"),
          {
            cache: "no-store",
            signal: AbortSignal.any([
              controller.signal,
              requestController.signal,
              AbortSignal.timeout(20000),
            ]),
          },
        );
        const result = await response.json();
        if (!response.ok)
          throw new Error(
            result.error || "반복·콘텐츠 일정을 불러오지 못했습니다.",
          );
        if (controller.signal.aborted || sequence !== requestSequence)
          return false;
        setCalendarExtra({
          key: calendarKey,
          data: result.data || {},
          ready: true,
          error: "",
          truncated: result.truncated || [],
        });
        return true;
      } catch (cause) {
        if (controller.signal.aborted || sequence !== requestSequence)
          return false;
        setCalendarExtra({
          key: calendarKey,
          data: {},
          ready: false,
          error:
            cause instanceof Error
              ? cause.message
              : "반복·콘텐츠 일정을 불러오지 못했습니다.",
          truncated: [],
        });
        return false;
      } finally {
        if (sequence === requestSequence) activeRequest = null;
      }
    }
    const refresh = (event: Event) => {
      if (backgroundBusy.current || document.querySelector("dialog[open]"))
        return;
      const promise = refreshOverviewCalendar();
      (
        event as CustomEvent<{ waits?: Promise<boolean>[] }>
      ).detail?.waits?.push(promise);
      void promise;
    };
    window.addEventListener("myops:refresh", refresh);
    void refreshOverviewCalendar();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible" && !activeRequest)
        void refreshOverviewCalendar();
    }, 30000);
    return () => {
      controller.abort();
      activeRequest?.abort();
      window.removeEventListener("myops:refresh", refresh);
      window.clearInterval(interval);
    };
  }, [calendarKey, user, space, view]);
  const extra =
    calendarExtra.key === calendarKey && user ? calendarExtra.data : {};
  const calendarAnchor = view === "overview" ? today : day;
  const recurrenceFrom =
    view === "overview"
      ? overviewWeek.from
      : calendarAnchor.slice(0, 7) + "-01";
  const recurrenceTo =
    view === "overview"
      ? overviewWeek.to
      : new Date(Date.parse(calendarAnchor + "T00:00:00Z") + 370 * 86400000)
          .toISOString()
          .slice(0, 10);
  const journalRows = journalEntries(
    data,
    day,
    tick + offset,
    excludeJournalTests,
  );
  const inRange = (s: OpsRow) => scheduleOverlaps(s, day, calendarView);
  const allCalendarItems: (OpsRow & { source: string })[] = [
    ...occurrences(
      extra.recurrence || [],
      extra.exceptions || [],
      recurrenceFrom,
      recurrenceTo,
    ).map((s): OpsRow & { source: string } => ({ ...s, source: "반복 일정" })),
    ...contentCalendar(extra.content || []),
    ...schedules.map(
      (s) => ({ ...s, source: "일정" }) as OpsRow & { source: string },
    ),
    ...listedTasks
      .filter((t) => t.due_date)
      .map((t) => ({
        id: `due-${t.id}`,
        title: t.title,
        is_test: t.is_test,
        status: t.status,
        project_id: t.project_id,
        notes: t.notes,
        starts_at: `${t.due_date}T00:00:00+09:00`,
        ends_at: `${t.due_date}T23:59:59+09:00`,
        source: "업무 마감",
        task: t,
      })),
  ];
  const calendarItems = allCalendarItems
    .filter(inRange)
    .filter(
      (item) =>
        calendarCategoryFilter === "all" ||
        calendarCategory(item) === calendarCategoryFilter,
    )
    .sort((a, b) => text(a.starts_at).localeCompare(text(b.starts_at)));
  const weeklyItems = weeklyScheduleRows(allCalendarItems, today);
  function openWeeklyItem(item: OpsRow) {
    if (item.source === "일정") {
      setEditor({ resource: "schedules", row: item });
    } else if (item.source === "업무 마감" && item.task) {
      openTaskEditor(item.task as OpsRow);
    } else setCalendarDetail(item);
  }
  function dayShift(delta: number) {
    if (calendarView === "month") {
      const shifted = new Date(
        Date.UTC(
          Number(day.slice(0, 4)),
          Number(day.slice(5, 7)) - 1 + Math.sign(delta),
          1,
        ),
      );
      setDay(shifted.toISOString().slice(0, 10));
      return;
    }
    setDay(
      new Date(Date.parse(day + "T00:00:00Z") + delta * 86400000)
        .toISOString()
        .slice(0, 10),
    );
  }
  return (
    <div className="editorial">
      <aside className="ops-sidebar">
        <Link
          href={space === "FRENGLE" ? "/frengle" : "/"}
          className="ops-brand"
        >
          <Command size={24} />
          MY OPS <small>OS / 01</small>
        </Link>
        <span className="ops-caption">MY OPERATING SPACE</span>
        <nav aria-label="주 메뉴">
          {visibleMenus.map((m) => (
            <button
              key={m.id}
              aria-current={view === m.id ? "page" : undefined}
              className={view === m.id ? "active" : ""}
              onClick={() => move(m.id)}
            >
              <m.icon size={18} />
              {m.label}
            </button>
          ))}
        </nav>
        <div className="ops-user">
          <strong>{space} 전용</strong>
          <small>
            {user?.email ||
              (authState === "INITIALIZING" ? "MY OPS 시작 중" : "로그인 전")}
          </small>
          {user ? (
            <button disabled={busy} onClick={logout}>
              로그아웃
            </button>
          ) : (
            <button onClick={() => move("settings")}>로그인 / 연결</button>
          )}
        </div>
      </aside>
      <div className="ops-main-shell">
        <header className="ops-top">
          <div className="ops-header-workspace">
            {" "}
            <label>
              워크스페이스
              <select
                aria-label="워크스페이스"
                value={space}
                disabled={busy}
                onChange={(e) => {
                  const next =
                    e.target.value === "FRENGLE" ? "FRENGLE" : "PERSONAL";
                  if (next === space) return;
                  const nextView =
                    view === "personal-sheets" || view === "legacy-content"
                      ? "overview"
                      : view;
                  const params = new URLSearchParams({ view: nextView });
                  if (nextView === "calendar") params.set("date", day);
                  router.push(
                    `${next === "FRENGLE" ? "/frengle" : "/"}?${params}`,
                  );
                }}
              >
                <option>PERSONAL</option>
                <option>FRENGLE</option>
              </select>
            </label>
          </div>
          <div className="ops-header-primary" aria-label="빠른 업무 액션">
            {" "}
            <button
              disabled={!canWrite || !tasks.length}
              onClick={() => {
                setError("");
                setQuickLog(true);
              }}
            >
              Quick Log
            </button>
          </div>
          <div className="ops-header-utilities" aria-label="앱 관리">
            {" "}
            {space === "PERSONAL" ? (
              <DesktopDownload compact signedIn={Boolean(user)} />
            ) : null}
            <AppRecoveryControls
              loading={loading || busy || authState === "INITIALIZING"}
              refresh={async () => {
                const session = await api("/api/session").catch(() => null);
                if (session) {
                  if (session.user?.email !== user?.email) {
                    clearAccountData();
                    setUser(session.user);
                  }
                  setConfigured(session.configured);
                }
                if (session?.user) {
                  if (!(await load()))
                    throw new Error(
                      "데이터 조회 실패. 연결 후 다시 시도해 주세요.",
                    );
                  setAuthState("AUTHENTICATED");
                  const waits: Promise<boolean>[] = [];
                  window.dispatchEvent(
                    new CustomEvent("myops:refresh", { detail: { waits } }),
                  );
                  if ((await Promise.all(waits)).some((ok) => !ok))
                    throw new Error(
                      "현재 화면 데이터 조회 실패. 다시 시도해 주세요.",
                    );
                } else {
                  setAuthState(session ? "UNAUTHENTICATED" : "ERROR");
                  throw new Error(
                    session
                      ? `설정에서 ${space} 계정으로 로그인해 주세요.`
                      : "인증 상태 조회 실패. 연결 후 다시 시도해 주세요.",
                  );
                }
              }}
            />
            <button
              type="button"
              className="ops-top-label"
              aria-label={
                authState === "INITIALIZING"
                  ? "로그인 상태 확인 중"
                  : user
                    ? `${space} 계정 설정 열기`
                    : `${space} 계정 로그인 열기`
              }
              disabled={authState === "INITIALIZING"}
              onClick={() => move("settings")}
            >
              {authState === "INITIALIZING"
                ? "MY OPS 시작 중 · 인증 복원을 확인하고 있습니다."
                : authState === "ERROR"
                  ? "연결 또는 인증 오류. 데이터 새로고침으로 다시 확인해 주세요."
                  : configured === false
                    ? "Supabase 미연결"
                    : user
                      ? `${space} 계정 설정`
                      : `${space} 계정 로그인`}
            </button>
          </div>
        </header>
        <main className="ops-main">
          {authState === "INITIALIZING" ? (
            <p role="status">
              MY OPS 시작 중 · 로그인 상태를 확인하고 있습니다.
            </p>
          ) : null}
          {authState === "ERROR" ? (
            <p role="alert">
              연결 또는 인증 오류 · 새로고침으로 다시 확인해 주세요.
            </p>
          ) : null}
          <div className="ops-heading">
            <div>
              <small>YOUR WORK, WITH INTENTION.</small>
              <h1>{title}</h1>
              <p>
                {view === "overview"
                  ? "오늘의 흐름을 정리하고, 중요한 일에 집중하세요."
                  : `${space === "PERSONAL" ? "개인" : "회사"} 데이터만 저장 · Asia/Seoul`}
              </p>
            </div>
            <span>{today}</span>
          </div>
          {view === "inbox" ? (
            <WorkflowInbox
              items={workflowData.inbox || []}
              projects={projects}
              ready={workflowReady}
              enabled={Boolean(user)}
              busy={busy}
              error={error}
              open={captureOpen}
              setOpen={setCaptureOpen}
              activeTitle={text(activeTask?.title)}
              act={workflowAction}
              canStart={timerGuardReady}
              checking={loading || (Boolean(user) && !workflowChecked)}
              onOpenTask={(id) => {
                setView("projects");
                setDetail(id);
              }}
            />
          ) : null}
          <div className="ops-connection">
            <strong>
              {space === "FRENGLE"
                ? "FRENGLE · 회사 업무 전용"
                : "PERSONAL · 개인 프로젝트 전용"}
            </strong>
            <p>
              {configured === false
                ? "환경변수가 없습니다. 샘플 데이터와 임의의 통계를 표시하지 않습니다."
                : user
                  ? "DB 조회·저장 성공 여부는 요청 결과로 확인합니다. 자동화 데이터에는 수신된 결과를 표시합니다."
                  : `설정에서 ${space} 계정으로 로그인하세요. 로그인 전에는 실제 데이터를 표시하지 않습니다.`}
            </p>
            {user && dataReady && !timerGuardReady ? (
              <p role="status">
                타이머 보호 연결 확인이 필요합니다. SQL010 적용 후 설정에서 DB
                새로고침해 주세요.
              </p>
            ) : null}
            <button onClick={() => move("settings")}>
              설정 <ArrowUpRight size={14} />
            </button>
          </div>
          {error ? (
            <p className="ops-alert bad" role="alert">
              {error}
            </p>
          ) : null}
          {notice ? (
            <p className="ops-alert" role="status">
              {notice}
            </p>
          ) : null}
          {loading ? (
            <p
              className={dataReady ? "sr-only" : "ops-alert"}
              role="status"
              aria-live="polite"
            >
              DB에서 불러오는 중…
            </p>
          ) : null}
          {staleInterval ? (
            <div className="ops-alert" role="status">
              <p>
                8시간 이상 멈추지 않은 타이머가 있습니다:{" "}
                {text(activeTask?.title)}. 작업 상태를 확인해 주세요.
              </p>
              <button disabled={!canWrite} onClick={() => setRecovery(true)}>
                작업 상태 확인
              </button>
            </div>
          ) : null}
          {truncated.length ? (
            <p className="ops-alert bad">
              조회 제한 1,000건을 넘었습니다: {truncated.join(", ")}. 전체
              통계가 아닙니다.
            </p>
          ) : null}
          {view === "overview" ? (
            <>
              <div className="ops-metrics ops-overview-metrics">
                {[
                  ["전체 업무", dailySummary.total],
                  ["오늘 완료", todayTasks.completed.length],
                  [
                    "자동화 데이터",
                    automationReady
                      ? automationResults.filter(
                          (r) =>
                            seoulDate(new Date(String(r.received_at))) ===
                            today,
                        ).length
                      : "미연결",
                  ],
                ].map(([label, value]) => {
                  const contents = (
                    <>
                      <small>{label}</small>
                      <strong>{user && !error ? value : "—"}</strong>
                      {label === "자동화 데이터" ? (
                        <span>
                          수신 결과 확인 <ArrowUpRight size={14} />
                        </span>
                      ) : null}
                      <p>
                        {label === "자동화 데이터"
                          ? `오늘 수신한 ${space === "PERSONAL" ? "Metricool" : "회사 자동화"} 결과 · 최근 100건 기준`
                          : label === "오늘 완료"
                            ? `${today} · 오늘 완료한 업무`
                            : `${today} · 미완료 프로세스와 오늘의 기존 업무`}
                      </p>
                    </>
                  );
                  return label === "자동화 데이터" ? (
                    <button
                      className="ops-card ops-automation-metric"
                      key={label}
                      aria-label="자동화 데이터 · 수신 결과 확인"
                      onClick={() => move("automations")}
                    >
                      {contents}
                    </button>
                  ) : (
                    <div className="ops-card" key={label}>
                      {contents}
                    </div>
                  );
                })}
              </div>
              <p className="ops-overview-metric-note">
                {today} · 전체: 미완료 프로세스와 진행 중·오늘 등록·마감 업무 ·
                완료: 오늘 완료 · 자동화: 수신 결과
              </p>
              <section className="ops-card ops-overview-today">
                {heads(
                  "오늘 할 일",
                  `${today} · 미완료 프로세스와 진행 중 업무는 매일 표시 · 그 외 오늘 등록·마감 기준`,
                  <div
                    className="ops-overview-create-actions"
                    role="group"
                    aria-label="오늘 할 일 등록"
                  >
                    {create("tasks", "업무 등록", { dueDate: today })}
                    {create("projects", "프로젝트 등록")}
                  </div>,
                )}
                {taskList(todayTasks.pending)}
              </section>
              <section className="ops-card ops-overview-completed">
                {heads("오늘 완료 업무", `${today} · 실제 완료한 날짜 기준`)}
                {todayTasks.completed.length ? (
                  taskList(todayTasks.completed)
                ) : (
                  <Empty label="오늘 완료한 업무가 없습니다." />
                )}
              </section>
              <section className="ops-card ops-overview-week">
                {heads(
                  "이번 주 일정",
                  `${overviewWeek.from}–${overviewWeek.days[6]} · 월요일부터 일요일 · 한국시간`,
                  create("schedules", "일정 등록", { scheduleDate: today }),
                )}
                {user &&
                (calendarExtra.key !== calendarKey || !calendarExtra.ready) ? (
                  <p className="ops-week-notice" role="status">
                    {calendarExtra.key === calendarKey && calendarExtra.error
                      ? "반복·콘텐츠 일정을 불러오지 못했습니다. 일반 일정과 업무 마감만 표시합니다."
                      : "반복·콘텐츠 일정을 불러오는 중입니다."}
                  </p>
                ) : null}
                {calendarExtra.key === calendarKey &&
                calendarExtra.truncated.length ? (
                  <p className="ops-week-notice">
                    일부 일정의 조회 범위를 초과해 전체 항목이 표시되지 않을 수
                    있습니다.
                  </p>
                ) : null}
                <div className="ops-week-table-wrap">
                  <table className="ops-week-table">
                    <caption className="sr-only">
                      이번 주 일정. 요일, 항목, 시간 순서
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">요일</th>
                        <th scope="col">항목</th>
                        <th scope="col">시간</th>
                      </tr>
                    </thead>
                    <tbody>
                      {weeklyItems.flatMap(({ day: weekDay, weekday, items }) =>
                        (items.length ? items : [null]).map((item, index) => (
                          <tr
                            key={`${weekDay}:${item?.id || "empty"}`}
                            className={
                              weekDay === today ? "is-today" : undefined
                            }
                          >
                            {index === 0 ? (
                              <th
                                scope="row"
                                rowSpan={Math.max(1, items.length)}
                              >
                                <span>
                                  {weekday}
                                  {weekDay === today ? " · 오늘" : ""}
                                </span>
                                <small>
                                  {weekDay.slice(5).replace("-", "/")}
                                </small>
                              </th>
                            ) : null}
                            <td>
                              {item ? (
                                <>
                                  <button
                                    className="ops-week-item"
                                    disabled={
                                      !canWrite &&
                                      ["일정", "업무 마감"].includes(
                                        text(item.source),
                                      )
                                    }
                                    onClick={() => openWeeklyItem(item)}
                                  >
                                    {text(item.title)}
                                  </button>
                                  <small>{text(item.source)}</small>
                                  <span
                                    className="ops-schedule-category-badge"
                                    data-category={calendarCategory(item)}
                                  >
                                    {
                                      scheduleCategoryLabels[
                                        calendarCategory(item)
                                      ]
                                    }
                                  </span>
                                  {item.source === "일정" ? (
                                    <button
                                      className="ops-week-trash ops-danger"
                                      aria-label={`${item.title} 휴지통으로 이동`}
                                      disabled={!canWrite}
                                      onClick={() =>
                                        void mutate(
                                          {
                                            resource: "schedules",
                                            id: item.id,
                                          },
                                          "DELETE",
                                        )
                                      }
                                    >
                                      <Trash2 size={14} />
                                      삭제
                                    </button>
                                  ) : null}
                                </>
                              ) : (
                                <span className="ops-week-empty">
                                  등록된 일정 없음
                                </span>
                              )}
                            </td>
                            <td>
                              {item ? weeklyScheduleTime(item, weekDay) : "—"}
                            </td>
                          </tr>
                        )),
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
              <AutomationResultsPanel
                workspace={space}
                results={automationResults}
                ready={automationReady}
                enabled={Boolean(user)}
                compact
                onViewAll={() => move("automations")}
                refresh={() => void load()}
              />
              <section className="ops-card">
                {heads(
                  "Quick Start / 중단한 업무",
                  "미완료 다음 액션을 확인하고 이어서 작업하세요.",
                )}
                {activeTask ? (
                  <div className="ops-entry">
                    <strong>진행 중: {text(activeTask.title)}</strong>
                    <button
                      onClick={() => {
                        setView("projects");
                        setDetail(activeTask.id);
                      }}
                    >
                      진행 중인 업무로 돌아가기
                    </button>
                  </div>
                ) : null}
                {sessions
                  .filter((s) => s.status === "PARKED")
                  .map((s) => {
                    const task = tasks.find((t) => t.id === s.task_id);
                    if (
                      !task ||
                      isArchivedProjectProcess(task) ||
                      (isProjectProcess(task) && task.status === "completed")
                    )
                      return null;
                    const context = quickStartContext(
                      task,
                      s,
                      notes,
                      events,
                      workflowData.contexts || [],
                    );
                    return (
                      <div className="ops-entry" key={s.id}>
                        <strong>
                          {text(tasks.find((t) => t.id === s.task_id)?.title)}
                        </strong>
                        <p>
                          {context.historical
                            ? "중단 당시 다음 액션"
                            : "저장된 다음 액션"}
                          : {context.next.join(" · ") || "기록 없음"}
                        </p>
                        {context.lastNote ? (
                          <p>마지막 메모: {context.lastNote}</p>
                        ) : null}
                        {context.issue ? (
                          <p>
                            최근 특이사항{context.issueDone ? " (해결됨)" : ""}:{" "}
                            {context.issue}
                          </p>
                        ) : null}
                        <p>
                          마지막 중단:{" "}
                          {context.parkedAt
                            ? new Date(context.parkedAt).toLocaleString(
                                "ko-KR",
                                { timeZone: "Asia/Seoul" },
                              )
                            : "시각 기록 없음"}{" "}
                          · 사유: {context.reason || "기록 없음"}
                        </p>
                        {context.resultUrl ? (
                          <a
                            href={context.resultUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            연결된 결과물 열기
                          </a>
                        ) : null}
                        <button
                          disabled={!canWrite || !timerGuardReady}
                          onClick={() => setResumeTask(text(s.task_id))}
                        >
                          <Play size={15} />
                          이어하기
                        </button>
                      </div>
                    );
                  })}
                {!sessions.some(
                  (s) =>
                    s.status === "PARKED" &&
                    listedTasks.some(
                      (t) =>
                        t.id === s.task_id &&
                        !(isProjectProcess(t) && t.status === "completed"),
                    ),
                ) ? (
                  <Empty label="중단한 업무가 없습니다." />
                ) : null}
              </section>
            </>
          ) : null}
          {view === "projects" && !selected ? (
            <>
              <div className="ops-toolbar">
                {create("projects", "프로젝트 등록")}
                <input
                  aria-label="프로세스·기존 업무 검색"
                  placeholder="프로세스·기존 업무 검색"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              {!projectProcessReady ? (
                <p className="ops-alert">
                  프로젝트 분류와 프로세스를 사용하려면 저장소 설정을 완료한 뒤
                  새로고침해 주세요.
                </p>
              ) : null}
              <div className="ops-project-grid">
                <button
                  className={`ops-project ${project === "all" ? "selected" : ""}`}
                  onClick={() => setProject("all")}
                >
                  <strong>전체 프로세스·업무</strong>
                  <small>{listedTasks.length}개</small>
                </button>
                {projects.map((p) => {
                  const list = listedTasks.filter((t) => t.project_id === p.id),
                    done = list.filter((t) => t.status === "completed").length,
                    ids = new Set(
                      tasks
                        .filter((t) => t.project_id === p.id)
                        .map((t) => t.id),
                    ),
                    sids = new Set(
                      sessions
                        .filter((s) => ids.has(text(s.task_id)))
                        .map((s) => s.id),
                    );
                  return (
                    <div className="ops-card" key={p.id}>
                      <button
                        className="ops-project"
                        onClick={() => setProject(p.id)}
                      >
                        <strong>{text(p.title)}</strong>
                        <span className="ops-project-category">
                          {projectCategoryLabels[
                            p.project_category as keyof typeof projectCategoryLabels
                          ] || "기타"}
                        </span>
                        <small>
                          {done}/{list.length} 완료 ·{" "}
                          {list.length
                            ? Math.round((done / list.length) * 100)
                            : 0}
                          %
                        </small>
                        <small>
                          작업 시간{" "}
                          {clock(
                            intervalSeconds(
                              intervals.filter((i) =>
                                sids.has(text(i.session_id)),
                              ),
                              tick + offset,
                            ),
                          )}
                        </small>
                      </button>
                      <p className="ops-project-desc">{text(p.description)}</p>
                      {itemActions("projects", p)}
                    </div>
                  );
                })}
              </div>
              <section className="ops-card">
                {heads(
                  "프로젝트 프로세스",
                  "프로젝트에서 단계를 등록하고, 이름을 눌러 수정하세요. 기존 업무도 함께 표시합니다.",
                )}
                {taskList(filteredTasks)}
              </section>
            </>
          ) : null}
          {view === "projects" && selected ? (
            <section className="ops-card">
              <div className="ops-section-head">
                <button onClick={() => setDetail(null)}>
                  <ChevronLeft size={18} />
                  목록
                </button>
                <h2>
                  <button
                    className="ops-task-detail-title"
                    disabled={!canWrite}
                    onClick={() => openTaskEditor(selected)}
                  >
                    {text(selected.title)}
                  </button>
                </h2>
                {taskActions(selected, false)}
              </div>
              <div className="ops-tabs">
                {[
                  "Overview",
                  "Tasks",
                  "Notes",
                  "Activity",
                  "Files & Links",
                ].map((t) => (
                  <button
                    className={tab === t ? "active" : ""}
                    key={t}
                    onClick={() => setTab(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <div className="ops-detail">
                {tab === "Overview" ? (
                  <>
                    <p>
                      상태: {statusLabels[selected.status as Status]} ·
                      우선순위: {text(selected.priority)} · 분류:{" "}
                      {taskCategoryLabel(selected)}
                    </p>
                    {taskProcessReady && !isProjectProcess(selected) ? (
                      <form
                        className="ops-form"
                        onSubmit={async (e) => {
                          e.preventDefault();
                          const f = new FormData(e.currentTarget);
                          await mutate(
                            {
                              resource: "tasks",
                              id: selected.id,
                              value: {
                                ...selected,
                                process_steps: JSON.parse(
                                  String(f.get("process_steps") || "[]"),
                                ),
                              },
                            },
                            "PATCH",
                          );
                        }}
                      >
                        <TaskProcessEditor
                          key={
                            selected.id + JSON.stringify(selected.process_steps)
                          }
                          value={selected.process_steps}
                          disabled={busy}
                        />
                        <button disabled={!canWrite}>진행 단계 저장</button>
                      </form>
                    ) : null}
                    <pre>{text(selected.notes) || "등록된 메모 없음"}</pre>
                    <h3>미완료 다음 액션</h3>
                    {notes
                      .filter(
                        (n) =>
                          n.task_id === selected.id &&
                          n.kind === "next_action" &&
                          !n.done,
                      )
                      .map((n) => (
                        <p key={n.id}>{text(n.body)}</p>
                      ))}
                  </>
                ) : null}
                {tab === "Tasks"
                  ? taskList(
                      listedTasks.filter(
                        (t) => t.project_id === selected.project_id,
                      ),
                    )
                  : null}
                {tab === "Notes" ? (
                  <>
                    <button
                      className="ops-primary"
                      disabled={!canWrite}
                      onClick={() =>
                        setEditor({
                          resource: "task_notes",
                          taskId: selected.id,
                        })
                      }
                    >
                      <Plus size={15} />
                      메모 등록
                    </button>
                    {notes
                      .filter((n) => n.task_id === selected.id)
                      .sort((a, b) => Number(b.pinned) - Number(a.pinned))
                      .map((n) => (
                        <div className="ops-note" key={n.id}>
                          <small>
                            {n.pinned ? "고정 · " : ""}
                            {text(n.kind)} · {dateTime(n.updated_at)}{" "}
                            {n.done ? "· 완료" : ""}
                          </small>
                          <pre>{text(n.body)}</pre>
                          {itemActions("task_notes", n)}
                          {n.kind === "next_action" && !n.converted_task_id ? (
                            <button
                              disabled={!canWrite}
                              onClick={() =>
                                mutate({ action: "note_to_task", id: n.id })
                              }
                            >
                              업무로 변환
                            </button>
                          ) : null}
                          <details>
                            <summary>작성·수정 이력</summary>
                            {rows("note_versions")
                              .filter((v) => v.note_id === n.id)
                              .map((v) => (
                                <div key={v.id}>
                                  <small>{dateTime(v.created_at)}</small>
                                  <pre>{text(v.body)}</pre>
                                </div>
                              ))}
                          </details>
                        </div>
                      ))}
                  </>
                ) : null}
                {tab === "Activity"
                  ? sessions
                      .filter((s) => s.task_id === selected.id)
                      .map((s) => (
                        <div className="ops-note" key={s.id}>
                          <strong>
                            {text(s.status)} ·{" "}
                            {clock(
                              intervalSeconds(
                                intervals.filter((i) => i.session_id === s.id),
                                tick + offset,
                              ),
                            )}
                          </strong>
                          <p>
                            {dateTime(s.created_at)} →{" "}
                            {s.ended_at ? dateTime(s.ended_at) : "미종료"}
                          </p>
                          {events
                            .filter(
                              (e) =>
                                e.session_id === s.id ||
                                e.previous_session_id === s.id,
                            )
                            .map((e) => (
                              <small className="block" key={e.id}>
                                {dateTime(e.created_at)} · {text(e.kind)}
                              </small>
                            ))}
                        </div>
                      ))
                  : null}
                {tab === "Files & Links" ? (
                  <>
                    <p>파일 업로드는 후속 단계입니다.</p>
                    {selected.result_url ? (
                      <a
                        href={text(selected.result_url)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        결과물 열기 <ArrowUpRight size={14} />
                      </a>
                    ) : (
                      <p>결과물 링크 없음</p>
                    )}
                  </>
                ) : null}
              </div>
            </section>
          ) : null}
          {view === "calendar" ? (
            <section className="ops-card">
              {heads(
                "Calendar",
                "Asia/Seoul · 연차 기록은 표시하지 않습니다.",
                create("schedules", "일정 등록", { scheduleDate: day }),
              )}
              <div className="ops-toolbar">
                <div className="ops-tabs">
                  {[
                    ["month", "월"],
                    ["week", "주"],
                    ["day", "일"],
                    ["list", "목록"],
                  ].map(([id, label]) => (
                    <button
                      className={calendarView === id ? "active" : ""}
                      key={id}
                      onClick={() => setCalendarView(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <button
                  className="ops-icon"
                  aria-label="이전 날짜"
                  onClick={() => dayShift(calendarView === "week" ? -7 : -1)}
                >
                  <ChevronLeft size={16} />
                </button>
                <input
                  type="date"
                  aria-label="캘린더 기준 날짜"
                  value={day}
                  onChange={(e) => setDay(e.target.value || today)}
                />
                <button
                  className="ops-icon"
                  aria-label="다음 날짜"
                  onClick={() => dayShift(calendarView === "week" ? 7 : 1)}
                >
                  <ChevronRight size={16} />
                </button>
                {space === "PERSONAL" ? (
                  <label className="ops-calendar-category-filter">
                    일정 분류
                    <select
                      value={calendarCategoryFilter}
                      onChange={(event) =>
                        setCalendarCategoryFilter(
                          event.target.value as ScheduleCategory | "all",
                        )
                      }
                    >
                      <option value="all">전체</option>
                      {scheduleCategories.map((category) => (
                        <option value={category} key={category}>
                          {scheduleCategoryLabels[category]}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {space === "PERSONAL" ? (
                  <a className="ops-yoga-settings-link" href="#yoga-reminder">
                    운동 알림 <ArrowUpRight size={13} />
                  </a>
                ) : null}
              </div>
              {calendarView === "month" ? (
                <div className="ops-month">
                  {["일", "월", "화", "수", "목", "금", "토"].map((d) => (
                    <strong className="ops-weekday" key={d}>
                      {d}
                    </strong>
                  ))}
                  {Array.from(
                    {
                      length: new Date(
                        `${day.slice(0, 7)}-01T00:00:00Z`,
                      ).getUTCDay(),
                    },
                    (_, i) => (
                      <div aria-hidden="true" key={`blank-${i}`} />
                    ),
                  )}
                  {Array.from(
                    {
                      length: new Date(
                        Number(day.slice(0, 4)),
                        Number(day.slice(5, 7)),
                        0,
                      ).getDate(),
                    },
                    (_, i) => {
                      const d =
                        day.slice(0, 8) + String(i + 1).padStart(2, "0");
                      return (
                        <div key={d}>
                          <button
                            onClick={() => {
                              setDay(d);
                              setCalendarView("day");
                            }}
                          >
                            {i + 1}
                          </button>
                          {calendarItems
                            .filter((s) => scheduleOverlaps(s, d))
                            .map((s) => (
                              <button
                                key={s.id}
                                className="ops-calendar-event"
                                aria-label={`${calendarLabel(s)} ${text(s.title)} ${dateTime(s.starts_at)}`}
                                onClick={() => setCalendarDetail(s)}
                              >
                                <span className="ops-calendar-full">
                                  {text(s.title)}
                                </span>
                                <span
                                  className="ops-calendar-short"
                                  aria-hidden="true"
                                >
                                  {calendarTitle(s)}
                                </span>
                                <small
                                  className="ops-schedule-category-badge"
                                  data-category={calendarCategory(s)}
                                >
                                  {scheduleCategoryLabels[calendarCategory(s)]}
                                </small>
                              </button>
                            ))}
                        </div>
                      );
                    },
                  )}
                </div>
              ) : calendarItems.length ? (
                calendarItems.map((s) => (
                  <div className="ops-entry" key={s.id}>
                    <button
                      className="ops-calendar-event"
                      aria-label={`${calendarLabel(s)} ${text(s.title)}`}
                      onClick={() => setCalendarDetail(s)}
                    >
                      <span className="ops-calendar-full">{text(s.title)}</span>
                      <span className="ops-calendar-short" aria-hidden="true">
                        {calendarTitle(s)}
                      </span>
                    </button>
                    <small>
                      <span
                        className="ops-schedule-category-badge"
                        data-category={calendarCategory(s)}
                      >
                        {scheduleCategoryLabels[calendarCategory(s)]}
                      </span>{" "}
                      {text(s.source)} · {dateTime(s.starts_at)} –{" "}
                      {dateTime(s.ends_at)}
                    </small>
                    {s.source === "일정" ? scheduleActions(s) : null}
                  </div>
                ))
              ) : (
                <Empty label="이 기간에 등록된 일정이 없습니다." />
              )}
              <p className="ops-footnote">
                반복 일정과 콘텐츠 발행 예정은 캘린더에 함께 표시됩니다.
                아래에서 반복 회차를 관리하세요. 자동화 예정 시간은
                미연결입니다.
              </p>
              <details className="ops-detail">
                <summary>일정 휴지통 ({deletedSchedules.length})</summary>
                <p>삭제 후 12시간 동안 복구할 수 있습니다.</p>
                {deletedSchedules.length ? (
                  deletedSchedules.map((schedule) => (
                    <div className="ops-entry" key={schedule.id}>
                      <strong>{text(schedule.title)}</strong>
                      <small>
                        {dateTime(schedule.starts_at)} –{" "}
                        {dateTime(schedule.ends_at)} ·{" "}
                        {text(
                          projects.find(
                            (projectRow) =>
                              projectRow.id === schedule.project_id,
                          )?.title,
                        ) || "연결 프로젝트 없음"}
                      </small>
                      <small>
                        복구 가능 기한: {dateTime(schedule.purge_after)}
                      </small>
                      <button
                        disabled={!canWrite}
                        aria-label={`${schedule.title || "일정"} 복구`}
                        onClick={() =>
                          void mutate({
                            action: "restore_schedule",
                            id: schedule.id,
                          })
                        }
                      >
                        복구
                      </button>
                    </div>
                  ))
                ) : (
                  <Empty label="복구 가능한 삭제 일정이 없습니다." />
                )}
              </details>
            </section>
          ) : null}
          {view === "journal" ? (
            <section className="ops-card">
              {heads("Work Journal", "실제 작업 구간과 서버 전환 이벤트")}
              <JournalExport
                excludeTests={excludeJournalTests}
                onExcludeTests={setExcludeJournalTests}
                key={
                  "journal-export:" +
                  (user?.email || "signed-out") +
                  space +
                  day
                }
                data={data}
                day={day}
                now={tick + offset}
                enabled={Boolean(user) && !loading && !error}
              />
              <div className="ops-toolbar">
                <button
                  aria-label="일지 이전 날짜"
                  onClick={() =>
                    setDay(
                      new Date(Date.parse(day + "T00:00:00Z") - 86400000)
                        .toISOString()
                        .slice(0, 10),
                    )
                  }
                >
                  이전 날
                </button>
                <button
                  aria-label="일지 다음 날짜"
                  onClick={() =>
                    setDay(
                      new Date(Date.parse(day + "T00:00:00Z") + 86400000)
                        .toISOString()
                        .slice(0, 10),
                    )
                  }
                >
                  다음 날
                </button>
                <input
                  aria-label="일지 날짜"
                  type="date"
                  value={day}
                  onChange={(e) => setDay(e.target.value || today)}
                />
              </div>
              {journalRows.map(({ session: s }) => (
                <div className="ops-note" key={s.id}>
                  <strong>
                    {text(tasks.find((t) => t.id === s.task_id)?.title)} ·{" "}
                    {text(s.status)}
                  </strong>
                  <p>
                    선택 날짜 작업 시간{" "}
                    {clock(
                      intervalSecondsForDay(
                        intervals.filter((i) => i.session_id === s.id),
                        tick + offset,
                        day,
                      ),
                    )}
                  </p>
                  {intervals
                    .filter((i) => i.session_id === s.id)
                    .map((i) => (
                      <small className="block" key={i.id}>
                        {dateTime(i.starts_at)} →{" "}
                        {i.ends_at ? dateTime(i.ends_at) : "진행 중"}
                      </small>
                    ))}
                  {events
                    .filter(
                      (e) =>
                        e.session_id === s.id || e.previous_session_id === s.id,
                    )
                    .map((e) => (
                      <small className="block" key={e.id}>
                        {dateTime(e.created_at)} · {text(e.kind)}
                      </small>
                    ))}
                  <pre>
                    {text(s.summary) || "세션 요약 없음 · 시간 기록은 보존됨"}
                  </pre>
                  {notes
                    .filter(
                      (n) =>
                        n.task_id === s.task_id &&
                        n.kind === "next_action" &&
                        !n.done,
                    )
                    .map((n) => (
                      <p key={n.id}>다음 액션: {text(n.body)}</p>
                    ))}
                </div>
              ))}
              {!loading && !error && user && !journalRows.length ? (
                <Empty label="선택 날짜와 필터에 해당하는 작업 기록이 없습니다." />
              ) : null}
            </section>
          ) : null}
          {view === "library" ? (
            <section className="ops-card">
              {heads(
                "Library",
                `원문 보존 · ${space} 자료만 저장`,
                libTab === "inspiration"
                  ? undefined
                  : create(
                      "library_items",
                      libTab === "prompt" ? "프롬프트 등록" : "스킬 등록",
                      { kind: libTab },
                    ),
              )}
              <div className="ops-toolbar">
                <div className="ops-tabs">
                  {[
                    ["prompt", "Prompt"],
                    ["skill", "Skills"],
                    ["inspiration", "Inspiration"],
                  ]
                    .filter(
                      ([id]) => space === "PERSONAL" || id !== "inspiration",
                    )
                    .map(([id, label]) => (
                      <button
                        key={id}
                        onClick={() => setLibTab(id)}
                        className={libTab === id ? "active" : ""}
                      >
                        {label}
                      </button>
                    ))}
                </div>
                <input
                  aria-label="라이브러리 검색"
                  placeholder="제목·원문 검색"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              {libTab === "inspiration" ? (
                <Phase2Panel
                  key={"inspiration:" + (user?.email || "signed-out") + space}
                  resource="inspiration"
                  enabled={Boolean(user)}
                  projects={projects}
                  day={day}
                />
              ) : (
                library
                  .filter(
                    (l) =>
                      l.kind === libTab &&
                      `${l.title} ${l.body}`
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                  )
                  .map((l) => (
                    <div className="ops-note" key={l.id}>
                      <div className="ops-entry-title">
                        <strong>{text(l.title)}</strong>
                        <button
                          className="ops-icon"
                          disabled={!canWrite}
                          aria-label={`${l.title} 즐겨찾기`}
                          onClick={() =>
                            mutate(
                              {
                                resource: "library_items",
                                id: l.id,
                                value: { ...l, favorite: !l.favorite },
                              },
                              "PATCH",
                            )
                          }
                        >
                          <Star
                            size={16}
                            fill={l.favorite ? "currentColor" : "none"}
                          />
                        </button>
                      </div>
                      <small>{text(l.category)}</small>
                      {libraryWorkflow ? (
                        <p>
                          {text(l.tool) || "도구 미지정"} ·{" "}
                          {l.status === "archived" ? "보관" : "사용 중"} ·
                          프로젝트{" "}
                          {text(
                            projects.find((p) => p.id === l.project_id)?.title,
                          ) || "미분류"}{" "}
                          · 최신 승인 버전{" "}
                          {l.approved_version_id
                            ? dateTime(
                                rows("prompt_versions").find(
                                  (v) => v.id === l.approved_version_id,
                                )?.created_at,
                              )
                            : "미지정"}
                        </p>
                      ) : null}
                      <details>
                        <summary>원문 펼치기</summary>
                        <pre>{text(l.body)}</pre>
                      </details>
                      <button
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(text(l.body));
                            setNotice("전체 원문을 복사했습니다.");
                          } catch {
                            setError("복사 권한을 확인해 주세요.");
                          }
                        }}
                      >
                        <Copy size={15} />
                        전체 복사
                      </button>
                      {l.url ? (
                        <a
                          href={text(l.url)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          링크 열기 <ArrowUpRight size={14} />
                        </a>
                      ) : null}
                      {itemActions("library_items", l)}
                      {l.kind === "prompt" ? (
                        <details>
                          <summary>버전 이력</summary>
                          {rows("prompt_versions")
                            .filter((v) => v.item_id === l.id)
                            .map((v) => (
                              <div key={v.id}>
                                <small>
                                  {dateTime(v.created_at)} · {text(v.title)}
                                </small>
                                <pre>{text(v.body)}</pre>
                                {v.metadata ? (
                                  <p>
                                    수정 이유:{" "}
                                    {text(
                                      (v.metadata as Record<string, unknown>)
                                        .change_reason,
                                    ) || "기록 없음"}{" "}
                                    · 적용 도구:{" "}
                                    {text(
                                      (v.metadata as Record<string, unknown>)
                                        .tool,
                                    ) || "미지정"}
                                  </p>
                                ) : null}
                                <button
                                  type="button"
                                  disabled={!canWrite}
                                  onClick={() =>
                                    setEditor({
                                      resource: "library_items",
                                      row: {
                                        ...l,
                                        title: v.title,
                                        body: v.body,
                                      },
                                    })
                                  }
                                >
                                  이 버전으로 복원 검토
                                </button>
                              </div>
                            ))}
                        </details>
                      ) : null}
                    </div>
                  ))
              )}
              {libTab !== "inspiration" &&
              !library.some((l) => l.kind === libTab) ? (
                <Empty label="저장된 자료가 없습니다." />
              ) : null}
            </section>
          ) : null}
          {["automations"].includes(view) ? (
            <AutomationResultsPanel
              workspace={space}
              results={automationResults}
              ready={Boolean(user) && automationReady}
              enabled={Boolean(user)}
              refresh={() => void load()}
            />
          ) : null}
          {view === "legacy-content" && space === "PERSONAL" ? (
            <Phase2Panel
              key={"content:" + (user?.email || "signed-out") + space}
              resource="content"
              initialContentId={contentFocus}
              onOpenTask={async (id) => {
                await load();
                setDetail(id);
                setTab("Overview");
                setView("projects");
              }}
              enabled={Boolean(user)}
              projects={projects}
              day={day}
            />
          ) : null}
          {view === "personal-sheets" && space === "PERSONAL" ? (
            <PersonalSheetsPanel
              key={"personal-sheets:" + (user?.email || "signed-out") + space}
              enabled={
                Boolean(user) &&
                authState === "AUTHENTICATED" &&
                configured === true
              }
            />
          ) : null}
          {view === "analytics" ? (
            <>
              <AnalyticsPanel
                taskClassification={taskClassification}
                taskProcessReady={taskProcessReady}
                data={data}
                enabled={Boolean(user) && !error}
                now={tick + offset}
                day={day}
              />
              {space === "PERSONAL" ? (
                <ContentAnalyticsPanel
                  key={
                    "content-analytics:" + (user?.email || "signed-out") + space
                  }
                  enabled={Boolean(user)}
                  projects={projects}
                  day={day}
                  now={tick + offset}
                />
              ) : null}
            </>
          ) : null}
          {view === "calendar" && space === "PERSONAL" ? (
            <div id="yoga-reminder">
              <YogaReminderPanel
                key={`push:${user?.email || "signed-out"}:${space}`}
                enabled={
                  Boolean(user) &&
                  authState === "AUTHENTICATED" &&
                  space === "PERSONAL"
                }
              />
            </div>
          ) : null}
          {view === "calendar" ? (
            <Phase2Panel
              key={"recurrence:" + (user?.email || "signed-out") + space}
              onCalendarData={receiveCalendarData}
              resource="recurrence"
              enabled={Boolean(user)}
              projects={projects}
              day={day}
              calendarView={calendarView}
            />
          ) : null}
          {view === "settings" ? (
            <div className="ops-two">
              <section className="ops-card">
                {heads(`${space} 연결`, "Supabase Auth + PostgreSQL")}
                <div className="ops-detail">
                  <p>
                    환경변수:{" "}
                    {configured === null
                      ? "확인 중"
                      : configured
                        ? "필수값 설정됨"
                        : "미설정"}
                  </p>
                  <p>
                    DB:{" "}
                    {error
                      ? "오류 확인 필요"
                      : user
                        ? "조회 결과 확인"
                        : "로그인 후 조회 검증 필요"}
                  </p>
                  {authState === "INITIALIZING" || authState === "ERROR" ? (
                    <p role="status">
                      {authState === "INITIALIZING"
                        ? "로그인 상태 확인 중…"
                        : "인증 상태 재확인이 필요합니다."}
                    </p>
                  ) : !user ? (
                    <form className="ops-form" onSubmit={login}>
                      <label>
                        {space} 계정 이메일
                        <input
                          name="email"
                          type="email"
                          autoComplete="username"
                          required
                        />
                      </label>
                      <label>
                        비밀번호
                        <input
                          name="password"
                          type="password"
                          autoComplete="current-password"
                          required
                          maxLength={256}
                        />
                      </label>
                      <button
                        className="ops-primary"
                        disabled={!configured || busy}
                      >
                        로그인
                      </button>
                    </form>
                  ) : (
                    <>
                      <p>{user.email}</p>
                      <button disabled={busy} onClick={() => load()}>
                        DB 새로고침
                      </button>
                      <button type="button" disabled={busy} onClick={logout}>
                        {space} 계정 로그아웃
                      </button>
                    </>
                  )}
                  <p>
                    공개 회원가입은 제공하지 않습니다. {space} 저장소의 계정을
                    사용해 주세요.
                  </p>
                </div>
              </section>
              <section className="ops-card">
                {heads(
                  "회사 및 외부 연결",
                  "FRENGLE / ChatGPT / Claude / Codex",
                )}
                <div className="ops-detail">
                  <p>
                    {space} 저장소에 전달된 자동화 결과는 Automations에서
                    확인하세요.
                  </p>
                  <p>
                    워크스페이스를 바꾸면 해당 저장소의 계정과 데이터로 새로
                    엽니다.
                  </p>
                  <button onClick={() => move("automations")}>
                    자동화 데이터 보기
                  </button>
                </div>
              </section>
            </div>
          ) : null}
          {view === "settings" && space === "PERSONAL" ? (
            <DesktopDownload signedIn={Boolean(user)} />
          ) : null}
          {view === "settings" && space === "PERSONAL" ? (
            <Phase2Panel
              key={"leave:" + (user?.email || "signed-out") + space}
              resource="leave"
              enabled={Boolean(user) && space === "PERSONAL"}
              projects={projects}
              day={day}
            />
          ) : null}
          {view === "journal" ? (
            <section className="ops-card">
              <h2>Daily Report</h2>
              <p>
                회사 공유 보고서 내보내기는 준비 중입니다. 자동화 데이터는
                FRENGLE 회사 전용 포털에서 확인하세요.
              </p>
              <p>
                PERSONAL 프로젝트·내부 메모·특이사항·업무 시간·연차·비밀정보는
                제외합니다.
              </p>
              <button disabled>회사 보고서 내보내기 · 준비 중</button>
            </section>
          ) : null}
          <footer>
            MY OPS · Editorial OS <span>수동 등록과 실제 기록만 표시</span>
          </footer>
        </main>
      </div>
      <div className="ops-timer">
        <div>
          <small>{active ? "ACTIVE" : "TIME TRACKER"}</small>
          <strong>{text(activeTask?.title) || "진행 중인 업무 없음"}</strong>
        </div>
        <code>{clock(activeSeconds)}</code>
        {active ? (
          <>
            <button disabled={!canWrite} onClick={() => setRecovery(true)}>
              기록 확인
            </button>
            <button
              disabled={!canWrite || !timerGuardReady}
              onClick={() =>
                workflowReady
                  ? setParkOpen(active)
                  : timer("pause", text(active.task_id))
              }
            >
              <Pause size={17} />
              일시정지
            </button>
            <button
              disabled={!canWrite || !timerGuardReady}
              onClick={() => setSummary(active)}
            >
              <Square size={15} />
              종료
            </button>
          </>
        ) : (
          <button disabled={!canWrite} onClick={() => move("projects")}>
            <Play size={16} />
            업무 선택
          </button>
        )}
      </div>
      <nav className="ops-mobile-nav" aria-label="모바일 메뉴">
        {visibleMenus
          .filter((m) =>
            ["overview", "calendar", "projects", "journal", "library"].includes(
              m.id,
            ),
          )
          .map((m) => (
            <button
              key={m.id}
              className={view === m.id ? "active" : ""}
              onClick={() => move(m.id)}
            >
              <m.icon size={19} />
              <span>{m.label}</span>
            </button>
          ))}
        <button onClick={() => setMoreMenu(true)}>
          <Settings size={19} />
          <span>더보기</span>
        </button>
      </nav>
      {calendarDetail ? (
        <OpsDialog
          title="일정 상세"
          busy={false}
          close={() => setCalendarDetail(null)}
        >
          <h3>{text(calendarDetail.title)}</h3>
          <dl className="ops-calendar-detail">
            <dt>분류</dt>
            <dd>{calendarLabel(calendarDetail)}</dd>
            <dt>일정 분류</dt>
            <dd>{scheduleCategoryLabels[calendarCategory(calendarDetail)]}</dd>
            <dt>일정 단계</dt>
            <dd>{text(calendarDetail.source)}</dd>
            <dt>시작 (서울 시간)</dt>
            <dd>{dateTime(calendarDetail.starts_at)}</dd>
            <dt>종료 (서울 시간)</dt>
            <dd>{dateTime(calendarDetail.ends_at)}</dd>
            <dt>상태</dt>
            <dd>{text(calendarDetail.status) || "기록 없음"}</dd>
            <dt>프로젝트</dt>
            <dd>
              {text(
                projects.find((p) => p.id === calendarDetail.project_id)?.title,
              ) || "연결 없음"}
            </dd>
            <dt>메모</dt>
            <dd>{text(calendarDetail.notes) || "기록 없음"}</dd>
            {calendarCategory(calendarDetail) === "exercise" &&
            scheduleVideoLink(calendarDetail.video_url) ? (
              <>
                <dt>운동 영상</dt>
                <dd>
                  <a
                    href={scheduleVideoLink(calendarDetail.video_url)!}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    운동 영상 열기 <ArrowUpRight size={14} />
                  </a>
                </dd>
              </>
            ) : null}
          </dl>
          <div className="ops-form-actions">
            <button type="button" data-dialog-close>
              닫기
            </button>
            <button
              type="button"
              onClick={() => {
                const id =
                  text(calendarDetail.task_id) ||
                  text((calendarDetail.task as OpsRow | undefined)?.id);
                if (id) {
                  move("projects");
                  setDetail(id);
                } else if (calendarDetail.content_id) {
                  move("legacy-content");
                  setContentFocus(text(calendarDetail.content_id));
                } else if (calendarDetail.source === "일정")
                  setEditor({ resource: "schedules", row: calendarDetail });
                setCalendarDetail(null);
              }}
              disabled={
                !calendarDetail.content_id &&
                !calendarDetail.task &&
                !calendarDetail.task_id &&
                calendarDetail.source !== "일정"
              }
            >
              관련 콘텐츠 / 업무 열기
            </button>
          </div>
        </OpsDialog>
      ) : null}
      {moreMenu ? (
        <OpsDialog
          title="전체 메뉴"
          busy={false}
          close={() => setMoreMenu(false)}
        >
          <div className="ops-more-menu">
            {visibleMenus.map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  move(m.id);
                  setMoreMenu(false);
                }}
              >
                <m.icon size={18} />
                {m.label}
              </button>
            ))}
          </div>
        </OpsDialog>
      ) : null}
      {resumeTarget ? (
        <OpsDialog
          title="작업 시작 / 이어하기"
          busy={busy}
          close={() => setResumeTask(null)}
        >
          <p>현재 업무 제목</p>
          <h3>{text(resumeTarget.title)}</h3>
          <form
            className="ops-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (startSubmit.current) return;
              startSubmit.current = true;
              try {
                const form = new FormData(e.currentTarget);
                if (
                  taskProcessReady &&
                  !isProjectProcess(resumeTarget) &&
                  !(await mutate(
                    {
                      resource: "tasks",
                      id: resumeTarget.id,
                      value: {
                        ...resumeTarget,
                        process_steps: JSON.parse(
                          String(form.get("process_steps") || "[]"),
                        ),
                      },
                    },
                    "PATCH",
                  ))
                )
                  return;
                for (const [kind, body] of [
                  [
                    "general",
                    [
                      form.get("start_stage"),
                      form.get("start_note"),
                      form.get("start_file"),
                    ]
                      .filter(Boolean)
                      .join("\n"),
                  ],
                  ["next_action", String(form.get("start_next") || "")],
                ]) {
                  if (!body) continue;
                  const key = resumeTarget.id + kind + body;
                  if (noteWrites.current.has("uncertain:" + key)) {
                    setError(
                      "이전 메모 저장 응답을 확인하지 못했습니다. 업무 상세에서 저장 여부를 먼저 확인하고 새로고침해 주세요.",
                    );
                    return;
                  }
                  if (!noteWrites.current.has(key)) {
                    if (
                      !(await mutate({
                        resource: "task_notes",
                        value: {
                          task_id: resumeTarget.id,
                          kind,
                          body,
                          pinned: false,
                          done: false,
                        },
                      }))
                    ) {
                      noteWrites.current.add("uncertain:" + key);
                      return;
                    }
                    noteWrites.current.add(key);
                  }
                }
                if (await timer("start", resumeTarget.id, "", parkForm(form))) {
                  noteWrites.current.clear();
                  setResumeTask(null);
                }
              } finally {
                startSubmit.current = false;
              }
            }}
          >
            <fieldset disabled={busy}>
              <legend>이번 업무에서 진행할 내용 (선택)</legend>
              {isProjectProcess(resumeTarget) ? (
                <p>
                  프로젝트:{" "}
                  {text(
                    projects.find((p) => p.id === resumeTarget.project_id)
                      ?.title,
                  )}{" "}
                  · {Number(resumeTarget.project_step_order) + 1}단계 ·{" "}
                  {text(resumeTarget.title)}
                </p>
              ) : taskProcessReady ? (
                <TaskProcessEditor value={resumeTarget.process_steps} />
              ) : (
                <p>단계 저장을 사용하려면 저장소 설정을 완료해 주세요.</p>
              )}
              <label>
                특이사항 / 작업 메모
                <textarea
                  name="start_note"
                  maxLength={1200}
                  placeholder="예: 첫 장면 자막을 수정해야 합니다."
                />
              </label>
            </fieldset>
            {active && active.task_id !== resumeTarget.id ? (
              <p>
                시작하면 현재 업무 «{text(activeTask?.title)}»는 PARKED로
                전환됩니다. 현재 시간 구간을 닫은 뒤 새 구간을 시작합니다.
              </p>
            ) : null}
            {workflowReady && active && active.task_id !== resumeTarget.id ? (
              <ParkFields />
            ) : null}
            {error ? <p role="alert">{error}</p> : null}
            <OpsFormActions busy={busy}>
              <button
                className="ops-primary"
                disabled={!canWrite || !timerGuardReady}
              >
                {busy ? "처리 중…" : "작업 시작 / 이어하기"}
              </button>
            </OpsFormActions>
          </form>
        </OpsDialog>
      ) : null}
      {parkOpen ? (
        <OpsDialog
          title="현재 업무 중단 / 맥락 저장"
          busy={busy}
          close={() => setParkOpen(null)}
        >
          <form
            className="ops-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await timer(
                  "pause",
                  text(parkOpen.task_id),
                  "",
                  parkForm(new FormData(e.currentTarget)),
                  parkOpen.id,
                )
              )
                setParkOpen(null);
            }}
          >
            <h3>{text(tasks.find((t) => t.id === parkOpen.task_id)?.title)}</h3>
            <ParkFields />
            {error ? <p role="alert">{error}</p> : null}
            <OpsFormActions busy={busy}>
              <button
                className="ops-primary"
                disabled={!canWrite || !timerGuardReady}
              >
                {busy ? "처리 중…" : "맥락 저장 후 일시정지"}
              </button>
            </OpsFormActions>
          </form>
        </OpsDialog>
      ) : null}
      {editor ? (
        <ResourceEditor
          workspace={space}
          scheduleCategoryReady={scheduleCategoryReady}
          taskTestClassification={taskTestClassification}
          taskProcessReady={taskProcessReady}
          projectProcessReady={projectProcessReady}
          libraryWorkflow={libraryWorkflow}
          promptVersions={rows("prompt_versions")}
          editor={editor}
          projects={projects}
          tasks={tasks}
          tasksTruncated={truncated.includes("tasks")}
          busy={busy}
          error={error}
          close={() => setEditor(null)}
          save={mutate}
        />
      ) : null}
      {deleteTarget ? (
        <OpsDialog
          title="항목을 삭제할까요?"
          busy={busy}
          close={() => {
            setDeleteTarget(null);
            setError("");
          }}
        >
          <p>{text(deleteTarget.row.title) || text(deleteTarget.row.body)}</p>
          {deleteTarget.resource === "projects" ? (
            <p>
              연결된 업무나 일정이 있으면 삭제할 수 없습니다. 먼저 연결을
              해제하거나 해당 항목을 정리해 주세요. 업무는 자동 삭제되지
              않습니다.
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="ops-alert bad">
              {error}
            </p>
          ) : null}
          <OpsFormActions busy={busy}>
            <button
              className="ops-danger"
              disabled={busy}
              onClick={() =>
                mutate(
                  { resource: deleteTarget.resource, id: deleteTarget.row.id },
                  "DELETE",
                )
              }
            >
              삭제
            </button>
          </OpsFormActions>
        </OpsDialog>
      ) : null}
      {quickLog ? (
        <OpsDialog
          title="Quick Log"
          busy={busy}
          close={() => {
            setQuickLog(false);
            setError("");
          }}
        >
          <p>업무에 짧은 기록을 남겨보세요.</p>
          <form
            className="ops-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const ok = await mutate({
                resource: "task_notes",
                value: {
                  task_id: f.get("task_id"),
                  body: f.get("body"),
                  kind: f.get("kind"),
                  pinned: false,
                  done: false,
                },
              });
              if (ok) setQuickLog(false);
            }}
          >
            <label>
              기록할 업무
              <select
                name="task_id"
                defaultValue={
                  active?.task_id
                    ? text(active.task_id)
                    : selected?.id || tasks[0]?.id
                }
                required
                disabled={busy}
              >
                {tasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {text(t.title)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              기록 종류
              <select name="kind" defaultValue="general" disabled={busy}>
                <option value="general">작업 기록</option>
                <option value="issue">특이사항</option>
                <option value="next_action">다음 액션</option>
              </select>
            </label>
            <label>
              기록 내용
              <textarea
                name="body"
                rows={5}
                maxLength={10000}
                required
                disabled={busy}
              />
            </label>
            <p>
              선택한 {space} 업무의 메모에 저장합니다. 타이머 종료 요약이나 작업
              시간을 변경하지 않습니다.
            </p>
            {error ? (
              <p role="alert" className="ops-alert bad">
                {error}
              </p>
            ) : null}
            <OpsFormActions busy={busy}>
              <button className="ops-primary" disabled={!canWrite}>
                {busy ? "저장 중…" : "기록 저장"}
              </button>
            </OpsFormActions>
          </form>
        </OpsDialog>
      ) : null}
      {recovery && active ? (
        <OpsDialog
          title="작업 상태 확인"
          busy={busy}
          close={() => setRecovery(false)}
        >
          <p>{text(activeTask?.title)}</p>
          <p>현재 누적 작업 시간 {clock(activeSeconds)}</p>
          <p>
            현재 구간 시작:{" "}
            {dateTime(
              intervals.find((i) => i.session_id === active.id && !i.ends_at)
                ?.starts_at,
            )}
          </p>
          <p>
            8시간 이상 열린 구간은 확인을 권장합니다. 브라우저를 닫거나 PC가
            절전 상태여도 열린 구간은 계속 계산됩니다.
          </p>
          <p>
            일시정지와 종료는 현재 서버 시각을 기록합니다. 이전 시간을 자동으로
            줄이지 않습니다. 과거 종료 시각 정정은 아직 지원하지 않습니다.
          </p>
          {error ? (
            <p role="alert" className="ops-alert bad">
              {error}
            </p>
          ) : null}
          <button
            disabled={!canWrite || !timerGuardReady}
            onClick={async () => {
              if (await timer("pause", text(active.task_id)))
                setRecovery(false);
            }}
          >
            현재 시각에 일시정지
          </button>
          <button
            disabled={!canWrite || !timerGuardReady}
            onClick={() => {
              setRecovery(false);
              setSummary(active);
            }}
          >
            요약 작성 후 종료
          </button>
          <button disabled={busy} onClick={() => setRecovery(false)}>
            계속 작업하기
          </button>
        </OpsDialog>
      ) : null}
      {summary ? (
        <OpsDialog
          title="작업 종료 / Session Summary"
          busy={busy}
          close={() => setSummary(null)}
        >
          <form
            className="ops-form"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void timer(
                "finish",
                text(summary.task_id),
                text(f.get("summary")),
                {},
                summary.id,
              );
            }}
          >
            <p>{text(tasks.find((t) => t.id === summary.task_id)?.title)}</p>
            <label>
              작업 요약 (선택)
              <textarea name="summary" rows={5} maxLength={10000} />
            </label>
            <p>요약 없이 종료해도 시간 기록은 보존됩니다.</p>
            {error ? <p className="ops-alert bad">{error}</p> : null}
            <OpsFormActions busy={busy}>
              <button
                className="ops-primary"
                disabled={!canWrite || !timerGuardReady}
              >
                작업 종료
              </button>
            </OpsFormActions>
          </form>
        </OpsDialog>
      ) : null}
    </div>
  );
}
function Empty({ label }: { label: string }) {
  return (
    <div className="ops-empty">
      <span>—</span>
      <p>{label}</p>
    </div>
  );
}
function ResourceEditor({
  workspace,
  scheduleCategoryReady,
  taskTestClassification,
  taskProcessReady,
  projectProcessReady,
  libraryWorkflow,
  promptVersions,
  editor,
  projects,
  tasks,
  tasksTruncated,
  busy,
  error,
  close,
  save,
}: {
  workspace: ApiWorkspace;
  scheduleCategoryReady: boolean;
  taskTestClassification: boolean;
  taskProcessReady: boolean;
  projectProcessReady: boolean;
  libraryWorkflow: boolean;
  promptVersions: OpsRow[];
  editor: Editor;
  projects: OpsRow[];
  tasks: OpsRow[];
  tasksTruncated: boolean;
  busy: boolean;
  error: string;
  close: () => void;
  save: (body: unknown, method?: string) => Promise<boolean>;
}) {
  const resource = editor.resource,
    row: Record<string, unknown> = editor.row || {},
    title =
      resource === "projects"
        ? "프로젝트"
        : resource === "tasks"
          ? "업무"
          : resource === "task_notes"
            ? "메모"
            : resource === "schedules"
              ? "일정"
              : "라이브러리";
  const defaults = scheduleDefaults(editor.scheduleDate || seoulDate());
  const [scheduleStart, setScheduleStart] = useState(
    row.starts_at ? localDateTime(row.starts_at) : defaults.startsAt,
  );
  const [scheduleEnd, setScheduleEnd] = useState(
    row.ends_at ? localDateTime(row.ends_at) : defaults.endsAt,
  );
  const [scheduleEndEdited, setScheduleEndEdited] = useState(Boolean(row.id));
  const [scheduleCategory, setScheduleCategory] = useState<ScheduleCategory>(
    scheduleCategories.includes(text(row.category) as ScheduleCategory)
      ? (text(row.category) as ScheduleCategory)
      : "other",
  );
  const [scheduleVideoUrl, setScheduleVideoUrl] = useState(text(row.video_url));
  const submitting = useRef(false);
  const scheduleError =
    resource === "schedules"
      ? scheduleRangeError(scheduleStart, scheduleEnd)
      : "";
  const projectIncomplete =
    resource === "projects" && Boolean(row.id) && tasksTruncated;
  const field = (name: string, label: string, type = "text", max = 120) => (
    <label>
      {label}
      <input
        aria-label={label}
        name={name}
        type={type}
        defaultValue={text(row[name])}
        maxLength={max}
        required={name === "title"}
      />
    </label>
  );
  const area = (name: string, label: string, max: number) => (
    <label>
      {label}
      <textarea
        aria-label={label}
        name={name}
        rows={resource === "library_items" ? 10 : 4}
        defaultValue={text(row[name])}
        maxLength={max}
      />
    </label>
  );
  const select = (
    name: string,
    label: string,
    options: string[][],
    initial: string,
  ) => (
    <label>
      {label}
      <select
        name={name}
        aria-label={label}
        defaultValue={text(row[name]) || initial}
      >
        {options.map(([value, name]) => (
          <option key={value} value={value}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || submitting.current || projectIncomplete) return;
    submitting.current = true;
    try {
      const f = new FormData(e.currentTarget),
        value: Record<string, unknown> = { ...Object.fromEntries(f) };
      if (resource === "task_notes") {
        value.task_id = editor.taskId || row.task_id;
        value.pinned = f.has("pinned");
        value.done = f.has("done");
      }
      if (resource === "library_items") {
        value.favorite = f.has("favorite");
        value.kind = row.kind || editor.kind || "prompt";
      }
      if (resource === "tasks") {
        if (taskTestClassification)
          value.is_test =
            value.is_test === "true"
              ? true
              : value.is_test === "false"
                ? false
                : null;
        if (value.contact_status !== undefined)
          value.follow_up_at = value.follow_up_at
            ? `${value.follow_up_at}:00+09:00`
            : null;
        value.due_date = value.due_date || null;
        if (taskProcessReady)
          value.process_steps = JSON.parse(String(value.process_steps || "[]"));
      }
      if (resource === "projects" && projectProcessReady) {
        value.process_steps = JSON.parse(String(value.process_steps || "[]"));
        value.expected_updated_at = row.updated_at || null;
      }
      if (resource === "schedules") {
        try {
          value.starts_at = new Date(
            text(value.starts_at) + ":00+09:00",
          ).toISOString();
          value.ends_at = new Date(
            text(value.ends_at) + ":00+09:00",
          ).toISOString();
        } catch {
          return;
        }
      }
      const saved = await save(
        { resource, id: row.id, value },
        row.id ? "PATCH" : "POST",
      );
      if (saved) close();
    } finally {
      submitting.current = false;
    }
  }
  return (
    <OpsDialog
      title={`${title} ${row.id ? "수정" : "등록"}`}
      busy={busy}
      close={close}
    >
      <form onSubmit={submit} className="ops-form">
        {projectIncomplete ? (
          <p role="alert" className="ops-alert bad">
            전체 프로세스를 불러오지 못해 저장을 잠시 막았습니다. 누락된 단계를
            보관하지 않도록 전체 데이터 조회가 필요합니다.
          </p>
        ) : null}
        {resource !== "task_notes" ? field("title", "제목") : null}
        {resource === "library_items" && libraryWorkflow ? (
          <>
            {field("tool", "적용 도구", "text", 80)}
            {select(
              "project_id",
              "연결 프로젝트",
              [
                ["", "연결 없음"],
                ...projects.map((p) => [p.id, text(p.title)]),
              ],
              "",
            )}
            {area("change_reason", "변경 이유", 2000)}
            {select(
              "status",
              "사용 상태",
              [
                ["active", "사용 중"],
                ["archived", "보관"],
              ],
              "active",
            )}
            {row.kind === "prompt"
              ? select(
                  "approved_version_id",
                  "최신 승인 버전",
                  [
                    ["", "미지정"],
                    ...promptVersions
                      .filter((v) => v.item_id === row.id)
                      .map((v) => [
                        v.id,
                        `${dateTime(v.created_at)} · ${text(v.title)}`,
                      ]),
                  ],
                  "",
                )
              : null}
            <p>
              승인 버전은 직접 선택합니다. 수정 원문을 자동 승인하지 않습니다.
            </p>
          </>
        ) : null}
        {resource === "projects" ? (
          <>
            {projectProcessReady
              ? select(
                  "project_category",
                  "프로젝트 분류",
                  Object.entries(projectCategoryLabels),
                  "other",
                )
              : null}
            {area("description", "설명", 2000)}
            {select(
              "status",
              "상태",
              [
                ["planning", "계획"],
                ["active", "진행"],
                ["completed", "완료"],
              ],
              "planning",
            )}
            {projectProcessReady ? (
              <ProjectProcessEditor
                key={
                  text(row.id) +
                  JSON.stringify(projectProcessSteps(tasks, row.id)) +
                  JSON.stringify(projectProcessSteps(tasks, row.id, true))
                }
                initialSteps={projectProcessSteps(tasks, row.id)}
                archivedSteps={projectProcessSteps(tasks, row.id, true)}
                disabled={busy}
              />
            ) : (
              <p>
                프로젝트 분류와 프로세스를 사용하려면 저장소 설정을 완료해
                주세요.
              </p>
            )}
          </>
        ) : null}
        {resource === "tasks" ? (
          <>
            {area("notes", "일반 메모", 2000)}
            {select(
              "status",
              "업무 상태",
              Object.entries(statusLabels),
              "pending",
            )}
            {select(
              "priority",
              "우선순위",
              [
                ["high", "높음"],
                ["normal", "보통"],
                ["low", "낮음"],
              ],
              "normal",
            )}
            <label>
              마감일
              <input
                aria-label="마감일"
                name="due_date"
                type="date"
                defaultValue={text(row.due_date || editor.dueDate)}
              />
            </label>
            {taskProcessReady ? (
              <>
                {select(
                  "task_category",
                  "업무 분류",
                  Object.entries(taskCategoryLabels),
                  "other",
                )}
                <TaskProcessEditor value={row.process_steps} />
              </>
            ) : (
              <p>
                업무 분류와 단계 저장을 사용하려면 저장소 설정을 완료해 주세요.
              </p>
            )}
            {taskTestClassification ? (
              <label>
                테스트 데이터 구분
                <select
                  name="is_test"
                  aria-label="테스트 데이터 구분"
                  defaultValue={
                    row.is_test === true
                      ? "true"
                      : row.is_test === false
                        ? "false"
                        : ""
                  }
                >
                  <option value="">미지정 (기존 제목 기준)</option>
                  <option value="false">일반 업무</option>
                  <option value="true">테스트 업무</option>
                </select>
                <small>
                  테스트 업무는 테스트 제외 집계에서 빠집니다. 일반 업무로
                  지정하면 제목에 QA 표시가 있어도 포함됩니다.
                </small>
              </label>
            ) : null}
            {field("result_url", "결과물 URL", "url", 2000)}
            {select(
              "approval",
              "승인",
              [
                ["none", "해당 없음"],
                ["pending", "대기"],
                ["approved", "승인됨"],
              ],
              "none",
            )}
          </>
        ) : null}
        {resource === "tasks" || resource === "schedules"
          ? select(
              "project_id",
              "프로젝트",
              [
                ["", "연결 없음"],
                ...projects.map((p) => [p.id, text(p.title)]),
              ],
              "",
            )
          : null}
        {resource === "task_notes" ? (
          <>
            {area("body", "메모 원문", 10000)}
            {select(
              "kind",
              "메모 종류",
              [
                ["general", "일반 메모"],
                ["issue", "특이사항"],
                ["next_action", "다음 액션"],
              ],
              "general",
            )}
            <label className="ops-checkbox">
              <input
                type="checkbox"
                name="pinned"
                defaultChecked={row.pinned === true}
              />
              중요 메모 고정
            </label>
            <label className="ops-checkbox">
              <input
                type="checkbox"
                name="done"
                defaultChecked={row.done === true}
              />
              완료한 액션
            </label>
          </>
        ) : null}
        {resource === "schedules" ? (
          <>
            {workspace === "PERSONAL" ? (
              <label>
                일정 분류
                <select
                  name="category"
                  aria-label="일정 분류"
                  value={scheduleCategory}
                  disabled={!scheduleCategoryReady}
                  onChange={(event) =>
                    setScheduleCategory(event.target.value as ScheduleCategory)
                  }
                >
                  {scheduleCategories.map((category) => (
                    <option value={category} key={category}>
                      {scheduleCategoryLabels[category]}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {workspace === "PERSONAL" && !scheduleCategoryReady ? (
              <p className="ops-schedule-form-hint">
                일정 분류 연결을 확인해 주세요. 기본 일정은 저장할 수 있습니다.
              </p>
            ) : null}
            {workspace === "PERSONAL" &&
            scheduleCategoryReady &&
            scheduleCategory === "exercise" ? (
              <>
                <label>
                  요가·운동 영상 URL (선택)
                  <input
                    name="video_url"
                    type="url"
                    pattern="https://.+"
                    inputMode="url"
                    maxLength={2000}
                    value={scheduleVideoUrl}
                    onChange={(event) =>
                      setScheduleVideoUrl(event.target.value)
                    }
                    placeholder="https://www.youtube.com/watch?v=..."
                  />
                </label>
                <p className="ops-schedule-form-hint">
                  이 일정 날짜의 밤 9시(한국시간) 알림에 사용할 영상입니다.
                  iPhone에서는 홈 화면 앱의 ‘운동 알림’을 켜 주세요.
                </p>
              </>
            ) : null}
            <label>
              시작 (서울 시간)
              <input
                required
                name="starts_at"
                type="datetime-local"
                value={scheduleStart}
                onChange={(event) => {
                  const nextStart = event.currentTarget.value;
                  setScheduleStart(nextStart);
                  if (!scheduleEndEdited)
                    setScheduleEnd(addSeoulMinutes(nextStart, 60));
                }}
              />
            </label>
            <label>
              종료 (서울 시간)
              <input
                required
                name="ends_at"
                type="datetime-local"
                value={scheduleEnd}
                aria-invalid={Boolean(scheduleError)}
                aria-describedby={
                  scheduleError ? "schedule-time-error" : undefined
                }
                onChange={(event) => {
                  setScheduleEnd(event.currentTarget.value);
                  setScheduleEndEdited(true);
                }}
              />
            </label>
            {scheduleError ? (
              <p
                id="schedule-time-error"
                className="ops-alert bad"
                role="alert"
              >
                {scheduleError}
              </p>
            ) : null}
            {area("notes", "메모", 2000)}
          </>
        ) : null}
        {resource === "library_items" ? (
          <>
            {select(
              "category",
              "카테고리",
              ["개발", "디자인", "이미지 콘텐츠", "영상 콘텐츠", "운영"].map(
                (v) => [v, v],
              ),
              "개발",
            )}
            {area("body", "원문 / 설명 (비밀정보 제외)", 50000)}
            {field("url", "URL", "url", 2000)}
            <label className="ops-checkbox">
              <input
                type="checkbox"
                name="favorite"
                defaultChecked={row.favorite === true}
              />
              즐겨찾기
            </label>
          </>
        ) : null}
        {error ? (
          <p className="ops-alert bad" role="alert">
            {error}
          </p>
        ) : null}
        <div className="ops-form-actions">
          <button type="button" disabled={busy} data-dialog-close>
            취소
          </button>
          <button
            className="ops-primary"
            disabled={busy || Boolean(scheduleError) || projectIncomplete}
          >
            {busy ? "저장 중…" : "저장"}
          </button>
        </div>
      </form>
    </OpsDialog>
  );
}
