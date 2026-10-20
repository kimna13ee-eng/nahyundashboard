"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  CalendarDays,
  Command,
  Layers3,
  RefreshCw,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  automationReceiptTime,
  automationSourceLabel,
  chatGptSourceUrl,
} from "@/lib/automation-receipts";
import {
  allWorkspaces,
  emptyWorkspaceSnapshot,
  loadWorkspaceSnapshot,
  workspaceCalendarItems,
  workspaceHome,
  type WorkspaceSnapshot,
} from "@/lib/all-workspaces";
import { scheduleOverlaps, seoulDate, uuid, type OpsRow } from "@/lib/ops";
import { weeklyScheduleRows, weeklyScheduleTime } from "@/lib/overview-summary";
import type { ApiWorkspace } from "@/lib/workspace-api";
import "./all-workspaces-overview.css";

function Badge({ workspace }: { workspace: ApiWorkspace }) {
  return (
    <span
      className={`ops-all-badge ${workspace === "FRENGLE" ? "company" : ""}`}
    >
      {workspace}
    </span>
  );
}

function formatDay(day: string) {
  return day ? `${Number(day.slice(5, 7))}.${Number(day.slice(8, 10))}` : "—";
}

function calendarHref(item: OpsRow & { workspace: ApiWorkspace }, day: string) {
  const params = new URLSearchParams({ view: "calendar", date: day });
  if (item.source === "일정" && uuid(item.id)) params.set("schedule", item.id);
  return `${workspaceHome(item.workspace)}?${params}`;
}

