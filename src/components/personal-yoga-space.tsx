"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowUpRight,
  Bell,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { seoulDate, type OpsRow } from "@/lib/ops";
import { parseScheduleVideoUrl } from "@/lib/schedule-category";
import {
  moveYogaDay,
  validYogaDay,
  yogaDurationMinutes,
  yogaScheduleDay,
  yogaWeek,
  yogaWeekSummary,
} from "@/lib/yoga-week";
import { OpsDialog } from "./ops-dialog";
import { YogaVideoFields } from "./yoga-video-fields";
import { YogaReminderPanel } from "./yoga-reminder-panel";
import "./personal-yoga-space.css";

type Props = {
  enabled: boolean;
  initialDay?: string;
  focusedId?: string;
  onSessionExpired?: () => void;
};
type Editor = { id: string; row?: OpsRow; date: string };
type WeekData = { from: string; rows: OpsRow[]; truncated: boolean };
type RequestBody = Record<string, unknown>;
const weeklyRoutine = [
  { day: "월", activity: "근력" },
  { day: "화", activity: "하체 스트레칭" },
  { day: "수", activity: "어깨 스트레칭" },
  { day: "목", activity: "전신 스트레칭" },
  { day: "금", activity: "근력" },
  { day: "토", activity: "스트레칭" },
  { day: "일", activity: "스트레칭 혹은 반신욕" },
] as const;

function routineForDay(date: string) {
  if (!validYogaDay(date)) return undefined;
  const index = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
  return weeklyRoutine[index];
}

class PlannerRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
async function request(
  method: string,
  body?: RequestBody,
  signal?: AbortSignal,
  query = "",
) {
  const response = await fetch(`/api/planner-schedules${query}`, {
    method,
    cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(20000)])
      : AbortSignal.timeout(20000),
  });
  const data = await response.json();
  if (!response.ok)
    throw new PlannerRequestError(
      response.status === 401
        ? "로그인이 만료됐어요. 다시 로그인해 주세요."
        : data.error || "요가 플래너를 불러오지 못했어요.",
      response.status,
    );
  return data;
}
function readableError(error: unknown) {
  return error instanceof Error &&
    !["AbortError", "TimeoutError"].includes(error.name)
    ? error.message
    : "응답이 늦어지고 있어요. 연결을 확인하고 다시 시도해 주세요.";
}
function safeVideo(value: unknown) {
  try {
    return parseScheduleVideoUrl(value) || null;
  } catch {
    return null;
  }
}
function displayDay(day: string, weekday = false) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    ...(weekday ? { weekday: "long" } : {}),
  }).format(new Date(`${day}T12:00:00+09:00`));
}
function initialDate(value?: string) {
  return value && validYogaDay(value) && yogaWeek(value) ? value : seoulDate();
}

