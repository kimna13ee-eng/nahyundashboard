"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight, ChevronRight, RefreshCw, Search } from "lucide-react";
import { OpsDialog } from "./ops-dialog";
import {
  personalSheetTabs,
  type PersonalSheetTab,
} from "@/lib/personal-sheet-tabs";
import type { PersonalSheetData } from "@/lib/personal-sheets";
import "./personal-content-planner.css";

const tabs = Object.keys(personalSheetTabs) as PersonalSheetTab[];
const pageSize = 24;

const weeklyReels = [
  {
    day: "월",
    title: "알고리즘 & 편집 휴식",
    note: "업로드 없이 쉬어가는 날",
    time: null,
    tone: "rest",
  },
  {
    day: "화",
    title: "출근 메이크업",
    note: "",
    time: "17:30",
    tone: "weekday",
  },
  {
    day: "수",
    title: "포인트형 남돌 커버",
    note: "주근깨 · 썬번",
    time: "17:30",
    tone: "weekday",
  },
  {
    day: "목",
    title: "출근 메이크업",
    note: "",
    time: "17:30",
    tone: "weekday",
  },
  {
    day: "금",
    title: "컨셉 메이크업",
    note: "고전미녀 · 일본미소녀",
    time: "17:30",
    tone: "weekday",
  },
  {
    day: "토",
    title: "다크 힙 남돌 커버",
    note: "뱀파이어 · 피어싱 등",
    time: "21:30",
    tone: "weekend",
  },
  {
    day: "일",
    title: "따라할만한 여돌 메이크업",
    note: "",
    time: "21:30",
    tone: "weekend",
  },
] as const;

