"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { ArrowUpRight, BarChart3, RefreshCw } from "lucide-react";
import { OpsDialog } from "./ops-dialog";
import { workspaceApiPath } from "@/lib/workspace-api";
import {
  summarizeReelsPerformance,
  type ReelsMetricKey,
  type ReelsPerformanceEntry,
  type ReelsPerformanceSummary,
} from "@/lib/reels-performance";
import type { PersonalSheetData } from "@/lib/personal-sheets";
import "./personal-performance-panel.css";

type ChartMetric = ReelsMetricKey | "score";
const metricLabels: Record<ChartMetric, string> = {
  score: "성과 점수",
  views: "조회수",
  reactions: "반응",
  likes: "좋아요",
  comments: "댓글",
  saves: "저장",
  shares: "공유",
};
const chartMetrics: ChartMetric[] = [
  "score",
  "views",
  "reactions",
  "likes",
  "comments",
  "saves",
  "shares",
];
type Snapshot = { source: PersonalSheetData; summary: ReelsPerformanceSummary };
type Props = { enabled: boolean; onOpenStudio: () => void };

function number(value: number | null | undefined) {
  return value == null ? "미입력" : value.toLocaleString("ko-KR");
}
function metricValue(metric: ChartMetric, value: number | null | undefined) {
  return metric === "score"
    ? value == null
      ? "미산정"
      : `${value.toFixed(1)}점`
    : number(value);
}
function sourceLink(raw: string | undefined) {
  try {
    const url = new URL(raw || "");
    if (
      url.protocol !== "https:" ||
      url.hostname !== "docs.google.com" ||
      url.username ||
      url.password ||
      url.port ||
      !/^\/spreadsheets\/d\/[A-Za-z0-9_-]{20,200}\/(?:edit|view)\/?$/.test(
        url.pathname,
      )
    )
      return null;
    return (
      url.origin + url.pathname + (/^#gid=\d+$/.test(url.hash) ? url.hash : "")
    );
  } catch {
    return null;
  }
}
function instagramLink(raw: string | undefined) {
  try {
    const url = new URL(raw || "");
    if (
      url.protocol !== "https:" ||
      !["instagram.com", "www.instagram.com", "m.instagram.com"].includes(
        url.hostname,
      ) ||
      url.username ||
      url.password ||
      url.port ||
      !/^\/(?:reel|reels|p|tv)\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)
    )
      return null;
    return url.origin + url.pathname;
  } catch {
    return null;
  }
}
function checkedAt(value: string | undefined) {
  const date = new Date(value || "");
  return Number.isFinite(date.getTime())
    ? date.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false })
    : null;
}
function coverageText(
  summary: ReelsPerformanceSummary,
  metric: ReelsMetricKey,
) {
  if (summary.overflowMetrics.includes(metric))
    return "합계 표시 범위 확인 필요";
  const coverage = summary.coverage[metric];
  if (!coverage.observed) return "수치 미입력";
  return coverage.complete
    ? `${coverage.total}개 게시물 기준`
    : `부분합 · 입력 완료 ${coverage.observed}/${coverage.total}개 기준`;
}
function validSheet(value: unknown): value is PersonalSheetData {
  if (!value || typeof value !== "object") return false;
  const source = value as Partial<PersonalSheetData>;
  return (
    source.tab === "performance" &&
    Array.isArray(source.columns) &&
    source.columns.every((cell) => typeof cell === "string") &&
    Array.isArray(source.rows) &&
    source.rows.every(
      (row) =>
        Array.isArray(row) && row.every((cell) => typeof cell === "string"),
    ) &&
    typeof source.fetchedAt === "string" &&
    typeof source.sourceUrl === "string" &&
    typeof source.truncated === "boolean" &&
    typeof source.rowLimit === "number" &&
    Number.isSafeInteger(source.rowLimit) &&
    source.rowLimit > 0
  );
}

