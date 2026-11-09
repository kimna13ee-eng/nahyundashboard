"use client";

import { ArrowUpRight, Plus } from "lucide-react";
import type { OpsRow } from "@/lib/ops";
import { weeklyScheduleTime } from "@/lib/overview-summary";
import { parseScheduleVideoUrl } from "@/lib/schedule-category";
import { yogaDurationMinutes, yogaScheduleDay } from "@/lib/yoga-week";
import "./personal-day-panel.css";

type Props = {
  today: string;
  items: OpsRow[];
  schedules: OpsRow[];
  enabled: boolean;
  loading: boolean;
  canWrite: boolean;
  onOpenSchedule: (row: OpsRow) => void;
  onCreateSchedule: () => void;
  onOpenCalendar: () => void;
  onOpenYoga: () => void;
  onCreateYoga: () => void;
};

function safeVideoUrl(value: unknown) {
  try {
    return parseScheduleVideoUrl(value) || null;
  } catch {
    return null;
  }
}

function rowTitle(row: OpsRow, fallback: string) {
  return typeof row.title === "string" && row.title.trim()
    ? row.title
    : fallback;
}

export function PersonalDayPanel({
  today,
  items,
  schedules,
  enabled,
  loading,
  canWrite,
  onOpenSchedule,
  onCreateSchedule,
  onOpenCalendar,
  onOpenYoga,
  onCreateYoga,
}: Props) {
  const dayItems = enabled
    ? items.filter((row) => row.category !== "exercise" && !row.deleted_at)
    : [];
  const yogaItems = enabled
    ? schedules
        .filter(
          (row) =>
            row.category === "exercise" &&
            !row.deleted_at &&
            yogaScheduleDay(row) === today,
        )
        .sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)))
    : [];
  const canAdd = enabled && canWrite && !loading;

  return (
    <section className="ops-personal-day" aria-label="오늘의 일정과 요가">
      <section
        className="ops-personal-day-card ops-personal-day-calendar"
        aria-labelledby="personal-day-calendar-title"
        aria-busy={loading}
      >
        <header className="ops-personal-day-heading">
          <div>
            <span className="ops-personal-day-icon" aria-hidden="true">
              🗓️
            </span>
            <h2 id="personal-day-calendar-title">오늘의 일정</h2>
          </div>
          <button
            type="button"
            className="ops-personal-day-text-button"
            onClick={onOpenCalendar}
          >
            캘린더 <ArrowUpRight size={14} aria-hidden="true" />
          </button>
        </header>
        {loading ? (
          <p className="ops-personal-day-empty" role="status">
            오늘 일정을 불러오는 중이에요.
          </p>
        ) : !enabled ? (
          <p className="ops-personal-day-empty">
            캘린더에서 연결 상태를 확인해 주세요.
          </p>
        ) : dayItems.length ? (
          <ul className="ops-personal-day-schedules">
            {dayItems.slice(0, 4).map((row) => (
              <li key={row.id}>
                <button type="button" onClick={() => onOpenSchedule(row)}>
                  <span className="ops-personal-day-dot" aria-hidden="true" />
                  <strong>{rowTitle(row, "일정")}</strong>
                  <span className="ops-personal-day-time">
                    {weeklyScheduleTime(row, today)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="ops-personal-day-empty">
            <strong>오늘은 비어 있어요.</strong>
            <p>발행할 콘텐츠나 기억할 일정을 담아두세요.</p>
          </div>
        )}
        <div className="ops-personal-day-footer">
          <button
            type="button"
            className="ops-personal-day-add"
            disabled={!canAdd}
            onClick={onCreateSchedule}
          >
            <Plus size={14} aria-hidden="true" /> 일정 추가
          </button>
          {!loading && dayItems.length > 4 && (
            <button
              type="button"
              className="ops-personal-day-text-button"
              onClick={onOpenCalendar}
            >
              {dayItems.length - 4}개 더 보기
            </button>
          )}
        </div>
      </section>

      <section
        className="ops-personal-day-card ops-personal-day-yoga"
        aria-labelledby="personal-day-yoga-title"
        aria-busy={loading}
      >
        <header className="ops-personal-day-heading">
          <div>
            <span className="ops-personal-day-icon" aria-hidden="true">
              🧘
            </span>
            <h2 id="personal-day-yoga-title">오늘의 요가</h2>
          </div>
          <button
            type="button"
            className="ops-personal-day-text-button"
            onClick={onOpenYoga}
          >
            주간 플래너 <ArrowUpRight size={14} aria-hidden="true" />
          </button>
        </header>
        <p className="ops-personal-day-reminder">밤 9시 알림 · 등록한 영상</p>
        {loading ? (
          <p className="ops-personal-day-empty" role="status">
            오늘 영상을 불러오는 중이에요.
          </p>
        ) : !enabled ? (
          <p className="ops-personal-day-empty">
            주간 플래너에서 연결 상태를 확인해 주세요.
          </p>
        ) : yogaItems.length ? (
          <ul className="ops-personal-day-videos">
            {yogaItems.slice(0, 2).map((row) => {
              const url = safeVideoUrl(row.video_url);
              const minutes = yogaDurationMinutes(row.duration_minutes);
              return (
                <li key={row.id}>
                  <div className="ops-personal-day-video-title">
                    <button type="button" onClick={() => onOpenSchedule(row)}>
                      {rowTitle(row, "오늘의 요가")}
                    </button>
                    <span>
                      {minutes === null ? "운동 시간 미입력" : `${minutes}분`}
                    </span>
                  </div>
                  {url ? (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ops-personal-day-watch"
                      aria-label={`${rowTitle(row, "요가")} 영상 보기 (새 창)`}
                    >
                      영상 보기 <ArrowUpRight size={14} aria-hidden="true" />
                    </a>
                  ) : (
                    <button
                      type="button"
                      className="ops-personal-day-text-button"
                      disabled={!canAdd}
                      onClick={() => onOpenSchedule(row)}
                    >
                      영상 링크 추가
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="ops-personal-day-empty">
            <strong>오늘 따라 할 영상은?</strong>
            <p>원하는 요가나 스트레칭 링크를 담아두세요.</p>
          </div>
        )}
        <div className="ops-personal-day-footer">
          <button
            type="button"
            className="ops-personal-day-add"
            disabled={!canAdd}
            onClick={onCreateYoga}
          >
            <Plus size={14} aria-hidden="true" /> 오늘 영상 추가
          </button>
          {!loading && yogaItems.length > 2 && (
            <button
              type="button"
              className="ops-personal-day-text-button"
              onClick={onOpenYoga}
            >
              {yogaItems.length - 2}개 더 보기
            </button>
          )}
        </div>
      </section>
    </section>
  );
}