function WeeklyReelsSchedule() {
  return (
    <section className="content-weekly" aria-labelledby="weekly-reels-title">
      <header className="content-weekly-heading">
        <div>
          <p className="content-weekly-account">@ny.iro</p>
          <h2 id="weekly-reels-title">주간 릴스 편성표</h2>
        </div>
        <span className="content-weekly-fixed">매주 고정</span>
      </header>
      <p className="content-weekly-caption">주 6회 업로드 · 한국시간 기준</p>
      <ol className="content-weekly-days">
        {weeklyReels.map((entry) => (
          <li key={entry.day} className={`content-weekly-day is-${entry.tone}`}>
            <span className="content-weekly-day-label">
              {entry.day}
              <span className="sr-only">요일</span>
            </span>
            <div className="content-weekly-topic">
              <strong>{entry.title}</strong>
              {entry.note && <span>{entry.note}</span>}
            </div>
            {entry.time ? (
              <time className="content-weekly-time" dateTime={entry.time}>
                {entry.time}
              </time>
            ) : (
              <span className="content-weekly-off">업로드 X</span>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

function safeLink(value: string) {
  try {
    const url = new URL(value.trim());
    return ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

function cell(columns: string[], row: string[], ...labels: string[]) {
  for (const label of labels) {
    const index = columns.findIndex(
      (column) => column.replace(/\s/g, "") === label.replace(/\s/g, ""),
    );
    if (index !== -1 && row[index]?.trim()) return row[index];
  }
  return "";
}

function cardFields(columns: string[], row: string[], index: number) {
  return {
    title:
      cell(columns, row, "테마", "주제", "제목", "콘텐츠명", "콘텐츠 요약") ||
      cell(columns, row, "콘텐츠 ID") ||
      `콘텐츠 ${index + 1}`,
    id: cell(columns, row, "콘텐츠 ID"),
    date: cell(columns, row, "발행일", "작성일", "날짜"),
    status: cell(columns, row, "원고 상태", "발행상태", "상태"),
    format: cell(columns, row, "형식"),
    summary: cell(
      columns,
      row,
      "1차 훅",
      "표지/첫 1초 문구",
      "핵심 인사이트",
      "캡션",
      "분석 인사이트",
    ),
  };
}

function ContentValue({ value }: { value: string }) {
  const href = safeLink(value);
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {value} <ArrowUpRight size={14} aria-hidden="true" />
    </a>
  ) : (
    <>{value || "—"}</>
  );
}

function PlannerSheet({
  tab,
  onSessionExpired,
}: {
  tab: PersonalSheetTab;
  onSessionExpired?: () => void;
}) {
  const label = personalSheetTabs[tab].label;
  const [result, setResult] = useState<PersonalSheetData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(pageSize);
  const [detail, setDetail] = useState<{
    row: string[];
    columns: string[];
    title: string;
    index: number;
    sourceUrl?: string;
  } | null>(null);
  const detailOpen = useRef(false);
  const sessionExpired = useRef(onSessionExpired);
  useEffect(() => {
    sessionExpired.current = onSessionExpired;
  }, [onSessionExpired]);
  useEffect(() => {
    detailOpen.current = detail !== null;
  }, [detail]);

  const refresh = useCallback(() => {
    setLoading(true);
    setRevision((value) => value + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(
          `/api/personal-sheets?workspace=PERSONAL&tab=${tab}`,
          {
            cache: "no-store",
            signal: AbortSignal.any([
              controller.signal,
              AbortSignal.timeout(25000),
            ]),
          },
        );
        const body = await response.json();
        if (controller.signal.aborted) return;
        if (response.status === 401) {
          setResult(null);
          setDetail(null);
          sessionExpired.current?.();
          throw new Error(
            "로그인이 만료되었어요. 계정 메뉴에서 다시 로그인해 주세요.",
          );
        }
        if (!response.ok)
          throw new Error(body.error || "콘텐츠를 불러오지 못했어요.");
        setResult(body as PersonalSheetData);
        setError("");
      } catch (cause) {
        if (controller.signal.aborted) return;
        setError(
          cause instanceof Error && cause.name === "TimeoutError"
            ? "시트 연결이 지연되고 있어요. 잠시 후 다시 시도해 주세요."
            : cause instanceof Error
              ? cause.message
              : "콘텐츠를 불러오지 못했어요.",
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [tab, revision]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && !detailOpen.current)
        refresh();
    }, 60000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const normalizedQuery = query.trim().toLocaleLowerCase("ko-KR");
  const filtered = (result?.rows || [])
    .map((row, index) => ({ row, index }))
    .filter(
      ({ row }) =>
        !normalizedQuery ||
        row.some((value) =>
          value.toLocaleLowerCase("ko-KR").includes(normalizedQuery),
        ),
    );
  const sourceUrl = result ? safeLink(result.sourceUrl) : undefined;
  const fetchedDate = result ? new Date(result.fetchedAt) : null;
  const fetchedAt =
    fetchedDate && Number.isFinite(fetchedDate.getTime())
      ? fetchedDate.toLocaleTimeString("ko-KR", {
          timeZone: "Asia/Seoul",
          hour: "numeric",
          minute: "2-digit",
        })
      : "";

  return (
    <div className="content-planner-sheet" aria-busy={loading}>
      <div className="content-planner-tools">
        <label className="content-planner-search">
          <Search size={18} aria-hidden="true" />
          <span className="sr-only">{label} 검색</span>
          <input
            type="search"
            value={query}
            placeholder="제목, 내용, 상태 검색"
            onChange={(event) => {
              setQuery(event.target.value);
              setShown(pageSize);
            }}
          />
        </label>
        <button
          type="button"
          className="content-planner-refresh"
          disabled={loading}
          aria-label={`${label} 새로고침${loading ? " 중" : ""}`}
          onClick={refresh}
        >
          <RefreshCw
            size={18}
            aria-hidden="true"
            className={loading ? "content-planner-spinning" : ""}
          />
        </button>
      </div>
      <div className="content-planner-meta">
        <p aria-live="polite">
          {result ? (
            <>
              <strong>{filtered.length.toLocaleString("ko-KR")}</strong>개
              {normalizedQuery
                ? ` / 전체 ${result.rows.length.toLocaleString("ko-KR")}개`
                : " 콘텐츠"}
            </>
          ) : (
            `${label} 목록`
          )}
        </p>
        {sourceUrl && (
          <a href={sourceUrl} target="_blank" rel="noopener noreferrer">
            원본 시트 <ArrowUpRight size={14} aria-hidden="true" />
          </a>
        )}
      </div>
      {error && (
        <div className="content-planner-error" role="alert">
          <p>{error}</p>
          {result && <p>아래는 마지막으로 불러온 내용이에요.</p>}
          <button type="button" disabled={loading} onClick={refresh}>
            다시 시도
          </button>
        </div>
      )}
      {loading && !result && (
        <div className="content-planner-empty" role="status">
          <span aria-hidden="true">✏️</span>
          <p>{label} 콘텐츠를 불러오는 중이에요.</p>
        </div>
      )}
      {result && !filtered.length && (
        <div className="content-planner-empty" role="status">
          <span aria-hidden="true">🌱</span>
          <strong>
            {normalizedQuery
              ? "일치하는 콘텐츠가 없어요"
              : "아직 등록된 콘텐츠가 없어요"}
          </strong>
          <p>
            {normalizedQuery
              ? "다른 제목이나 단어로 찾아보세요."
              : "연결된 시트에 적으면 여기에 보여요."}
          </p>
        </div>
      )}
      {result && filtered.length > 0 && (
        <ul
          className="content-planner-cards"
          aria-label={`${label} 콘텐츠 목록`}
        >
          {filtered.slice(0, shown).map(({ row, index }) => {
            const fields = cardFields(result.columns, row, index);
            const metrics = ["조회수", "좋아요", "저장"]
              .map((name) => ({ name, value: cell(result.columns, row, name) }))
              .filter((item) => item.value !== "");
            return (
              <li key={index}>
                <button
                  type="button"
                  className="content-planner-card"
                  aria-label={`${fields.title} 상세 보기`}
                  onClick={() =>
                    setDetail({
                      row,
                      columns: result.columns,
                      title: fields.title,
                      index,
                      sourceUrl,
                    })
                  }
                >
                  <span className="content-planner-card-top">
                    <span className="content-planner-id">
                      {fields.id || `#${index + 1}`}
                    </span>
                    {fields.status && (
                      <span className="content-planner-status">
                        {fields.status}
                      </span>
                    )}
                  </span>
                  <strong className="content-planner-title">
                    {fields.title}
                  </strong>
                  {fields.summary && fields.summary !== fields.title && (
                    <span className="content-planner-summary">
                      {fields.summary}
                    </span>
                  )}
                  {tab === "performance" && metrics.length > 0 && (
                    <span className="content-planner-metrics">
                      {metrics.map((metric) => (
                        <span key={metric.name}>
                          {metric.name}
                          <strong>{metric.value}</strong>
                        </span>
                      ))}
                    </span>
                  )}
                  <span className="content-planner-card-bottom">
                    <span>
                      {[fields.format, fields.date]
                        .filter(Boolean)
                        .join(" · ") || "내용 자세히 보기"}
                    </span>
                    <ChevronRight size={17} aria-hidden="true" />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {filtered.length > shown && (
        <button
          type="button"
          className="content-planner-more"
          onClick={() => setShown((value) => value + pageSize)}
        >
          콘텐츠 더 보기 · {filtered.length - shown}개 남음
        </button>
      )}
      {result?.truncated && (
        <p className="content-planner-footnote">
          최대 {result.rowLimit.toLocaleString("ko-KR")}개까지 표시해요.
          나머지는 원본 시트에서 확인할 수 있어요.
        </p>
      )}
      {result && (
        <p className="content-planner-footnote">
          {fetchedAt ? `${fetchedAt} 확인 · ` : ""}읽기 전용 · 수정은 원본
          시트에서
        </p>
      )}
      {detail && (
        <OpsDialog
          title={`${label} · 콘텐츠 ${detail.index + 1}`}
          busy={false}
          close={() => setDetail(null)}
        >
          <div className="content-planner-detail">
            <h3>{detail.title}</h3>
            <p className="content-planner-detail-note">
              시트에 적은 내용을 그대로 보여드려요.
            </p>
            <dl>
              {detail.columns.map((column, index) => (
                <div key={index}>
                  <dt>{column || `열 ${index + 1}`}</dt>
                  <dd>
                    <ContentValue value={detail.row[index] || ""} />
                  </dd>
                </div>
              ))}
            </dl>
            <div className="content-planner-detail-actions">
              <button type="button" data-dialog-close>
                닫기
              </button>
              {detail.sourceUrl && (
                <a
                  href={detail.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  원본 시트 열기 <ArrowUpRight size={15} aria-hidden="true" />
                </a>
              )}
            </div>
          </div>
        </OpsDialog>
      )}
    </div>
  );
}

export function PersonalContentPlanner({
  enabled,
  onSessionExpired,
}: {
  enabled: boolean;
  onSessionExpired?: () => void;
}) {
  const [tab, setTab] = useState<PersonalSheetTab>("planning");
  return (
    <section className="content-planner" aria-label="콘텐츠 플래너">
      <WeeklyReelsSchedule />
      <nav className="content-planner-tabs" aria-label="콘텐츠 시트 선택">
        {tabs.map((id) => (
          <button
            type="button"
            key={id}
            aria-pressed={id === tab}
            onClick={() => setTab(id)}
          >
            {personalSheetTabs[id].label}
          </button>
        ))}
      </nav>
      {enabled ? (
        <PlannerSheet key={tab} tab={tab} onSessionExpired={onSessionExpired} />
      ) : (
        <p className="content-planner-empty">
          개인 계정으로 로그인하면 콘텐츠를 볼 수 있어요.
        </p>
      )}
    </section>
  );
}
