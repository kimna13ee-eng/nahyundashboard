"use client";

import { useEffect, useRef } from "react";
import {
  ArrowUpRight,
  Bell,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Pencil,
  Plus,
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
import "./yoga-planner-panel.css";

type Props = {
  schedules: OpsRow[];
  day: string;
  enabled: boolean;
  canWrite: boolean;
  loading: boolean;
  onDayChange: (day: string) => void;
  onCreate: (day: string) => void;
  onEdit: (row: OpsRow) => void;
  onDelete: (row: OpsRow) => void;
  focusedId?: string;
};
const weekdays = [
  "월요일",
  "화요일",
  "수요일",
  "목요일",
  "금요일",
  "토요일",
  "일요일",
];
function displayDay(value: string, withYear = false) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    ...(withYear ? { year: "numeric" } : {}),
    month: "long",
    day: "numeric",
  }).format(new Date(`${value}T12:00:00+09:00`));
}
function videoLink(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    return parseScheduleVideoUrl(value) || null;
  } catch {
    return null;
  }
}
function title(row: OpsRow) {
  return typeof row.title === "string" && row.title.trim() ? row.title : "요가";
}
export function YogaPlannerPanel({
  schedules,
  day,
  enabled,
  canWrite,
  loading,
  onDayChange,
  onCreate,
  onEdit,
  onDelete,
  focusedId,
}: Props) {
  const today = seoulDate();
  const selectedDay = validYogaDay(day) && yogaWeek(day) ? day : today;
  const dates = yogaWeek(selectedDay)!;
  const before = moveYogaDay(selectedDay, -7);
  const after = moveYogaDay(selectedDay, 7);
  const rows = enabled
    ? schedules
        .filter((row) => row.category === "exercise" && !row.deleted_at)
        .map((row) => ({
          row,
          day: yogaScheduleDay(row),
          url: videoLink(row.video_url),
        }))
        .filter(
          (item): item is { row: OpsRow; day: string; url: string | null } =>
            Boolean(item.day && dates.includes(item.day)),
        )
        .sort(
          (a, b) =>
            String(a.row.starts_at).localeCompare(String(b.row.starts_at)) ||
            a.row.id.localeCompare(b.row.id),
        )
    : [];
  const summary = yogaWeekSummary(enabled ? schedules : [], dates);
  const focusAvailable = rows.some((item) => item.row.id === focusedId);
  const focusedCard = useRef<HTMLElement | null>(null);
  const lastFocused = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!enabled || loading || !focusedId || lastFocused.current === focusedId)
      return;
    if (focusedCard.current) {
      focusedCard.current.focus({ preventScroll: true });
      focusedCard.current.scrollIntoView({ block: "nearest" });
      lastFocused.current = focusedId;
    }
  }, [enabled, loading, focusedId, selectedDay, focusAvailable]);
  function createForDate(date: string) {
    onDayChange(date);
    onCreate(date);
  }
  return (
    <section className="ops-yoga-planner" aria-label="요가 플래너 보드">
      <header className="ops-yoga-planner-heading">
        <div>
          <span className="ops-yoga-planner-eyebrow">
            <span className="ops-yoga-planner-icon" aria-hidden="true">
              🧘
            </span>
            요가 플래너
          </span>
          <h2>나를 위한 주간 요가</h2>
          <p>
            원하는 요일에 영상을 담고, 제목과 운동 시간을 한눈에 확인하세요.
          </p>
        </div>
        <div className="ops-yoga-planner-time">
          <span className="ops-yoga-planner-alarm-icon" aria-hidden="true">
            🔔
          </span>
          <div>
            <strong>오후 9:00</strong>
            <span>한국시간 · 링크를 등록한 날</span>
          </div>
        </div>
      </header>
      <div className="ops-yoga-planner-toolbar">
        <div className="ops-yoga-planner-week-controls">
          <button
            type="button"
            aria-label="요가 플래너 이전 주"
            disabled={!before || !yogaWeek(before)}
            onClick={() => before && onDayChange(before)}
          >
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
          <h3>
            {displayDay(dates[0], true)} <span>–</span> {displayDay(dates[6])}
          </h3>
          <button
            type="button"
            aria-label="요가 플래너 다음 주"
            disabled={!after || !yogaWeek(after)}
            onClick={() => after && onDayChange(after)}
          >
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
        <div className="ops-yoga-planner-date-controls">
          <button type="button" onClick={() => onDayChange(today)}>
            이번 주
          </button>
          <label className="ops-yoga-planner-date-input">
            <span className="sr-only">요가를 등록할 날짜</span>
            <input
              type="date"
              value={selectedDay}
              onChange={(event) =>
                validYogaDay(event.target.value) &&
                yogaWeek(event.target.value) &&
                onDayChange(event.target.value)
              }
            />
          </label>
        </div>
      </div>
      {!enabled ? (
        <p className="ops-yoga-planner-notice">
          PERSONAL 연결 후 요일별 영상을 등록할 수 있어요.
        </p>
      ) : loading ? (
        <p className="ops-yoga-planner-notice" role="status">
          등록한 영상을 불러오는 중이에요.
        </p>
      ) : (
        <div
          className="ops-yoga-planner-summary"
          aria-label="선택한 주의 요가 요약"
        >
          <span>
            등록 <strong>{summary.registeredDays}일</strong>
            <span className="ops-yoga-planner-summary-divider">·</span>영상{" "}
            <strong>{summary.videoCount}개</strong>
          </span>
          {summary.videoCount > 0 && (
            <span>
              <Clock3 size={13} aria-hidden="true" />
              {summary.videoCount > summary.missingDurations ? (
                <>
                  입력된 시간 합계{" "}
                  <strong>
                    {summary.enteredMinutes.toLocaleString("ko-KR")}분
                  </strong>
                </>
              ) : (
                "운동 시간 미입력"
              )}
              {summary.missingDurations > 0 && (
                <small>시간 미입력 {summary.missingDurations}개</small>
              )}
            </span>
          )}
        </div>
      )}
      <div className="ops-yoga-planner-week-grid">
        {dates.map((date, index) => {
          const items = rows.filter((item) => item.day === date);
          return (
            <section
              key={date}
              className={`ops-yoga-planner-day${date === selectedDay ? " is-selected" : ""}${date === today ? " is-today" : ""}`}
              aria-label={`${displayDay(date)} ${weekdays[index]} 요가`}
            >
              <button
                type="button"
                className="ops-yoga-planner-day-heading"
                aria-pressed={date === selectedDay}
                onClick={() => onDayChange(date)}
              >
                <span>
                  {weekdays[index]}
                  {date === today && <small>오늘</small>}
                </span>
                <strong>
                  {date.slice(8)}
                  <span>{Number(date.slice(5, 7))}월</span>
                </strong>
              </button>
              <div className="ops-yoga-planner-day-content">
                {!enabled ? (
                  <p className="ops-yoga-planner-day-placeholder">
                    로그인 후<br />
                    영상을 담아보세요
                  </p>
                ) : loading ? (
                  <p className="ops-yoga-planner-day-placeholder">
                    불러오는 중
                  </p>
                ) : items.length ? (
                  items.map(({ row, url }) => {
                    const minutes = yogaDurationMinutes(row.duration_minutes);
                    return (
                      <article
                        key={row.id}
                        id={`yoga-schedule-${row.id}`}
                        className={`ops-yoga-planner-video${row.id === focusedId ? " is-focused" : ""}`}
                        ref={row.id === focusedId ? focusedCard : undefined}
                        tabIndex={-1}
                        aria-label={title(row)}
                      >
                        <span className="ops-yoga-planner-video-label">
                          영상 제목
                        </span>
                        <h4>{title(row)}</h4>
                        <p className="ops-yoga-planner-duration">
                          <Clock3 size={12} aria-hidden="true" />
                          {minutes === null ? "시간 미입력" : `${minutes}분`}
                        </p>
                        <p className="ops-yoga-planner-alarm">
                          <Bell size={11} aria-hidden="true" />
                          오후 9시
                        </p>
                        {url ? (
                          <a
                            className="ops-yoga-planner-open"
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            영상 열기{" "}
                            <ArrowUpRight size={14} aria-hidden="true" />
                          </a>
                        ) : (
                          <p className="ops-yoga-planner-missing">
                            {row.video_url
                              ? "영상 링크 확인 필요"
                              : "영상 링크 미등록"}
                          </p>
                        )}
                        <div className="ops-yoga-planner-video-actions">
                          <button
                            type="button"
                            disabled={!canWrite || loading}
                            onClick={() => onEdit(row)}
                            aria-label={`${title(row)} 수정`}
                          >
                            <Pencil size={12} aria-hidden="true" />
                            수정
                          </button>
                          <button
                            type="button"
                            disabled={!canWrite || loading}
                            onClick={() => onDelete(row)}
                            aria-label={`${title(row)} 휴지통으로 이동`}
                          >
                            <Trash2 size={12} aria-hidden="true" />
                            <span className="sr-only">휴지통</span>
                          </button>
                        </div>
                      </article>
                    );
                  })
                ) : (
                  <div className="ops-yoga-planner-empty">
                    <span
                      className="ops-yoga-planner-empty-icon"
                      aria-hidden="true"
                    >
                      🌿
                    </span>
                    <p>
                      보고 싶은 영상을
                      <br />
                      담아보세요
                    </p>
                  </div>
                )}
              </div>
              <button
                type="button"
                className="ops-yoga-planner-day-add"
                disabled={!canWrite || loading}
                onClick={() => createForDate(date)}
                aria-label={`${displayDay(date)} ${weekdays[index]} 영상 등록`}
              >
                <Plus size={13} aria-hidden="true" />
                영상 등록
              </button>
            </section>
          );
        })}
      </div>
      <p className="ops-yoga-planner-footnote">
        링크가 등록된 날짜에만 오후 9시 알림을 보내요. 입력한 운동 시간만 합계에
        포함해요. 아이폰 알림 연결 상태는 아래에서 확인해 주세요.
      </p>
    </section>
  );
}