export function PersonalPerformancePanel({ enabled, onOpenStudio }: Props) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState("");
  const [metric, setMetric] = useState<ChartMetric>("score");
  const [detail, setDetail] = useState<ReelsPerformanceEntry | null>(null);
  const detailOpen = useRef(false);
  const loadCurrent = useRef<(() => Promise<boolean>) | null>(null);
  const chartTitle = useId();

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let sequence = 0;
    let activeRequest: AbortController | null = null;
    async function load(): Promise<boolean> {
      const request = ++sequence;
      activeRequest?.abort();
      const requestController = new AbortController();
      activeRequest = requestController;
      setLoading(true);
      try {
        const response = await fetch(
          workspaceApiPath(
            "/api/personal-sheets?workspace=PERSONAL&tab=performance",
          ),
          {
            cache: "no-store",
            signal: AbortSignal.any([
              controller.signal,
              requestController.signal,
              AbortSignal.timeout(25000),
            ]),
          },
        );
        if (!response.ok)
          throw new Error(
            response.status === 401
              ? "로그인이 만료됐어요. 다시 로그인한 뒤 성과를 확인해 주세요."
              : response.status === 503
                ? "성과 시트 연결을 확인하지 못했어요. Content Studio에서 연결 상태를 확인해 주세요."
                : "성과를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.",
          );
        const source: unknown = await response.json();
        if (!validSheet(source))
          throw new Error(
            "성과 시트 형식을 확인하지 못했어요. Content Studio에서 원본을 확인해 주세요.",
          );
        const summary = summarizeReelsPerformance(source);
        if (controller.signal.aborted || request !== sequence) return false;
        setSnapshot({ source, summary });
        setError("");
        return true;
      } catch (cause) {
        if (controller.signal.aborted || request !== sequence) return false;
        setSnapshot(null);
        setDetail(null);
        detailOpen.current = false;
        setError(
          cause instanceof Error && cause.name === "TimeoutError"
            ? "성과 조회가 지연되고 있어요. 잠시 후 다시 시도해 주세요."
            : cause instanceof Error &&
                /^(?:로그인이 만료|성과(?: 시트|를))/.test(cause.message)
              ? cause.message
              : "성과를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.",
        );
        return false;
      } finally {
        if (!controller.signal.aborted && request === sequence) {
          activeRequest = null;
          setLoading(false);
        }
      }
    }
    loadCurrent.current = load;
    const refresh = (event?: Event) => {
      if (detailOpen.current || document.querySelector("dialog[open]")) return;
      const pending = load();
      (
        event as CustomEvent<{ waits?: Promise<boolean>[] }> | undefined
      )?.detail?.waits?.push(pending);
      void pending;
    };
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && !activeRequest) refresh();
    }, 60000);
    window.addEventListener("myops:refresh", refresh);
    queueMicrotask(() => {
      if (!controller.signal.aborted) void load();
    });
    return () => {
      controller.abort();
      activeRequest?.abort();
      window.clearInterval(timer);
      window.removeEventListener("myops:refresh", refresh);
      if (loadCurrent.current === load) loadCurrent.current = null;
    };
  }, [enabled]);

  const result = enabled ? snapshot : null;
  const summary = result?.summary;
  const entries = [...(summary?.entries || [])]
    .sort(
      (a, b) =>
        b.publishedAt.localeCompare(a.publishedAt) || a.id.localeCompare(b.id),
    )
    .slice(0, 12);
  const maximum =
    metric === "score"
      ? 100
      : Math.max(0, ...entries.map((entry) => entry[metric] ?? 0));
  const observedDates = [
    ...new Set(
      (summary?.entries || [])
        .map((entry) => entry.observedAt)
        .filter((date): date is string => !!date),
    ),
  ].sort();
  const observedLabel = observedDates.length
    ? observedDates.length === 1
      ? observedDates[0]
      : `${observedDates[0]} ~ ${observedDates.at(-1)}`
    : "미입력";
  const sourceUrl = sourceLink(result?.source.sourceUrl);
  const fetchedAt = checkedAt(result?.source.fetchedAt);
  const ready = !!summary;
  const scoreCoverage = summary
    ? `산정 완료 ${summary.performanceScore.scored}/${summary.performanceScore.total}개 평균`
    : "5개 지표를 기록한 릴스 기준";
  function openDetail(entry: ReelsPerformanceEntry) {
    detailOpen.current = true;
    setDetail(entry);
  }
  function closeDetail() {
    detailOpen.current = false;
    setDetail(null);
  }

  return (
    <section
      className="ops-card ops-reels-performance"
      aria-label="릴스 발행 성과"
      aria-busy={enabled && loading}
    >
      <div className="ops-reels-heading">
        <div>
          <span className="ops-reels-eyebrow">PERSONAL · CONTENT STUDIO</span>
          <h2>릴스 발행 성과</h2>
          <p>
            {result?.source.truncated
              ? "조회 범위 내 릴스의 게시물별 최신 관측값을 모았어요."
              : "발행된 릴스의 게시물별 최신 관측값을 모았어요."}
          </p>
          <span className="ops-reels-post-count">
            {result?.source.truncated ? "조회 범위 내 · " : ""}발행 릴스{" "}
            {summary
              ? summary.missingColumns.length && !summary.postCount
                ? "확인 필요"
                : `${summary.postCount.toLocaleString("ko-KR")}개`
              : "—"}
          </span>
        </div>
        <div className="ops-reels-actions">
          <button
            type="button"
            onClick={() => void loadCurrent.current?.()}
            disabled={!enabled || loading}
            aria-label="릴스 성과 새로고침"
          >
            <RefreshCw
              size={15}
              aria-hidden="true"
              className={loading ? "ops-spinning" : undefined}
            />
            <span>새로고침</span>
          </button>
          <button type="button" onClick={onOpenStudio} disabled={!enabled}>
            발행·성과 시트 <ArrowUpRight size={14} aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="ops-reels-summary">
        <div className="ops-reels-stat is-primary">
          <span>릴스 성과 점수</span>
          <strong>
            {summary ? (
              summary.performanceScore.value === null ? (
                "산정 대기"
              ) : (
                <>
                  {summary.performanceScore.value.toFixed(1)}
                  <span className="ops-reels-score-denominator"> / 100</span>
                </>
              )
            ) : (
              "—"
            )}
          </strong>
          <small>
            {result?.source.truncated ? "조회 범위 내 · " : ""}
            {scoreCoverage}
          </small>
        </div>
        <div className="ops-reels-stat">
          <span>총 조회수{result?.source.truncated ? " · 부분합" : ""}</span>
          <strong>{ready ? number(summary.totals.views) : "—"}</strong>
          <small>
            {summary ? coverageText(summary, "views") : "발행 릴스 기준"}
          </small>
        </div>
        <div className="ops-reels-stat">
          <span>총 반응{result?.source.truncated ? " · 부분합" : ""}</span>
          <strong>{ready ? number(summary.totals.reactions) : "—"}</strong>
          <small>
            {summary
              ? coverageText(summary, "reactions")
              : "좋아요·댓글·저장·공유"}
          </small>
        </div>
      </div>
      <div className="ops-reels-observation">
        <span>
          지표 관측일 <strong>{observedLabel}</strong>
        </span>
        <span>
          {fetchedAt
            ? `시트 연결 확인 ${fetchedAt} · 한국시간`
            : "시트 연결 확인 전"}
        </span>
      </div>
      {error && enabled ? (
        <div className="ops-reels-error" role="alert">
          <span>{error}</span>
          <button
            type="button"
            disabled={loading}
            onClick={() => void loadCurrent.current?.()}
          >
            다시 시도
          </button>
        </div>
      ) : null}
      {summary?.missingColumns.length ? (
        <p className="ops-reels-warning">
          분석에 필요한 열을 확인해 주세요: {summary.missingColumns.join(", ")}.
          원본 시트의 제목 행과 연결 상태를 확인할 수 있어요.
        </p>
      ) : null}
      {result?.source.truncated ? (
        <p className="ops-reels-warning">
          조회 제한으로 읽어 온 {result.source.rowLimit.toLocaleString("ko-KR")}
          행 안의 부분합계입니다. 점수 기준과 평균도 이 범위로 한정됩니다. 전체
          성과는 원본 시트에서 확인해 주세요.
        </p>
      ) : null}
      <figure className="ops-reels-chart" aria-labelledby={chartTitle}>
        <div className="ops-reels-chart-heading">
          <figcaption id={chartTitle}>
            <strong>게시물별 {metricLabels[metric]}</strong>
            <span>
              {ready
                ? metric === "score"
                  ? `최근 발행 ${entries.length}개 · 0~100점 고정 · ${scoreCoverage}`
                  : `최근 발행 ${entries.length}개 · 합계는 조회한 릴스 ${summary.postCount}개 기준`
                : "최근 발행 릴스 최대 12개"}
            </span>
          </figcaption>
          <label>
            <span className="sr-only">릴스 성과 그래프 지표</span>
            <select
              value={metric}
              onChange={(event) =>
                setMetric(event.currentTarget.value as ChartMetric)
              }
            >
              {chartMetrics.map((key) => (
                <option key={key} value={key}>
                  {metricLabels[key]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div
          className="ops-reels-plot"
          tabIndex={entries.length ? 0 : undefined}
          role="region"
          aria-label="릴스별 성과 그래프. 게시물을 누르면 상세 기록을 볼 수 있습니다."
        >
          {entries.length ? (
            entries.map((entry) => {
              const value = entry[metric];
              return (
                <button
                  key={entry.id}
                  type="button"
                  className={`ops-reels-bar-row${value === null ? " is-missing" : ""}`}
                  onClick={() => openDetail(entry)}
                  title={`${entry.title} · ${entry.publishedAt} · ${metricLabels[metric]} ${metricValue(metric, value)}`}
                  aria-label={`${entry.title}, 발행일 ${entry.publishedAt}, ${metricLabels[metric]} ${metricValue(metric, value)}, 상세 보기`}
                >
                  <span className="ops-reels-bar-label">
                    <strong>{entry.title}</strong>
                    <small>{entry.publishedAt}</small>
                  </span>
                  <span className="ops-reels-track" aria-hidden="true">
                    <span
                      style={
                        {
                          "--reels-bar-width": `${value === null || !maximum ? 0 : (value / maximum) * 100}%`,
                        } as CSSProperties
                      }
                    />
                  </span>
                  <span className="ops-reels-bar-value">
                    {metricValue(metric, value)}
                  </span>
                </button>
              );
            })
          ) : (
            <div className="ops-reels-empty" role="status">
              <BarChart3 size={24} aria-hidden="true" />
              <strong>
                {!enabled
                  ? "개인 계정으로 로그인해 주세요."
                  : loading
                    ? "릴스 성과를 불러오고 있어요."
                    : error
                      ? "성과를 다시 불러와 주세요."
                      : summary?.missingColumns.length
                        ? "성과 시트의 열 구성을 확인해 주세요."
                        : "아직 발행된 릴스가 없어요."}
              </strong>
              <span>
                {ready && !summary?.missingColumns.length
                  ? "발행일과 발행 상태가 기록된 릴스부터 표시됩니다."
                  : "조회가 완료되면 기록된 실제 수치를 표시합니다."}
              </span>
            </div>
          )}
        </div>
        {summary && summary.postCount > 0 && !summary.observedRowCount ? (
          <p className="ops-reels-warning">
            발행 릴스는 있지만 성과 수치가 아직 미입력 상태예요. 빈칸을 0으로
            계산하지 않습니다.
          </p>
        ) : null}
        {metric === "score" &&
        summary &&
        summary.postCount > 0 &&
        !summary.performanceScore.scored ? (
          <p className="ops-reels-warning">
            점수를 산정하려면 조회수·좋아요·댓글·저장·공유가 모두 필요해요.
            미입력 릴스는 평균에서 제외하며 0점으로 계산하지 않습니다.
          </p>
        ) : null}
        {entries.length ? (
          <details className="ops-reels-table">
            <summary>그래프를 표로 보기 · 최근 {entries.length}개</summary>
            <div
              className="ops-reels-table-scroll"
              role="region"
              tabIndex={0}
              aria-label="릴스 성과 표. 가로 스크롤 가능"
            >
              <table>
                <caption className="sr-only">
                  {result?.source.truncated
                    ? "조회 범위 내 최근 발행 릴스의 최신 관측 성과"
                    : "최근 발행 릴스의 최신 관측 성과"}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">릴스</th>
                    <th scope="col">발행일</th>
                    {chartMetrics.map((key) => (
                      <th scope="col" key={key}>
                        {metricLabels[key]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr key={entry.id}>
                      <th scope="row">
                        <button type="button" onClick={() => openDetail(entry)}>
                          {entry.title}
                        </button>
                      </th>
                      <td>{entry.publishedAt}</td>
                      {chartMetrics.map((key) => (
                        <td key={key}>{metricValue(key, entry[key])}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        ) : null}
      </figure>
      <dl className="ops-reels-breakdown">
        {(["likes", "comments", "saves", "shares"] as const).map((key) => (
          <div key={key}>
            <dt>{metricLabels[key]}</dt>
            <dd>{ready ? number(summary.totals[key]) : "—"}</dd>
            <small>
              {summary ? coverageText(summary, key) : "기록된 수치 합계"}
            </small>
          </div>
        ))}
      </dl>
      <details className="ops-reels-score-method">
        <summary>100점 산정 기준</summary>
        <p>
          {result?.source.truncated ? "조회 범위 내 " : "현재 발행된 "}개인
          릴스의 상대 점수예요. 조회수·좋아요·댓글·저장·공유를 각각 20%씩
          반영합니다. 5개 지표가 모두 입력된 릴스 중 각 지표의 최고 관측값을
          20점 기준으로 삼으며, 최고값이 0인 지표는 0점으로 계산합니다.
        </p>
        <p>
          게시물 점수는 5개 지표 점수의 합계이고, 상단 점수는 산정 가능한
          게시물의 평균입니다. {scoreCoverage}. 새 최고 기록이 생기면 기준과
          점수도 다시 계산됩니다.
          {result?.source.truncated
            ? " 읽어 온 행만으로 기준과 평균을 계산하므로 전체 시트의 점수와 다를 수 있어요."
            : " 콘텐츠 ID별 최신 관측값만 사용합니다."}
        </p>
      </details>
      <div className="ops-reels-footer">
        <p>
          지표 관측일은 성과를 기록한 날짜이며 시트 연결 확인 시각과 다릅니다.
          반응은 좋아요·댓글·저장·공유가 모두 입력된 게시물만 합산합니다.
        </p>
        {sourceUrl ? (
          <a href={sourceUrl} target="_blank" rel="noopener noreferrer">
            원본 Google Sheets <ArrowUpRight size={13} aria-hidden="true" />
          </a>
        ) : null}
      </div>
      {enabled && detail ? (
        <OpsDialog title="릴스 성과 상세" busy={false} close={closeDetail}>
          <div className="ops-reels-detail">
            <h3>{detail.title}</h3>
            <p>
              발행일 {detail.publishedAt} · 지표 관측일{" "}
              {detail.observedAt || "미입력"}
            </p>
            <dl>
              {chartMetrics.map((key) => (
                <div key={key}>
                  <dt>{metricLabels[key]}</dt>
                  <dd>{metricValue(key, detail[key])}</dd>
                </div>
              ))}
            </dl>
            <p>
              이 릴스의 점수는 100점 만점 상대 점수이며, 상단의 전체 평균과
              구분됩니다. 반응은 좋아요·댓글·저장·공유가 모두 입력된 경우의
              합계예요.
            </p>
            {instagramLink(detail.url) ? (
              <a
                href={instagramLink(detail.url)!}
                target="_blank"
                rel="noopener noreferrer"
              >
                Instagram 릴스 열기{" "}
                <ArrowUpRight size={14} aria-hidden="true" />
              </a>
            ) : (
              <p>확인 가능한 Instagram 게시물 링크가 없어요.</p>
            )}
          </div>
          <div className="ops-form-actions">
            <button type="button" data-dialog-close>
              닫기
            </button>
          </div>
        </OpsDialog>
      ) : null}
    </section>
  );
}