export function AllWorkspacesOverview() {
  const [snapshots, setSnapshots] = useState<
    Record<ApiWorkspace, WorkspaceSnapshot>
  >(() => ({
    PERSONAL: emptyWorkspaceSnapshot("PERSONAL"),
    FRENGLE: emptyWorkspaceSnapshot("FRENGLE"),
  }));
  const [refreshing, setRefreshing] = useState(true);
  const [today, setToday] = useState("");
  const [checkedAt, setCheckedAt] = useState("");
  const generation = useRef(0);
  const active = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    const request = ++generation.current;
    setRefreshing(true);
    setToday(seoulDate(new Date()));
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      // Independent sessions and APIs: a missing company session never falls back to PERSONAL.
      await Promise.all(
        allWorkspaces.map(async (workspace) => {
          const next = await loadWorkspaceSnapshot(
            workspace,
            controller.signal,
          );
          if (request === generation.current)
            setSnapshots((current) => ({ ...current, [workspace]: next }));
        }),
      );
      if (request === generation.current)
        setCheckedAt(new Date().toISOString());
    } finally {
      clearTimeout(timeout);
      if (request === generation.current) {
        active.current = null;
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    const requestGeneration = generation;
    const initial = window.setTimeout(() => void refresh(), 0);
    const whenVisible = () => {
      if (document.visibilityState === "visible" && !active.current)
        void refresh();
    };
    const interval = window.setInterval(whenVisible, 60_000);
    document.addEventListener("visibilitychange", whenVisible);
    return () => {
      ++requestGeneration.current;
      active.current?.abort();
      clearTimeout(initial);
      clearInterval(interval);
      document.removeEventListener("visibilitychange", whenVisible);
    };
  }, [refresh]);

  const items = allWorkspaces.flatMap((workspace) =>
    workspaceCalendarItems(snapshots[workspace]),
  );
  const todayItems = today
    ? items
        .filter((item) => scheduleOverlaps(item, today))
        .sort(
          (a, b) =>
            Date.parse(String(a.starts_at)) - Date.parse(String(b.starts_at)),
        )
    : [];
  const week = today ? weeklyScheduleRows(items, today) : [];
  const recent = allWorkspaces
    .flatMap((workspace) =>
      (snapshots[workspace].results || []).map(
        (result): OpsRow & { workspace: ApiWorkspace } => ({
          ...result,
          workspace,
        }),
      ),
    )
    .sort(
      (a, b) =>
        (Date.parse(String(b.received_at)) || 0) -
        (Date.parse(String(a.received_at)) || 0),
    )
    .slice(0, 6);
  const incomplete = allWorkspaces.some(
    (workspace) =>
      snapshots[workspace].tasks === null ||
      snapshots[workspace].schedules === null,
  );
  const partial = allWorkspaces.some(
    (workspace) => snapshots[workspace].partial,
  );

  return (
    <div className="ops-all-shell">
      <a className="skip-link" href="#all-main">
        본문으로 이동
      </a>
      <aside className="ops-all-sidebar">
        <Link href="/all" className="ops-all-brand">
          <Command size={25} aria-hidden="true" /> MY OPS <small>ALL</small>
        </Link>
        <p className="ops-all-nav-caption">MY OPERATING SPACE</p>
        <nav aria-label="워크스페이스 바로가기">
          <Link className="selected" href="/all" aria-current="page">
            <Layers3 size={17} aria-hidden="true" /> 통합 Overview
          </Link>
          <Link href="/">
            <span className="ops-all-space-dot" /> PERSONAL{" "}
            <ArrowUpRight size={14} aria-hidden="true" />
          </Link>
          <Link href="/frengle">
            <span className="ops-all-space-dot company" /> FRENGLE{" "}
            <ArrowUpRight size={14} aria-hidden="true" />
          </Link>
        </nav>
        <p className="ops-all-sidebar-note">
          개인과 회사의 흐름을
          <br />
          한곳에서 확인해요.
        </p>
      </aside>
      <div className="ops-all-workspace">
        <header className="ops-all-topbar">
          <label className="ops-all-picker">
            <Layers3 size={15} aria-hidden="true" />
            <span className="sr-only">워크스페이스</span>
            <select
              aria-label="워크스페이스"
              value="ALL"
              onChange={(event) => {
                const destination = event.target.value;
                if (destination === "PERSONAL" || destination === "FRENGLE")
                  window.location.assign(workspaceHome(destination));
              }}
            >
              <option value="ALL">ALL</option>
              <option value="PERSONAL">PERSONAL</option>
              <option value="FRENGLE">FRENGLE</option>
            </select>
            <span>전체 공간</span>
          </label>
          <span className="ops-all-read-only">통합 보기</span>
        </header>
        <main className="ops-all-main" id="all-main">
          <div className="ops-all-heading">
            <div>
              <p className="ops-all-eyebrow">ALL WORKSPACES</p>
              <h1>하루를 한눈에</h1>
              <p>PERSONAL과 FRENGLE의 일정과 최근 소식을 함께 확인하세요.</p>
            </div>
            <button
              type="button"
              className="ops-all-button"
              disabled={refreshing}
              onClick={() => void refresh()}
              aria-busy={refreshing}
            >
              <RefreshCw
                size={15}
                className={refreshing ? "ops-all-spinning" : ""}
                aria-hidden="true"
              />{" "}
              새로고침
            </button>
          </div>

          <section className="ops-all-summary" aria-label="워크스페이스 요약">
            {allWorkspaces.map((workspace) => {
              const snapshot = snapshots[workspace];
              const home = workspaceHome(workspace);
              const latest = snapshot.results?.[0];
              const count =
                snapshot.schedules !== null && snapshot.tasks !== null && today
                  ? workspaceCalendarItems(snapshot).filter((item) =>
                      scheduleOverlaps(item, today),
                    ).length
                  : null;
              const unfinished = snapshot.tasks?.filter(
                (task) => task.status !== "completed",
              ).length;
              return (
                <article
                  className="ops-all-card ops-all-workspace-card"
                  key={workspace}
                >
                  <div className="ops-all-card-heading">
                    <Badge workspace={workspace} />
                    <Link href={home} aria-label={`${workspace} 바로가기`}>
                      바로가기 <ArrowUpRight size={14} aria-hidden="true" />
                    </Link>
                  </div>
                  <h2>
                    {workspace === "PERSONAL"
                      ? "나의 콘텐츠와 일상"
                      : "프렌글 업무 공간"}
                  </h2>
                  <dl className="ops-all-numbers">
                    <div>
                      <dt>오늘 일정·마감</dt>
                      <dd>
                        {count ?? "—"}
                        <small>{count !== null ? "건" : ""}</small>
                      </dd>
                    </div>
                    <div>
                      <dt>미완료 업무</dt>
                      <dd>
                        {unfinished ?? "—"}
                        <small>{unfinished !== undefined ? "건" : ""}</small>
                      </dd>
                    </div>
                  </dl>
                  <div className="ops-all-latest">
                    <span>최근 자동화 수신</span>
                    <strong>
                      {snapshot.results === null
                        ? "—"
                        : latest
                          ? automationSourceLabel(latest.source)
                          : "아직 수신한 결과가 없어요"}
                    </strong>
                    {latest ? (
                      <time dateTime={String(latest.received_at)}>
                        {automationReceiptTime(latest.received_at)}
                      </time>
                    ) : null}
                  </div>
                  {snapshot.status === "ready" ? (
                    <>
                      {snapshot.opsError ? (
                        <p className="ops-all-error" role="status">
                          {snapshot.opsError}{" "}
                          <Link href={`${home}?view=settings`}>설정 확인</Link>
                        </p>
                      ) : null}
                      {snapshot.resultsError ? (
                        <p className="ops-all-error" role="status">
                          {snapshot.resultsError}{" "}
                          <Link href={`${home}?view=automations`}>
                            자동화 확인
                          </Link>
                        </p>
                      ) : null}
                      {snapshot.partial ? (
                        <p className="ops-all-note">
                          최대 1,000건까지 불러온 범위의 집계예요.
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <p className="ops-all-state" role="status">
                      {snapshot.status === "loading"
                        ? "공간을 확인하고 있어요…"
                        : snapshot.message}{" "}
                      {snapshot.status !== "loading" ? (
                        <Link href={`${home}?view=settings`}>
                          {snapshot.status === "signed-out"
                            ? "로그인·권한 확인"
                            : "연결 확인"}{" "}
                          <ArrowUpRight size={13} aria-hidden="true" />
                        </Link>
                      ) : null}
                    </p>
                  )}
                </article>
              );
            })}
          </section>

          <div className="ops-all-section-heading">
            <div>
              <h2>오늘의 일정</h2>
              <p>{formatDay(today)} · 저장된 일정과 업무 마감</p>
            </div>
            <CalendarDays size={21} aria-hidden="true" />
          </div>
          <p className="ops-all-scope-note">
            등록한 일반 일정과 업무 마감을 모아 봅니다. 반복 규칙·콘텐츠
            발행에서 파생되는 일정은 각 공간의 Calendar에서 확인할 수 있어요.
            {incomplete ? " · 연결·조회가 완료된 공간의 자료만 표시해요." : ""}
            {partial ? " · 불러온 범위의 일정입니다." : ""}
          </p>
          <section
            className="ops-all-card ops-all-today"
            aria-label="오늘의 통합 일정"
          >
            {todayItems.length ? (
              todayItems.map((item) => (
                <Link
                  href={calendarHref(item, today)}
                  className="ops-all-schedule-row"
                  key={`${item.workspace}:${item.source}:${item.id}`}
                >
                  <Badge workspace={item.workspace} />
                  <span className="ops-all-schedule-copy">
                    <strong>{item.title || "제목 없는 일정"}</strong>
                    <small>{item.source}</small>
                  </span>
                  <time>{weeklyScheduleTime(item, today)}</time>
                  <ArrowUpRight size={14} aria-hidden="true" />
                </Link>
              ))
            ) : (
              <p className="ops-all-empty">
                {refreshing
                  ? "오늘의 일정을 확인하고 있어요…"
                  : "불러온 오늘 일정이 없어요."}
              </p>
            )}
          </section>

          <div className="ops-all-lower-grid">
            <section
              className="ops-all-card ops-all-week"
              aria-labelledby="all-week-title"
            >
              <div className="ops-all-card-section-heading">
                <h2 id="all-week-title">이번 주 일정</h2>
                <span>
                  {week.length
                    ? `${formatDay(week[0].day)}–${formatDay(week[6].day)}`
                    : "—"}
                </span>
              </div>
              <div className="ops-all-week-days">
                {week.map((day) => (
                  <div
                    className={`ops-all-week-day${day.day === today ? " is-today" : ""}`}
                    key={day.day}
                  >
                    <div className="ops-all-day-label">
                      <strong>{day.weekday}</strong>
                      <time dateTime={day.day}>{formatDay(day.day)}</time>
                    </div>
                    <div className="ops-all-day-items">
                      {day.items.length ? (
                        day.items.map((row) => {
                          const item = row as (typeof items)[number];
                          return (
                            <Link
                              href={calendarHref(item, day.day)}
                              key={`${item.workspace}:${item.source}:${item.id}`}
                            >
                              <Badge workspace={item.workspace} />
                              <strong>{item.title || "제목 없는 일정"}</strong>
                              <span>{weeklyScheduleTime(item, day.day)}</span>
                            </Link>
                          );
                        })
                      ) : (
                        <span className="ops-all-day-empty">
                          불러온 일정 없음
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section
              className="ops-all-card ops-all-automations"
              aria-labelledby="all-auto-title"
            >
              <div className="ops-all-card-section-heading">
                <h2 id="all-auto-title">최근 자동화 데이터</h2>
                <span>최근 6건</span>
              </div>
              {recent.length ? (
                <div className="ops-all-auto-list">
                  {recent.map((result) => {
                    const href = chatGptSourceUrl(result.source_url);
                    return (
                      <article key={`${result.workspace}:${result.id}`}>
                        <Badge workspace={result.workspace} />
                        <span className="ops-all-auto-source">
                          {automationSourceLabel(result.source)}
                        </span>
                        <h3>{result.title || "자동화 결과"}</h3>
                        <time dateTime={String(result.received_at)}>
                          {automationReceiptTime(result.received_at)} 수신
                        </time>
                        <Link
                          href={`${workspaceHome(result.workspace)}?view=automations`}
                        >
                          저장된 결과 보기{" "}
                          <ArrowUpRight size={13} aria-hidden="true" />
                        </Link>
                        {href ? (
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            ChatGPT 대화 열기{" "}
                            <ArrowUpRight size={13} aria-hidden="true" />
                          </a>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              ) : (
                <p className="ops-all-empty">
                  {refreshing
                    ? "최근 결과를 확인하고 있어요…"
                    : "불러온 자동화 결과가 없어요."}
                </p>
              )}
            </section>
          </div>
          <footer className="ops-all-footer">
            <span>등록·수정은 각 워크스페이스에서 할 수 있어요.</span>
            <span>
              {checkedAt
                ? `${automationReceiptTime(checkedAt)} 확인 · 1분마다 갱신`
                : "각 공간 연결 확인 중"}
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