export function PersonalYogaSpace({
  enabled,
  initialDay,
  focusedId,
  onSessionExpired,
}: Props) {
  const [day, setDay] = useState(() => initialDate(initialDay));
  const [data, setData] = useState<WeekData | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [undo, setUndo] = useState<OpsRow | null>(null);
  const [remindersOpen, setRemindersOpen] = useState(false);
  const onExpired = useRef(onSessionExpired);
  const mutation = useRef<AbortController | null>(null);
  const mutationBusy = useRef(false);
  const generation = useRef(0);
  const focusedCard = useRef<HTMLElement | null>(null);
  const lastFocused = useRef<string | null>(null);
  const pendingCreate = useRef<RequestBody | null>(null);
  const [retryCreate, setRetryCreate] = useState(false);
  const week = yogaWeek(day)!;
  const from = week[0],
    to = week[6];
  const rows = enabled && data?.from === from ? data.rows : [];
  const selectedRows = rows.filter((row) => yogaScheduleDay(row) === day);
  const ready = enabled && data?.from === from;
  const summary = yogaWeekSummary(rows, week);
  const today = seoulDate();
  const selectedRoutine = routineForDay(day)!;
  const editorRoutine = editor ? routineForDay(editor.date) : undefined;
  const before = moveYogaDay(day, -7),
    after = moveYogaDay(day, 7);

  useEffect(() => {
    onExpired.current = onSessionExpired;
  }, [onSessionExpired]);
  useEffect(() => {
    const lifecycle = generation;
    return () => {
      ++lifecycle.current;
      mutation.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let active: AbortController | null = null;
    async function load() {
      active?.abort();
      const controller = new AbortController();
      active = controller;
      setRefreshing(true);
      try {
        const result = await request(
          "GET",
          undefined,
          controller.signal,
          `?from=${from}&to=${to}`,
        );
        if (disposed || controller.signal.aborted) return;
        if (!Array.isArray(result.schedules))
          throw new Error("영상 목록을 확인하지 못했어요.");
        setData({
          from,
          rows: result.schedules.filter(
            (row: OpsRow) => row.category === "exercise" && !row.deleted_at,
          ),
          truncated: result.truncated === true,
        });
        setError("");
      } catch (cause) {
        if (disposed || controller.signal.aborted) return;
        setError(readableError(cause));
        if (cause instanceof PlannerRequestError && cause.status === 401)
          onExpired.current?.();
      } finally {
        if (!disposed && !controller.signal.aborted) setRefreshing(false);
      }
    }
    void load();
    function onVisible() {
      if (document.visibilityState === "visible") void load();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      disposed = true;
      active?.abort();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, from, to, revision]);
  useEffect(() => {
    if (
      ready &&
      focusedId &&
      lastFocused.current !== focusedId &&
      selectedRows.some((row) => row.id === focusedId)
    ) {
      focusedCard.current?.focus({ preventScroll: true });
      lastFocused.current = focusedId;
    }
  }, [ready, focusedId, selectedRows]);

  function chooseDay(value: string) {
    if (busy || !validYogaDay(value) || !yogaWeek(value)) return;
    setDay(value);
    setError("");
  }
  function openEditor(row?: OpsRow) {
    if (!ready || busy) return;
    pendingCreate.current = null;
    setRetryCreate(false);
    setFormError("");
    setEditor({
      id: row?.id || crypto.randomUUID(),
      row,
      date: row ? yogaScheduleDay(row) || day : day,
    });
  }
  function changeEditorDate(value: string) {
    if (busy || retryCreate) return;
    setEditor((current) =>
      current && current.date !== value ? { ...current, date: value } : current,
    );
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!enabled || !editor || mutationBusy.current) return;
    const form = new FormData(event.currentTarget);
    const minutes = String(form.get("duration_minutes") || "");
    const payload = pendingCreate.current || {
      id: editor.id,
      title: String(form.get("title") || "").trim(),
      video_url: String(form.get("video_url") || "").trim(),
      duration_minutes: minutes ? Number(minutes) : null,
      date: String(form.get("date") || editor.date),
    };
    if (!editor.row) pendingCreate.current = payload;
    const requestGeneration = generation.current;
    const controller = new AbortController();
    mutation.current = controller;
    mutationBusy.current = true;
    setBusy(true);
    setFormError("");
    try {
      await request(editor.row ? "PATCH" : "POST", payload, controller.signal);
      if (controller.signal.aborted || generation.current !== requestGeneration)
        return;
      setDay(String(payload.date));
      setEditor(null);
      setNotice(
        editor.row ? "요가 영상을 수정했어요." : "요가 영상을 등록했어요.",
      );
      pendingCreate.current = null;
      setRetryCreate(false);
      setRevision((value) => value + 1);
    } catch (cause) {
      if (controller.signal.aborted || generation.current !== requestGeneration)
        return;
      const uncertain =
        !(cause instanceof PlannerRequestError) || cause.status >= 500;
      setRetryCreate(!editor.row && uncertain);
      if (!uncertain) pendingCreate.current = null;
      setFormError(readableError(cause));
      if (cause instanceof PlannerRequestError && cause.status === 401)
        onExpired.current?.();
    } finally {
      mutationBusy.current = false;
      if (generation.current === requestGeneration) setBusy(false);
    }
  }
  async function removeOrRestore(row: OpsRow, restore = false) {
    if (!enabled || mutationBusy.current) return;
    const requestGeneration = generation.current;
    const controller = new AbortController();
    mutation.current = controller;
    mutationBusy.current = true;
    setBusy(true);
    setError("");
    try {
      await request(
        restore ? "POST" : "DELETE",
        restore ? { action: "restore", id: row.id } : { id: row.id },
        controller.signal,
      );
      if (controller.signal.aborted || generation.current !== requestGeneration)
        return;
      setUndo(restore ? null : row);
      setNotice(
        restore
          ? "영상을 다시 가져왔어요."
          : "영상을 삭제했어요. 12시간 안에 되돌릴 수 있어요.",
      );
      if (restore) setDay(yogaScheduleDay(row) || day);
      else
        setData((previous) =>
          previous
            ? {
                ...previous,
                rows: previous.rows.filter((item) => item.id !== row.id),
              }
            : previous,
        );
      setRevision((value) => value + 1);
    } catch (cause) {
      if (controller.signal.aborted || generation.current !== requestGeneration)
        return;
      setError(readableError(cause));
      if (cause instanceof PlannerRequestError && cause.status === 401)
        onExpired.current?.();
    } finally {
      mutationBusy.current = false;
      if (generation.current === requestGeneration) setBusy(false);
    }
  }

  return (
    <section className="personal-yoga-space" aria-label="요가 플래너">
      <div className="personal-yoga-calendar">
        <div className="personal-yoga-weekbar">
          <button
            type="button"
            aria-label="이전 주"
            disabled={busy || !before || !yogaWeek(before)}
            onClick={() => before && chooseDay(before)}
          >
            <ChevronLeft size={20} />
          </button>
          <strong>
            {displayDay(from)} – {displayDay(to)}
          </strong>
          <button
            type="button"
            aria-label="다음 주"
            disabled={busy || !after || !yogaWeek(after)}
            onClick={() => after && chooseDay(after)}
          >
            <ChevronRight size={20} />
          </button>
        </div>
        <div className="personal-yoga-weekdays" aria-label="이번 주 요가 날짜">
          {week.map((date, index) => (
            <button
              type="button"
              key={date}
              className={`${date === day ? "selected " : ""}${date === today ? "today" : ""}`}
              aria-label={`${displayDay(date, true)}${date === today ? " 오늘" : ""} · ${weeklyRoutine[index].activity}`}
              aria-pressed={date === day}
              disabled={busy}
              onClick={() => chooseDay(date)}
            >
              <span>{weeklyRoutine[index].day}</span>
              <strong>{Number(date.slice(8))}</strong>
              <i
                className={
                  rows.some((row) => yogaScheduleDay(row) === date)
                    ? "has-video"
                    : ""
                }
                aria-hidden="true"
              />
            </button>
          ))}
        </div>
        <div className="personal-yoga-calendar-foot">
          <span>
            {ready ? (
              <>
                이번 주 <b>{summary.registeredDays}일</b> · {summary.videoCount}
                개 영상
                {summary.enteredMinutes > 0
                  ? ` · ${summary.enteredMinutes}분`
                  : ""}
              </>
            ) : enabled ? (
              "주간 일정을 불러오는 중…"
            ) : (
              "로그인하면 내 영상을 볼 수 있어요."
            )}
          </span>
          <div>
            <button
              type="button"
              disabled={busy}
              onClick={() => chooseDay(today)}
            >
              오늘
            </button>
            <label>
              <span className="sr-only">요가 날짜 선택</span>
              <input
                aria-label="요가 날짜 선택"
                type="date"
                value={day}
                disabled={busy}
                onChange={(event) => chooseDay(event.target.value)}
              />
            </label>
            <button
              type="button"
              className="personal-yoga-refresh"
              aria-label="요가 일정 새로고침"
              disabled={!enabled || refreshing || busy}
              onClick={() => setRevision((value) => value + 1)}
            >
              <RefreshCw size={18} />
            </button>
          </div>
        </div>
      </div>
      <section
        className="personal-yoga-routine"
        aria-labelledby="personal-yoga-routine-title"
      >
        <div className="personal-yoga-routine-heading">
          <h2 id="personal-yoga-routine-title">요일별 운동</h2>
          <span>매주 고정</span>
        </div>
        <dl>
          {weeklyRoutine.map((routine) => (
            <div
              key={routine.day}
              className={routine.day === selectedRoutine.day ? "selected" : ""}
            >
              <dt>
                {routine.day}
                <span className="sr-only">요일</span>
              </dt>
              <dd>{routine.activity}</dd>
            </div>
          ))}
        </dl>
      </section>
      {error ? (
        <div className="personal-yoga-error" role="alert">
          {error}
          <button
            type="button"
            disabled={refreshing || busy}
            onClick={() => setRevision((value) => value + 1)}
          >
            다시 불러오기
          </button>
        </div>
      ) : null}
      {notice ? (
        <div className="personal-yoga-notice" role="status">
          <span>{notice}</span>
          {undo ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void removeOrRestore(undo, true)}
            >
              삭제 되돌리기
            </button>
          ) : null}
        </div>
      ) : null}
      {ready && data?.truncated ? (
        <p className="personal-yoga-help">
          이 주의 영상 일부만 표시돼요. 일정을 정리한 뒤 다시 불러와 주세요.
        </p>
      ) : null}
      <section
        className="personal-yoga-selected-day"
        aria-label={`${displayDay(day, true)} 영상`}
      >
        <div className="personal-yoga-day-title">
          <h3>{day === today ? "오늘의 요가" : displayDay(day, true)}</h3>
          <span>
            <Bell size={14} /> 밤 9시 알림
          </span>
        </div>
        <p className="personal-yoga-day-routine">
          <span aria-hidden="true">🧘</span>
          <span>
            {selectedRoutine.day}요일 ·{" "}
            <strong>{selectedRoutine.activity}</strong>
          </span>
        </p>
        {!enabled ? (
          <div className="personal-yoga-empty">
            <span aria-hidden="true">🌿</span>
            <h3>나만의 요가 일정을 담아보세요</h3>
            <p>로그인 후 영상과 운동 시간을 등록할 수 있어요.</p>
          </div>
        ) : !ready ? (
          <p className="personal-yoga-loading" role="status">
            {error
              ? "연결 후 영상을 확인할 수 있어요."
              : "영상을 불러오는 중이에요…"}
          </p>
        ) : selectedRows.length ? (
          <div className="personal-yoga-videos">
            {selectedRows.map((row) => {
              const url = safeVideo(row.video_url);
              const minutes = yogaDurationMinutes(row.duration_minutes);
              return (
                <article
                  key={row.id}
                  className={`personal-yoga-video${row.id === focusedId ? " focused" : ""}`}
                  ref={row.id === focusedId ? focusedCard : undefined}
                  tabIndex={row.id === focusedId ? -1 : undefined}
                  aria-label={row.title || "요가 영상"}
                >
                  <div className="personal-yoga-video-top">
                    <span
                      className="personal-yoga-video-icon"
                      aria-hidden="true"
                    >
                      🌙
                    </span>
                    <span className="personal-yoga-duration">
                      <Clock3 size={14} />
                      {minutes === null ? "시간 미입력" : `${minutes}분`}
                    </span>
                  </div>
                  <h4>{row.title || "요가 영상"}</h4>
                  <div className="personal-yoga-video-actions">
                    {url ? (
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="personal-yoga-watch"
                        aria-label={`${row.title || "요가"} 영상 보기 (새 창)`}
                      >
                        영상 보기 <ArrowUpRight size={17} />
                      </a>
                    ) : (
                      <span className="personal-yoga-help">
                        영상 링크를 등록해 주세요.
                      </span>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      aria-label={`${row.title || "요가"} 수정`}
                      onClick={() => openEditor(row)}
                    >
                      <Pencil size={17} />
                      <span>수정</span>
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      aria-label={`${row.title || "요가"} 삭제`}
                      onClick={() => void removeOrRestore(row)}
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="personal-yoga-empty">
            <span aria-hidden="true">🌿</span>
            <h3>이날 운동에 맞는 영상을 골라보세요</h3>
            <p>따라 하고 싶은 영상 링크를 담아두세요.</p>
          </div>
        )}
        <button
          type="button"
          className="personal-yoga-add"
          disabled={!ready || busy}
          onClick={() => openEditor()}
        >
          <Plus size={19} />
          {displayDay(day)} 영상 등록
        </button>
      </section>
      <details
        className="personal-yoga-reminder-details"
        onToggle={(event) => setRemindersOpen(event.currentTarget.open)}
      >
        <summary>
          <span>
            <Bell size={18} /> 아이폰 운동 알림
          </span>
          <span>연결 확인·설정</span>
        </summary>
        {remindersOpen ? <YogaReminderPanel enabled={enabled} /> : null}
      </details>
      <p className="personal-yoga-help">
        등록한 영상은 해당 날짜 밤 9시에 알림으로 만나요. 알림을 받으려면 이
        기기의 운동 알림을 켜 주세요.
      </p>
      {editor ? (
        <OpsDialog
          title={editor.row ? "요가 영상 수정" : "요가 영상 등록"}
          busy={busy}
          close={() => {
            setEditor(null);
            pendingCreate.current = null;
            setRetryCreate(false);
          }}
        >
          <form
            className="personal-yoga-form"
            onSubmit={(event) => void save(event)}
          >
            <label>
              운동할 날짜
              <input
                name="date"
                type="date"
                required
                value={editor.date}
                disabled={busy || retryCreate}
                onInput={(event) => changeEditorDate(event.currentTarget.value)}
                onChange={(event) =>
                  changeEditorDate(event.currentTarget.value)
                }
              />
            </label>
            <p className="personal-yoga-form-routine" aria-live="polite">
              <span>이날의 운동</span>
              <strong>
                {editorRoutine
                  ? `${editorRoutine.day}요일 · ${editorRoutine.activity}`
                  : "운동할 날짜를 선택해 주세요."}
              </strong>
            </p>
            <p className="personal-yoga-form-time">
              <Bell size={14} /> 선택한 날짜 밤 9시에 알림
            </p>
            <YogaVideoFields
              initialTitle={editor.row?.title || ""}
              initialUrl={
                typeof editor.row?.video_url === "string"
                  ? editor.row.video_url
                  : ""
              }
              initialMinutes={editor.row?.duration_minutes}
              durationReady
              disabled={busy || retryCreate}
            />
            {formError ? (
              <p role="alert" className="personal-yoga-error">
                {formError}
              </p>
            ) : null}
            {retryCreate ? (
              <p className="personal-yoga-help">
                저장 응답을 확인하지 못했어요. 같은 내용으로 다시 확인하면 중복
                없이 저장돼요.
              </p>
            ) : null}
            <div className="personal-yoga-form-actions">
              <button type="button" data-dialog-close disabled={busy}>
                취소
              </button>
              <button type="submit" disabled={busy || !enabled}>
                {busy ? "저장 중…" : retryCreate ? "저장 다시 확인" : "저장"}
              </button>
            </div>
          </form>
        </OpsDialog>
      ) : null}
    </section>
  );
}
