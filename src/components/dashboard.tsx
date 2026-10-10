"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  LayoutDashboard,
  ListTodo,
  Workflow,
  PanelsTopLeft,
  Settings,
  Plus,
  ArrowUpRight,
  Check,
  Pencil,
  Trash2,
  X,
  LogOut,
  Circle,
  Menu,
  Search,
  ShieldCheck,
  ChevronDown,
  Command,
} from "lucide-react";
import { demoContent, demoRuns, demoTasks } from "@/lib/demo";
import {
  parseTask,
  statusLabels,
  storageKey,
  statuses,
  type Task,
  type TaskInput,
  type Workspace,
  type Status,
} from "@/lib/domain";

type View = "overview" | "tasks" | "automation" | "content" | "settings";
const nav = [
  { id: "overview" as View, label: "Overview", icon: LayoutDashboard },
  { id: "tasks" as View, label: "업무 관리", icon: ListTodo },
  { id: "automation" as View, label: "자동화", icon: Workflow },
  { id: "content" as View, label: "콘텐츠 파이프라인", icon: PanelsTopLeft },
  { id: "settings" as View, label: "연결 및 설정", icon: Settings },
];
const emptyTask: TaskInput = {
  title: "",
  notes: "",
  status: "pending",
  priority: "normal",
  due_date: null,
};
function Badge({ status }: { status: Status }) {
  return (
    <span className={`badge ${status}`}>
      <span className="dot" />
      {statusLabels[status]}
    </span>
  );
}
async function request(url: string, method = "GET", body?: unknown) {
  const response = await fetch(url, {
    method,
    cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "요청에 실패했습니다.");
  return data;
}
export function Dashboard({ demoOnly = false }: { demoOnly?: boolean }) {
  const [workspace, setWorkspace] = useState<Workspace>("PERSONAL");
  const [view, setView] = useState<View>("overview");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [configured, setConfigured] = useState<boolean | null>(
    demoOnly ? false : null,
  );
  const [user, setUser] = useState<{ email?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Status | "all">("all");
  const [editor, setEditor] = useState<{
    id?: string;
    input: TaskInput;
  } | null>(null);
  const [deleting, setDeleting] = useState<Task | null>(null);
  const [busy, setBusy] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const version = useRef(0);
  const demo = workspace === "FRENGLE" || configured === false;
  const canWrite = !loading && (demo || Boolean(user));

  useEffect(() => {
    if (demoOnly) return;
    let active = true;
    request("/api/session")
      .then((data) => {
        if (active) {
          setConfigured(data.configured);
          setUser(data.user);
        }
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [demoOnly]);
  useEffect(() => {
    if (configured === null) return;
    const current = ++version.current;
    queueMicrotask(() => {
      if (version.current !== current) return;
      setLoading(true);
      setTasks([]);
      setError("");
      setNotice("");
      if (demo) {
        try {
          const saved = localStorage.getItem(storageKey(workspace));
          const data = saved ? JSON.parse(saved) : demoTasks(workspace);
          if (
            !Array.isArray(data) ||
            data.some(
              (t) =>
                typeof t.id !== "string" ||
                typeof t.created_at !== "string" ||
                !parseTask(t),
            )
          )
            throw new Error("invalid");
          setTasks(data);
        } catch {
          setTasks(demoTasks(workspace));
          setNotice("저장된 테스트 데이터를 읽지 못해 예시 업무를 표시합니다.");
        }
        setLoading(false);
      } else if (user) {
        request("/api/tasks?workspace=PERSONAL")
          .then((data) => {
            if (version.current === current) setTasks(data.tasks);
          })
          .catch((e) => {
            if (version.current === current) setError(e.message);
          })
          .finally(() => {
            if (version.current === current) setLoading(false);
          });
      } else {
        setLoading(false);
      }
    });
    return () => {
      version.current = current + 1;
    };
  }, [workspace, configured, user, demo]);

  function selectWorkspace(next: Workspace) {
    version.current++;
    setWorkspace(next);
    setTasks([]);
    setLoading(true);
    setEditor(null);
    setDeleting(null);
    setQuery("");
    setFilter("all");
  }
  function persist(next: Task[]) {
    localStorage.setItem(storageKey(workspace), JSON.stringify(next));
    setTasks(next);
  }
  async function saveTask(e: FormEvent) {
    e.preventDefault();
    if (!editor || busy) return;
    setBusy(true);
    setError("");
    try {
      const input = parseTask(editor.input);
      if (demo) {
        const task: Task = {
          ...input,
          id: editor.id || crypto.randomUUID(),
          created_at:
            tasks.find((t) => t.id === editor.id)?.created_at ||
            new Date().toISOString(),
        };
        persist(
          editor.id
            ? tasks.map((t) => (t.id === editor.id ? task : t))
            : [task, ...tasks],
        );
      } else {
        const data = await request(
          "/api/tasks?workspace=PERSONAL",
          editor.id ? "PATCH" : "POST",
          { ...input, ...(editor.id ? { id: editor.id } : {}) },
        );
        setTasks((prev) =>
          editor.id
            ? prev.map((t) => (t.id === editor.id ? data.task : t))
            : [data.task, ...prev],
        );
      }
      setEditor(null);
      setNotice(
        demo
          ? "테스트 업무를 브라우저에 저장했습니다."
          : "개인 DB에 업무를 저장했습니다.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }
  async function complete(task: Task) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const input = {
        ...task,
        status:
          task.status === "completed"
            ? ("pending" as const)
            : ("completed" as const),
      };
      if (demo) persist(tasks.map((t) => (t.id === task.id ? input : t)));
      else {
        const data = await request(
          "/api/tasks?workspace=PERSONAL",
          "PATCH",
          input,
        );
        setTasks((prev) => prev.map((t) => (t.id === task.id ? data.task : t)));
      }
      setNotice("업무 상태를 변경했습니다.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "변경에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!deleting || busy) return;
    setBusy(true);
    setError("");
    try {
      if (demo) persist(tasks.filter((t) => t.id !== deleting.id));
      else {
        await request("/api/tasks?workspace=PERSONAL", "DELETE", {
          id: deleting.id,
        });
        setTasks((prev) => prev.filter((t) => t.id !== deleting.id));
      }
      setDeleting(null);
      setNotice("업무를 삭제했습니다.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "삭제에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }
  async function login(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(e.currentTarget);
    try {
      await request("/api/auth", "POST", {
        email: data.get("email"),
        password: data.get("password"),
      });
      const session = await request("/api/session");
      setUser(session.user);
      setNotice("개인 계정으로 로그인했습니다.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "로그인에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    try {
      await request("/api/auth", "POST", { action: "logout" });
      setUser(null);
      setTasks([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "로그아웃 실패");
    } finally {
      setBusy(false);
    }
  }
  const visible = tasks.filter(
    (t) =>
      (filter === "all" || t.status === filter) &&
      `${t.title} ${t.notes}`.toLowerCase().includes(query.toLowerCase()),
  );
  const completed = tasks.filter((t) => t.status === "completed").length;
  const active = tasks.filter((t) => t.status !== "completed").length;
  const title = nav.find((n) => n.id === view)!.label;
  const table = (
    <section className="card task-card">
      <div className="section-head">
        <div>
          <h2>{view === "overview" ? "지금 집중할 업무" : "전체 업무"}</h2>
          <p>
            {demo
              ? "선택한 워크스페이스의 테스트 업무"
              : "PERSONAL 계정에 저장된 업무"}
          </p>
        </div>
        {view === "overview" ? (
          <button className="text-button" onClick={() => setView("tasks")}>
            전체 보기 <ArrowUpRight size={15} />
          </button>
        ) : null}
      </div>
      <div className="task-tools">
        <label className="search">
          <Search size={17} />
          <input
            aria-label="업무 검색"
            placeholder="업무 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <select
          aria-label="업무 상태 필터"
          value={filter}
          onChange={(e) => setFilter(e.target.value as Status | "all")}
        >
          <option value="all">모든 상태</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {statusLabels[s]}
            </option>
          ))}
        </select>
      </div>
      {loading ? (
        <p className="empty">업무를 불러오는 중입니다…</p>
      ) : !canWrite ? (
        <p className="empty">
          연결 설정과 개인 계정 로그인 후 업무를 사용할 수 있습니다.
        </p>
      ) : visible.length === 0 ? (
        <p className="empty">
          표시할 업무가 없습니다. 새 업무를 등록해 보세요.
        </p>
      ) : (
        <div className="task-list">
          {visible.map((task) => (
            <div className="task-row" key={task.id}>
              <button
                className={`check-button ${task.status === "completed" ? "checked" : ""}`}
                aria-label={`${task.title} ${task.status === "completed" ? "완료 취소" : "완료"}`}
                disabled={busy}
                onClick={() => complete(task)}
              >
                {task.status === "completed" ? (
                  <Check size={16} />
                ) : (
                  <Circle size={16} />
                )}
              </button>
              <div className="task-info">
                <strong className={task.status === "completed" ? "strike" : ""}>
                  {task.title}
                </strong>
                <span>
                  {task.priority === "high"
                    ? "높은 우선순위"
                    : task.priority === "low"
                      ? "낮은 우선순위"
                      : "보통 우선순위"}{" "}
                  · {task.due_date || "마감일 없음"}
                </span>
                {task.notes ? <p>{task.notes}</p> : null}
              </div>
              <Badge status={task.status} />
              <div className="row-actions">
                <button
                  aria-label={`${task.title} 수정`}
                  disabled={busy}
                  onClick={() => {
                    setError("");
                    setEditor({
                      id: task.id,
                      input: {
                        title: task.title,
                        notes: task.notes,
                        status: task.status,
                        priority: task.priority,
                        due_date: task.due_date,
                      },
                    });
                  }}
                >
                  <Pencil size={16} />
                </button>
                <button
                  aria-label={`${task.title} 삭제`}
                  disabled={busy}
                  onClick={() => setDeleting(task)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
  const automations = (
    <section className="card">
      <div className="section-head">
        <div>
          <h2>자동화 실행 상태</h2>
          <p>연동 전 · 예시 실행 기록</p>
        </div>
        <Workflow size={18} />
      </div>
      {demoRuns.map((run) => (
        <div className="run-row" key={run.name}>
          <div className={`run-icon ${run.status}`}>
            <Workflow size={18} />
          </div>
          <div className="grow">
            <strong>{run.name}</strong>
            <small>{run.time}</small>
          </div>
          <Badge status={run.status} />
        </div>
      ))}
      <p className="card-foot">
        실제 자동화가 실행되거나 연결된 상태가 아닙니다.
      </p>
    </section>
  );
  const content = (
    <section className="card">
      <div className="section-head">
        <div>
          <h2>콘텐츠 파이프라인</h2>
          <p>기획부터 발행까지, 한눈에</p>
        </div>
        <span className="subtle-label">테스트용 예시</span>
      </div>
      <div className="pipeline">
        {["기획", "제작", "검토", "발행"].map((stage) => (
          <div className="stage" key={stage}>
            <div className="stage-title">
              {stage}
              <span>{demoContent.filter((c) => c.stage === stage).length}</span>
            </div>
            {demoContent
              .filter((c) => c.stage === stage)
              .map((c) => (
                <div className="content-item" key={c.title}>
                  <small>{c.type} · 예시</small>
                  <strong>{c.title}</strong>
                </div>
              ))}
            {stage === "발행" ? <p className="stage-empty">발행 대기</p> : null}
          </div>
        ))}
      </div>
      <p className="card-foot">
        현재는 예시 조회 화면입니다. 콘텐츠 편집·발행 연동은 후속 단계입니다.
      </p>
    </section>
  );

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        본문으로 이동
      </a>
      {mobileNav ? (
        <button
          className="nav-backdrop"
          aria-label="메뉴 닫기"
          onClick={() => setMobileNav(false)}
        />
      ) : null}
      <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
        <Link className="brand" href="/">
          <span className="brand-mark">
            <Command size={20} />
          </span>
          MY OPS<span className="phase">01</span>
        </Link>
        <div className="nav-caption">WORKSPACE</div>
        <nav aria-label="주 메뉴">
          {nav.map((n) => (
            <button
              key={n.id}
              className={view === n.id ? "selected" : ""}
              aria-current={view === n.id ? "page" : undefined}
              onClick={() => {
                setView(n.id);
                setMobileNav(false);
              }}
            >
              <n.icon size={19} />
              {n.label}
              {n.id === "tasks" ? (
                <span className="nav-count">{tasks.length}</span>
              ) : null}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="separation">
            <ShieldCheck size={18} />
            <div>
              <strong>워크스페이스 분리</strong>
              <small>개인과 회사, 독립된 데이터</small>
            </div>
          </div>
          <div className="profile">
            <span className="avatar">ME</span>
            <div>
              <strong>나의 운영 공간</strong>
              <small>
                {user?.email ||
                  (demo ? "Phase 1 · 테스트 모드" : "개인 계정 로그인 필요")}
              </small>
            </div>
            {user ? (
              <button aria-label="로그아웃" disabled={busy} onClick={logout}>
                <LogOut size={17} />
              </button>
            ) : null}
          </div>
        </div>
      </aside>
      <div className="workspace-shell">
        <header className="topbar">
          <div className="workspace-picker">
            <button
              className="icon-button menu-button"
              aria-label="메뉴 열기"
              onClick={() => setMobileNav(true)}
            >
              <Menu size={20} />
            </button>
            <span
              className={`workspace-dot ${workspace === "FRENGLE" ? "company" : ""}`}
            />
            <label className="sr-only" htmlFor="workspace">
              워크스페이스 선택
            </label>
            <select
              id="workspace"
              value={workspace}
              disabled={busy}
              onChange={(e) => selectWorkspace(e.target.value as Workspace)}
            >
              <option>PERSONAL</option>
              <option>FRENGLE</option>
            </select>
            <ChevronDown size={15} />
            <span className="workspace-caption">
              {workspace === "PERSONAL"
                ? "개인 워크스페이스"
                : "회사 워크스페이스"}
            </span>
          </div>
          <span className="top-status">
            <span className="dot" />
            {demo
              ? "테스트 데이터"
              : user
                ? "개인 계정 로그인"
                : configured
                  ? "로그인 필요"
                  : "연결 확인 중"}
          </span>
        </header>
        <main id="main">
          <div className="page-heading">
            <div>
              <div className="eyebrow">MY OPERATING SPACE / {workspace}</div>
              <h1>{view === "overview" ? "오늘의 업무, 한눈에." : title}</h1>
              <p>
                {view === "overview"
                  ? "해야 할 일과 흐름을 정리하고, 중요한 일에 집중하세요."
                  : "내 업무의 상태와 다음 단계를 확인하세요."}
              </p>
            </div>
            {view === "overview" || view === "tasks" ? (
              <button
                className="primary"
                disabled={!canWrite || busy}
                onClick={() => {
                  setError("");
                  setEditor({ input: { ...emptyTask } });
                }}
              >
                <Plus size={18} />새 업무
              </button>
            ) : null}
          </div>
          <div className="mode-banner">
            <span className="banner-icon">
              <ShieldCheck size={18} />
            </span>
            <div>
              <strong>
                {workspace === "FRENGLE"
                  ? "FRENGLE · 실제 연결 승인 대기"
                  : configured === false
                    ? "PERSONAL · DB 미연결 / 테스트 모드"
                    : configured === null
                      ? "연결 상태 확인 중"
                      : "PERSONAL · 개인 Supabase 설정됨"}
              </strong>
              <p>
                {demo
                  ? "이 화면은 예시 데이터입니다. 업무 변경은 이 브라우저의 테스트 저장소에만 반영됩니다."
                  : user
                    ? "개인 DB 저장 모드입니다. 저장·조회 성공 여부는 각 요청 결과로 확인합니다. 자동화·콘텐츠는 예시 화면입니다."
                    : "개인 계정 로그인 전입니다. 실제 데이터를 조회하거나 저장하지 않습니다."}
              </p>
            </div>
            <button className="text-button" onClick={() => setView("settings")}>
              연결 설정 <ArrowUpRight size={15} />
            </button>
          </div>
          {error ? (
            <div className="alert error" role="alert">
              {error}
            </div>
          ) : null}
          {notice ? (
            <div className="alert notice" role="status">
              {notice}
            </div>
          ) : null}
          {view === "overview" ? (
            <>
              <div className="stats">
                <div className="stat card">
                  <span>
                    전체 업무 <ListTodo size={18} />
                  </span>
                  <strong>
                    {loading ? "—" : tasks.length}
                    <small>개</small>
                  </strong>
                  <p>{demo ? "테스트 업무 기준" : "선택한 개인 계정 기준"}</p>
                </div>
                <div className="stat card">
                  <span>
                    진행 중 <Circle size={18} />
                  </span>
                  <strong>
                    {loading
                      ? "—"
                      : tasks.filter((t) => t.status === "running").length}
                    <small>개</small>
                  </strong>
                  <p>지금 집중하고 있는 업무</p>
                </div>
                <div className="stat card">
                  <span>
                    완료 업무 <Check size={18} />
                  </span>
                  <strong>
                    {loading ? "—" : completed}
                    <small>개</small>
                  </strong>
                  <p>
                    전체의{" "}
                    {tasks.length
                      ? Math.round((completed / tasks.length) * 100)
                      : 0}
                    % 완료
                  </p>
                </div>
                <div className="stat card">
                  <span>
                    남은 업무 <Workflow size={18} />
                  </span>
                  <strong>
                    {loading ? "—" : active}
                    <small>개</small>
                  </strong>
                  <p>
                    실패 {tasks.filter((t) => t.status === "failed").length}개
                    포함
                  </p>
                </div>
              </div>
              <div className="dashboard-grid">
                {table}
                <div className="right-column">
                  {automations}
                  <div className="focus-card">
                    <small>MAKE ROOM FOR FOCUS</small>
                    <h2>
                      작은 완료가
                      <br />
                      하루를 바꿉니다.
                    </h2>
                    <p>가장 중요한 업무 하나부터 시작하세요.</p>
                    <button onClick={() => setView("tasks")}>
                      업무 정리하기 <ArrowUpRight size={17} />
                    </button>
                  </div>
                </div>
              </div>
              {content}
            </>
          ) : null}
          {view === "tasks" ? table : null}
          {view === "automation" ? automations : null}
          {view === "content" ? content : null}
          {view === "settings" ? (
            <div className="settings-grid">
              <section className="card">
                <div className="section-head">
                  <div>
                    <h2>PERSONAL 연결</h2>
                    <p>별도 개인 Supabase 프로젝트</p>
                  </div>
                  <ShieldCheck size={20} />
                </div>
                <div className="settings-body">
                  <p>
                    인증 설정:{" "}
                    {configured === null
                      ? "확인하지 못함"
                      : configured
                        ? "환경변수 설정됨 · 로그인 필요"
                        : "미연결"}
                  </p>
                  <p>
                    DB 상태:{" "}
                    {configured && user
                      ? "업무 화면에서 조회 결과 확인 필요"
                      : "실제 DB 검증 전"}
                  </p>
                  {configured && !user ? (
                    <form onSubmit={login} className="login-form">
                      <label>
                        개인 계정 이메일
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
                      <button className="primary" disabled={busy}>
                        개인 계정 로그인
                      </button>
                    </form>
                  ) : (
                    <p>
                      {user
                        ? `로그인 계정: ${user.email}`
                        : "프로젝트 URL과 publishable key 설정 후 로그인할 수 있습니다. 비밀키는 채팅이나 Git에 저장하지 마세요."}
                    </p>
                  )}
                  <small>
                    회원가입은 제공하지 않습니다. 승인된 개인 계정을
                    Supabase에서 생성하세요.
                  </small>
                </div>
              </section>
              <section className="card">
                <div className="section-head">
                  <div>
                    <h2>FRENGLE 연결</h2>
                    <p>승인 대기 · 인터페이스만 설계</p>
                  </div>
                </div>
                <div className="settings-body">
                  <p>회사 운영 시스템과 DB에 접근하지 않습니다.</p>
                  <p>
                    별도 프로젝트, 회사 전용 인증, 서버 권한 정책을 후속 승인 후
                    구현합니다. 개인 DB나 개인 로그인으로 회사 데이터를 조회하지
                    않습니다.
                  </p>
                  <span className="badge pending">미연결</span>
                </div>
              </section>
            </div>
          ) : null}
          <footer>
            MY OPS <span>나만의 업무 운영 OS · Phase 1</span>
          </footer>
        </main>
      </div>
      {editor ? (
        <TaskEditor
          editor={editor}
          setEditor={setEditor}
          busy={busy}
          error={error}
          demo={demo}
          onSubmit={saveTask}
        />
      ) : null}
      {deleting ? (
        <ConfirmDelete
          task={deleting}
          busy={busy}
          error={error}
          cancel={() => setDeleting(null)}
          confirm={remove}
        />
      ) : null}
    </div>
  );
}
function TaskEditor({
  editor,
  setEditor,
  busy,
  error,
  demo,
  onSubmit,
}: {
  editor: { id?: string; input: TaskInput };
  setEditor: (v: { id?: string; input: TaskInput } | null) => void;
  busy: boolean;
  error: string;
  demo: boolean;
  onSubmit: (e: FormEvent) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  function field<K extends keyof TaskInput>(key: K, value: TaskInput[K]) {
    setEditor({ ...editor, input: { ...editor.input, [key]: value } });
  }
  return (
    <dialog
      ref={dialog}
      className="modal"
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else setEditor(null);
      }}
      aria-labelledby="task-editor-title"
    >
      <form onSubmit={onSubmit}>
        <div className="section-head">
          <div>
            <h2 id="task-editor-title">
              {editor.id ? "업무 수정" : "새 업무 등록"}
            </h2>
            <p>
              {demo
                ? "테스트 데이터 · 브라우저 저장"
                : "PERSONAL · 개인 DB 저장"}
            </p>
          </div>
          <button
            type="button"
            aria-label="닫기"
            disabled={busy}
            onClick={() => setEditor(null)}
          >
            <X size={20} />
          </button>
        </div>
        <div className="form-body">
          <label>
            업무 제목
            <input
              autoFocus
              required
              maxLength={120}
              value={editor.input.title}
              onChange={(e) => field("title", e.target.value)}
              placeholder="어떤 일을 해야 하나요?"
            />
          </label>
          <label>
            메모
            <textarea
              maxLength={2000}
              rows={3}
              value={editor.input.notes}
              onChange={(e) => field("notes", e.target.value)}
            />
          </label>
          <div className="form-grid">
            <label>
              상태
              <select
                aria-label="상태"
                value={editor.input.status}
                onChange={(e) => field("status", e.target.value as Status)}
              >
                {statuses.map((s) => (
                  <option value={s} key={s}>
                    {statusLabels[s]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              우선순위
              <select
                aria-label="우선순위"
                value={editor.input.priority}
                onChange={(e) =>
                  field("priority", e.target.value as TaskInput["priority"])
                }
              >
                <option value="high">높음</option>
                <option value="normal">보통</option>
                <option value="low">낮음</option>
              </select>
            </label>
          </div>
          <label>
            마감일
            <input
              type="date"
              value={editor.input.due_date || ""}
              onChange={(e) => field("due_date", e.target.value || null)}
            />
          </label>
          {error ? (
            <p role="alert" className="error">
              {error}
            </p>
          ) : null}
          <div className="form-actions">
            <button
              type="button"
              disabled={busy}
              onClick={() => setEditor(null)}
            >
              취소
            </button>
            <button className="primary" disabled={busy}>
              {busy ? "저장 중…" : "저장"}
            </button>
          </div>
        </div>
      </form>
    </dialog>
  );
}
function ConfirmDelete({
  task,
  busy,
  error,
  cancel,
  confirm,
}: {
  task: Task;
  busy: boolean;
  error: string;
  cancel: () => void;
  confirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="modal"
      aria-labelledby="delete-title"
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else cancel();
      }}
    >
      <div className="form-body">
        <h2 id="delete-title">업무를 삭제할까요?</h2>
        <p>{task.title}</p>
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="form-actions">
          <button disabled={busy} onClick={cancel}>
            취소
          </button>
          <button className="danger-button" disabled={busy} onClick={confirm}>
            {busy ? "삭제 중…" : "삭제"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
