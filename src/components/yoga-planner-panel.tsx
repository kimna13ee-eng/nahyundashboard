"use client";

import { useEffect, useRef } from "react";
import {
  ArrowUpRight,
  Bell,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Flower2,
  Link2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { seoulDate, type OpsRow } from "@/lib/ops";
import { parseScheduleVideoUrl } from "@/lib/schedule-category";
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

function validDay(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000-"))
    return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

function moveDay(value: string, offset: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  const result = date.toISOString().slice(0, 10);
  return validDay(result) ? result : null;
}

function displayDay(value: string, withYear = false) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    ...(withYear ? { year: "numeric" } : {}),
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date(`${value}T12:00:00+09:00`));
}

function scheduleDay(row: OpsRow) {
  if (typeof row.starts_at !== "string") return null;
  const date = new Date(row.starts_at);
  return Number.isFinite(date.getTime()) ? seoulDate(date) : null;
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
  const selectedDay = validDay(day) ? day : today;
  const before = moveDay(selectedDay, -1);
  const after = moveDay(selectedDay, 1);
  const weekEnd = moveDay(today, 6) || today;
  const rows = enabled
    ? schedules
        .filter((row) => row.category === "exercise" && !row.deleted_at)
        .map((row) => ({
          row,
          day: scheduleDay(row),
          url: videoLink(row.video_url),
        }))
        .filter(
          (item): item is { row: OpsRow; day: string; url: string | null } =>
            Boolean(item.day),
        )
        .sort(
          (a, b) =>
            a.day.localeCompare(b.day) ||
            String(a.row.starts_at).localeCompare(String(b.row.starts_at)) ||
            a.row.id.localeCompare(b.row.id),
        )
    : [];
  const selected = rows.filter((item) => item.day === selectedDay);
  const upcoming = rows.filter(
    (item) => item.day >= today && item.day <= weekEnd,
  );
  const upcomingDays = [...new Set(upcoming.map((item) => item.day))];
  const focusAvailable = selected.some((item) => item.row.id === focusedId);
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

  return (
    <section className="ops-yoga-planner" aria-label="요가 플래너 보드">
      <header className="ops-yoga-planner-heading">
        <div>
          <span className="ops-yoga-planner-eyebrow">MY EVENING ROUTINE</span>
          <h2>하루를 마무리하는 요가</h2>
          <p>날짜마다 보고 싶은 영상을 담아두세요.</p>
        </div>
        <div className="ops-yoga-planner-time">
          <Bell size={16} aria-hidden="true" />
          <div>
            <strong>오후 9:00</strong>
            <span>한국시간 · 링크를 등록한 날</span>
          </div>
        </div>
      </header>

      <div className="ops-yoga-planner-toolbar">
        <div className="ops-yoga-planner-date-controls">
          <button
            type="button"
            aria-label="요가 플래너 이전 날"
            disabled={!before}
            onClick={() => before && onDayChange(before)}
          >
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
          <label className="ops-yoga-planner-date-input">
            <span className="sr-only">요가를 등록할 날짜</span>
            <input
              type="date"
              value={selectedDay}
              onChange={(event) =>
                validDay(event.target.value) && onDayChange(event.target.value)
              }
            />
          </label>
          <button
            type="button"
            aria-label="요가 플래너 다음 날"
            disabled={!after}
            onClick={() => after && onDayChange(after)}
          >
            <ChevronRight size={16} aria-hidden="true" />
          </button>
          <button type="button" onClick={() => onDayChange(today)}>
            오늘
          </button>
        </div>
        <button
          type="button"
          className="ops-yoga-planner-add"
          disabled={!canWrite || loading}
          onClick={() => onCreate(selectedDay)}
        >
          <Plus size={15} aria-hidden="true" /> 영상 링크 등록
        </button>
      </div>

      <div className="ops-yoga-planner-grid">
        <section
          className="ops-yoga-planner-selected"
          aria-label="선택한 날짜의 요가"
        >
          <div className="ops-yoga-planner-section-heading">
            <div>
              <span className="ops-yoga-planner-date-status">
                {selectedDay === today
                  ? "TODAY"
                  : selectedDay < today
                    ? "PAST"
                    : "UPCOMING"}
              </span>
              <h3>{displayDay(selectedDay, true)}</h3>
            </div>
            <Flower2 size={28} aria-hidden="true" />
          </div>

          {!enabled ? (
            <div className="ops-yoga-planner-empty">
              <Flower2 size={34} aria-hidden="true" />
              <strong>나만의 요가 영상을 모아보세요</strong>
              <p>PERSONAL 연결 후 날짜별 영상을 등록할 수 있어요.</p>
            </div>
          ) : loading ? (
            <p className="ops-yoga-planner-loading" role="status">
              등록한 영상을 불러오는 중이에요.
            </p>
          ) : selected.length ? (
            <div className="ops-yoga-planner-cards">
              {selected.map(({ row, url }) => (
                <article
                  key={row.id}
                  id={`yoga-schedule-${row.id}`}
                  className={`ops-yoga-planner-video${row.id === focusedId ? " is-focused" : ""}`}
                  ref={row.id === focusedId ? focusedCard : undefined}
                  tabIndex={-1}
                  aria-label={title(row)}
                >
                  <div className="ops-yoga-planner-video-head">
                    <span className="ops-yoga-planner-video-icon">
                      <Link2 size={19} aria-hidden="true" />
                    </span>
                    <div>
                      <span className="ops-yoga-planner-video-label">
                        나의 요가 영상
                      </span>
                      <h4>{title(row)}</h4>
                    </div>
                  </div>
                  {url ? (
                    <>
                      <p className="ops-yoga-planner-domain">
                        {new URL(url).hostname}
                      </p>
                      <a
                        className="ops-yoga-planner-open"
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        영상 열기 <ArrowUpRight size={16} aria-hidden="true" />
                      </a>
                    </>
                  ) : (
                    <p className="ops-yoga-planner-missing">
                      {row.video_url
                        ? "영상 링크를 확인해 주세요."
                        : "영상 링크가 아직 없어요."}{" "}
                      수정에서 링크를 넣어주세요.
                    </p>
                  )}
                  <div className="ops-yoga-planner-video-actions">
                    <button
                      type="button"
                      disabled={!canWrite || loading}
                      onClick={() => onEdit(row)}
                      aria-label={`${title(row)} 수정`}
                    >
                      <Pencil size={13} aria-hidden="true" /> 수정
                    </button>
                    <button
                      type="button"
                      disabled={!canWrite || loading}
                      onClick={() => onDelete(row)}
                      aria-label={`${title(row)} 휴지통으로 이동`}
                    >
                      <Trash2 size={13} aria-hidden="true" /> 휴지통
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="ops-yoga-planner-empty">
              <Flower2 size={36} aria-hidden="true" />
              <strong>이날의 요가를 골라볼까요?</strong>
              <p>
                링크를 저장해 두면 알림에서 이 보드로 돌아와
                <br />
                영상을 바로 열 수 있어요.
              </p>
              <button
                type="button"
                disabled={!canWrite || loading}
                onClick={() => onCreate(selectedDay)}
              >
                <Plus size={14} aria-hidden="true" /> 영상 링크 등록
              </button>
            </div>
          )}
        </section>

        <aside
          className="ops-yoga-planner-upcoming"
          aria-label="다가오는 7일 요가"
        >
          <div className="ops-yoga-planner-upcoming-heading">
            <CalendarDays size={17} aria-hidden="true" />
            <h3>다가오는 7일</h3>
            <span>{upcomingDays.length}일</span>
          </div>
          <p className="ops-yoga-planner-upcoming-range">
            {displayDay(today)} ~ {displayDay(weekEnd)}
          </p>
          {!enabled ? (
            <p className="ops-yoga-planner-upcoming-empty">
              로그인 후 예정된 요가를 확인할 수 있어요.
            </p>
          ) : loading ? (
            <p className="ops-yoga-planner-upcoming-empty">
              영상을 불러오는 중이에요.
            </p>
          ) : upcomingDays.length ? (
            <div className="ops-yoga-planner-upcoming-list">
              {upcomingDays.map((date) => {
                const items = upcoming.filter((item) => item.day === date);
                const available = items.filter((item) => item.url).length;
                return (
                  <button
                    key={date}
                    type="button"
                    className={date === selectedDay ? "is-selected" : undefined}
                    aria-pressed={date === selectedDay}
                    onClick={() => onDayChange(date)}
                  >
                    <span className="ops-yoga-planner-upcoming-day">
                      <strong>{date.slice(8)}</strong>
                      <span>
                        {new Intl.DateTimeFormat("ko-KR", {
                          timeZone: "Asia/Seoul",
                          weekday: "short",
                        }).format(new Date(`${date}T12:00:00+09:00`))}
                      </span>
                    </span>
                    <span className="ops-yoga-planner-upcoming-info">
                      <strong>
                        {title(items[0].row)}
                        {items.length > 1 ? ` 외 ${items.length - 1}개` : ""}
                      </strong>
                      <span>
                        {available
                          ? `영상 ${available}개 · 오후 9시`
                          : "영상 링크 미등록"}
                      </span>
                    </span>
                    <ChevronRight size={15} aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="ops-yoga-planner-upcoming-empty">
              아직 예정된 요가가 없어요.
              <br />
              원하는 날짜에 영상을 하나씩 담아보세요.
            </p>
          )}
        </aside>
      </div>
      <p className="ops-yoga-planner-footnote">
        링크가 등록된 날짜에만 오후 9시 알림을 보내요. 아이폰의 알림 허용과 연결
        상태는 아래에서 확인해 주세요.
      </p>
    </section>
  );
}
