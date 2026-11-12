"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { UserRound, LogOut, RefreshCw } from "lucide-react";
import { OpsDialog } from "./ops-dialog";
import {
  plannerLocation,
  type PlannerLocation,
  type PlannerView,
} from "@/lib/planner-navigation";
import "./personal-planner-shell.css";

const ContentPlanner = dynamic(
  () =>
    import("./personal-content-planner").then(
      (module) => module.PersonalContentPlanner,
    ),
  { loading: () => <PanelLoading /> },
);
const YogaSpace = dynamic(
  () =>
    import("./personal-yoga-space").then((module) => module.PersonalYogaSpace),
  { loading: () => <PanelLoading /> },
);
type Session = { configured: boolean; user: { email?: string } | null };
type AuthState = "loading" | "ready" | "error";

function PanelLoading() {
  return (
    <div className="planner-loading" role="status">
      <span aria-hidden="true">🌿</span>플래너를 준비하고 있어요.
    </div>
  );
}

async function requestSession(signal?: AbortSignal): Promise<Session> {
  const response = await fetch("/api/session", {
    cache: "no-store",
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(20000)])
      : AbortSignal.timeout(20000),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || "로그인 상태를 확인하지 못했어요.");
  return result;
}

export function PersonalPlannerShell() {
  const [location, setLocation] = useState<PlannerLocation>({
    view: "content",
  });
  const [session, setSession] = useState<Session | null>(null);
  const knownSession = useRef<Session | null>(null);
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [accountOpen, setAccountOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const generation = useRef(0);
  const actionBusy = useRef(false);
  const authController = useRef<AbortController | null>(null);

  const checkSession = useCallback(async (showLoading = false) => {
    const current = ++generation.current;
    authController.current?.abort();
    const controller = new AbortController();
    authController.current = controller;
    if (showLoading) setAuthState("loading");
    try {
      const next = await requestSession(controller.signal);
      if (current !== generation.current) return;
      knownSession.current = next;
      setSession(next);
      setAuthState("ready");
      setError("");
    } catch (cause) {
      if (controller.signal.aborted || current !== generation.current) return;
      if (!showLoading && knownSession.current?.user) {
        setError(
          "연결 확인이 잠시 지연되고 있어요. 작성 중인 내용은 유지돼요.",
        );
        return;
      }
      setAuthState("error");
      setSession(null);
      setError(
        cause instanceof Error ? cause.message : "연결을 확인해 주세요.",
      );
    }
  }, []);

  useEffect(() => {
    let alive = true;
    const lifecycle = generation;
    const readLocation = () =>
      setLocation(plannerLocation(new URLSearchParams(window.location.search)));
    queueMicrotask(() => {
      if (!alive) return;
      readLocation();
      void checkSession();
    });
    let lastCheck = Date.now();
    const onReturn = () => {
      if (
        document.visibilityState !== "visible" ||
        !navigator.onLine ||
        actionBusy.current ||
        document.querySelector("dialog[open]") ||
        Date.now() - lastCheck < 5000
      )
        return;
      lastCheck = Date.now();
      void checkSession();
    };
    window.addEventListener("popstate", readLocation);
    window.addEventListener("focus", onReturn);
    window.addEventListener("online", onReturn);
    document.addEventListener("visibilitychange", onReturn);
    return () => {
      alive = false;
      ++lifecycle.current;
      authController.current?.abort();
      window.removeEventListener("popstate", readLocation);
      window.removeEventListener("focus", onReturn);
      window.removeEventListener("online", onReturn);
      document.removeEventListener("visibilitychange", onReturn);
    };
  }, [checkSession]);

  const expired = useCallback(() => {
    ++generation.current;
    authController.current?.abort();
    knownSession.current = { configured: true, user: null };
    setSession({ configured: true, user: null });
    setAuthState("ready");
    setError("로그인이 만료됐어요. 다시 로그인해 주세요.");
  }, []);

  function move(view: PlannerView) {
    if (location.view === view) return;
    setLocation({ view });
    window.history.pushState(
      null,
      "",
      view === "yoga" ? "/?view=yoga-planner" : "/",
    );
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (actionBusy.current) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    actionBusy.current = true;
    setBusy(true);
    setError("");
    const current = ++generation.current;
    authController.current?.abort();
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: fields.get("email"),
          password: fields.get("password"),
        }),
        signal: AbortSignal.timeout(20000),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "로그인하지 못했어요.");
      const next = await requestSession();
      if (current !== generation.current) return;
      if (!next.user)
        throw new Error(
          "로그인 상태가 아직 확인되지 않았어요. 다시 시도해 주세요.",
        );
      form.reset();
      knownSession.current = next;
      setSession(next);
      setAuthState("ready");
      setAccountOpen(false);
      setRevision((value) => value + 1);
    } catch (cause) {
      if (current === generation.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "로그인 요청을 확인해 주세요.",
        );
    } finally {
      actionBusy.current = false;
      setBusy(false);
    }
  }

  async function logout() {
    if (actionBusy.current) return;
    actionBusy.current = true;
    setBusy(true);
    setError("");
    ++generation.current;
    authController.current?.abort();
    try {
      const { disconnectThisDevicePush } = await import(
        "./yoga-reminder-panel"
      );
      await disconnectThisDevicePush();
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
        signal: AbortSignal.timeout(20000),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "로그아웃하지 못했어요.");
      knownSession.current = { configured: true, user: null };
      setSession(knownSession.current);
      setAccountOpen(false);
      setRevision((value) => value + 1);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "잠시 후 다시 시도해 주세요.",
      );
    } finally {
      actionBusy.current = false;
      setBusy(false);
    }
  }

  const signedIn =
    authState === "ready" && Boolean(session?.configured && session.user);
  const identity = `${session?.user?.email || "guest"}:${revision}`;
  const yoga = location.view === "yoga";
  return (
    <div className={`personal-planner ${yoga ? "is-yoga" : "is-content"}`}>
      <a href="#planner-main" className="planner-skip">
        본문으로 바로가기
      </a>
      <header className="planner-header">
        <Link
          className="planner-brand"
          href="/"
          prefetch={false}
          onClick={(event) => {
            event.preventDefault();
            move("content");
          }}
          aria-label="개인 플래너 홈"
        >
          <span aria-hidden="true">🫧</span>
          <strong>나의 플래너</strong>
        </Link>
        <button
          className="planner-account"
          aria-label="내 계정"
          onClick={() => {
            setError("");
            setAccountOpen(true);
          }}
        >
          <UserRound size={18} />
          <span>내 계정</span>
        </button>
      </header>
      <main id="planner-main" className="planner-main">
        <div className="planner-page-heading">
          <span className="planner-heading-chip" aria-hidden="true">
            {yoga ? "🧘" : "✏️"}
          </span>
          <div>
            <h1>{yoga ? "요가 플래너" : "콘텐츠 플래너"}</h1>
            <p>
              {yoga
                ? "오늘의 몸과 마음에 맞는 영상 한 편."
                : "만들고 싶은 이야기, 하나씩 차근차근."}
            </p>
          </div>
        </div>
        {signedIn && error && !accountOpen && (
          <p className="planner-error" role="status">
            {error}
          </p>
        )}
        {authState === "loading" ? (
          <PanelLoading />
        ) : signedIn ? (
          yoga ? (
            <YogaSpace
              key={`yoga:${identity}:${location.day || "today"}:${location.schedule || ""}`}
              enabled
              initialDay={location.day}
              focusedId={location.schedule}
              onSessionExpired={expired}
            />
          ) : (
            <ContentPlanner
              key={`content:${identity}`}
              enabled
              onSessionExpired={expired}
            />
          )
        ) : (
          <section className="planner-signin" aria-label="개인 계정 로그인">
            <span className="planner-signin-icon" aria-hidden="true">
              🌷
            </span>
            <h2>
              {authState === "error"
                ? "연결을 다시 확인해 주세요"
                : "내 플래너를 열어볼까요?"}
            </h2>
            <p>
              기존 PERSONAL 계정으로 로그인하면
              <br />
              콘텐츠 시트와 요가 일정을 이어서 볼 수 있어요.
            </p>
            {error && (
              <p role="alert" className="planner-error">
                {error}
              </p>
            )}
            {authState === "error" ? (
              <button
                className="planner-primary"
                onClick={() => void checkSession(true)}
              >
                <RefreshCw size={16} />
                다시 확인
              </button>
            ) : session?.configured === false ? (
              <p role="alert">
                계정 연결 설정을 확인해야 해요. 잠시 후 다시 시도해 주세요.
              </p>
            ) : (
              <button
                className="planner-primary"
                onClick={() => setAccountOpen(true)}
              >
                로그인
              </button>
            )}
          </section>
        )}
      </main>
      <nav className="planner-tabs" aria-label="플래너 메뉴">
        <button
          type="button"
          aria-current={!yoga ? "page" : undefined}
          onClick={() => move("content")}
        >
          <span className="planner-tab-icon" aria-hidden="true">
            ✏️
          </span>
          <span>콘텐츠 플래너</span>
        </button>
        <button
          type="button"
          aria-current={yoga ? "page" : undefined}
          onClick={() => move("yoga")}
        >
          <span className="planner-tab-icon" aria-hidden="true">
            🧘
          </span>
          <span>요가 플래너</span>
        </button>
      </nav>
      {accountOpen && (
        <OpsDialog
          title={signedIn ? "내 계정" : "로그인"}
          busy={busy}
          close={() => {
            setAccountOpen(false);
            setError("");
          }}
        >
          {signedIn ? (
            <div className="planner-account-body">
              <p>{session?.user?.email}</p>
              <p>로그아웃하면 이 기기의 요가 알림도 해제돼요.</p>
              {error && (
                <p role="alert" className="planner-error">
                  {error}
                </p>
              )}
              <button
                type="button"
                disabled={busy}
                className="planner-secondary"
                onClick={() => void logout()}
              >
                <LogOut size={16} />
                로그아웃
              </button>
            </div>
          ) : (
            <form className="planner-login" onSubmit={login}>
              <p>기존 PERSONAL 계정으로 로그인해 주세요.</p>
              <label>
                이메일
                <input
                  type="email"
                  name="email"
                  autoComplete="username"
                  maxLength={254}
                  required
                  disabled={busy}
                />
              </label>
              <label>
                비밀번호
                <input
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  maxLength={256}
                  required
                  disabled={busy}
                />
              </label>
              {error && (
                <p className="planner-error" role="alert">
                  {error}
                </p>
              )}
              <button
                type="submit"
                className="planner-primary"
                disabled={
                  busy ||
                  authState === "loading" ||
                  session?.configured === false
                }
              >
                {busy ? "로그인 중…" : "플래너 열기"}
              </button>
            </form>
          )}
        </OpsDialog>
      )}
    </div>
  );
}
