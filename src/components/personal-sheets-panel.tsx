"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, RefreshCw, Search } from "lucide-react";
import { OpsDialog } from "./ops-dialog";

const sheetTabs = [
  { id: "planning", label: "기획" },
  { id: "drafts", label: "원고" },
  { id: "performance", label: "성과" },
] as const;
type SheetTab = (typeof sheetTabs)[number]["id"];
type SheetResult = {
  tab: SheetTab;
  sheetTitle: string;
  sourceTitle?: string;
  columns: string[];
  rows: string[][];
  fetchedAt: string;
  sourceUrl: string;
  truncated: boolean;
  rowLimit: number;
};

function safeLink(value: string) {
  try {
    const url = new URL(value.trim());
    return ["https:", "http:"].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function SheetCell({ value }: { value: string }) {
  const href = safeLink(value);
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {value}
      <ArrowUpRight size={12} aria-hidden="true" />
    </a>
  ) : (
    <>{value || "—"}</>
  );
}

function SheetView({ tab }: { tab: (typeof sheetTabs)[number] }) {
  const [result, setResult] = useState<SheetResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [query, setQuery] = useState("");
  const [detail, setDetail] = useState<{
    row: string[];
    index: number;
    columns: string[];
    sheetTitle: string;
  } | null>(null);
  const refresh = useCallback(() => {
    setLoading(true);
    setRevision((value) => value + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(
          `/api/personal-sheets?workspace=PERSONAL&tab=${tab.id}`,
          {
            cache: "no-store",
            signal: AbortSignal.any([
              controller.signal,
              AbortSignal.timeout(25000),
            ]),
          },
        );
        const body = await response.json();
        if (!response.ok)
          throw new Error(
            response.status === 401
              ? "로그인이 만료되었습니다. Settings에서 다시 로그인해 주세요."
              : body.error || "시트를 불러오지 못했습니다.",
          );
        if (controller.signal.aborted) return;
        setResult(body as SheetResult);
        setError("");
      } catch (cause) {
        if (controller.signal.aborted) return;
        setResult(null);
        setDetail(null);
        setError(
          cause instanceof Error && cause.name === "TimeoutError"
            ? "시트 조회가 지연되고 있습니다. 잠시 후 새로고침해 주세요."
            : cause instanceof Error
              ? cause.message
              : "시트를 불러오지 못했습니다.",
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [tab.id, revision]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && !detail) refresh();
    }, 60000);
    return () => window.clearInterval(timer);
  }, [refresh, detail]);

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
    fetchedDate && !Number.isNaN(fetchedDate.getTime())
      ? fetchedDate.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })
      : null;

  return (
    <div className="ops-personal-sheet-view" aria-busy={loading}>
      <div className="ops-sheet-toolbar">
        <label className="ops-sheet-search">
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">{tab.label} 시트 전체 열 검색</span>
          <input
            type="search"
            value={query}
            placeholder="이 시트에서 검색"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <button type="button" disabled={loading} onClick={refresh}>
          <RefreshCw size={15} aria-hidden="true" />
          {loading ? "조회 중" : "새로고침"}
        </button>
        {sourceUrl ? (
          <a href={sourceUrl} target="_blank" rel="noopener noreferrer">
            원본 시트 열기 <ArrowUpRight size={14} aria-hidden="true" />
          </a>
        ) : null}
      </div>
      <div className="ops-sheet-meta" aria-live="polite">
        <p>
          {result ? (
            <>
              {result.sheetTitle} · {filtered.length.toLocaleString()}개 항목
              {normalizedQuery
                ? ` / 전체 ${result.rows.length.toLocaleString()}개`
                : ""}
            </>
          ) : (
            `${tab.label} 시트`
          )}
        </p>
        {fetchedAt ? <p>마지막 조회 {fetchedAt} · 한국시간</p> : null}
      </div>
      {error ? (
        <div className="ops-alert bad ops-sheet-error" role="alert">
          {error}
          <button type="button" onClick={refresh} disabled={loading}>
            다시 시도
          </button>
        </div>
      ) : null}
      {loading && !result ? (
        <p className="ops-sheet-empty" role="status">
          {tab.label} 시트를 불러오는 중입니다.
        </p>
      ) : null}
      {result && !filtered.length ? (
        <p className="ops-sheet-empty" role="status">
          {normalizedQuery
            ? "검색어와 일치하는 항목이 없습니다."
            : "시트에 등록된 항목이 없습니다."}
        </p>
      ) : null}
      {result && filtered.length ? (
        <>
          <p className="ops-sheet-reading-hint">
            가로로 스크롤해 모든 열을 확인하고, 항목을 누르면 전체 내용을 볼 수
            있습니다.
          </p>
          <div
            className="ops-sheet-table-wrap"
            tabIndex={0}
            role="region"
            aria-label={`${tab.label} 시트 표. 가로 스크롤 가능`}
          >
            <table className="ops-sheet-table">
              <caption className="sr-only">
                {result.sheetTitle} 읽기 전용 표
              </caption>
              <thead>
                <tr>
                  {result.columns.map((column, index) => (
                    <th key={index} scope="col">
                      {column || `열 ${index + 1}`}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(({ row, index }) => (
                  <tr
                    key={index}
                    onClick={(event) => {
                      if ((event.target as HTMLElement).closest("a,button"))
                        return;
                      setDetail({
                        row,
                        index,
                        columns: result.columns,
                        sheetTitle: result.sheetTitle,
                      });
                    }}
                  >
                    {result.columns.map((_, columnIndex) =>
                      columnIndex === 0 ? (
                        <th key={columnIndex} scope="row">
                          <button
                            type="button"
                            className="ops-sheet-row-open"
                            aria-label={`${tab.label} 항목 ${index + 1} 상세: ${row[0] || "제목 없음"}`}
                            onClick={() =>
                              setDetail({
                                row,
                                index,
                                columns: result.columns,
                                sheetTitle: result.sheetTitle,
                              })
                            }
                          >
                            <span>{row[0] || `항목 ${index + 1}`}</span>
                            <ArrowUpRight size={13} aria-hidden="true" />
                          </button>
                        </th>
                      ) : (
                        <td key={columnIndex}>
                          <div className="ops-sheet-cell">
                            <SheetCell value={row[columnIndex] || ""} />
                          </div>
                        </td>
                      ),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
      {result?.truncated ? (
        <p className="ops-sheet-limit">
          최대 {result.rowLimit.toLocaleString()}개 항목까지 표시합니다.
          나머지는 원본 시트에서 확인해 주세요.
        </p>
      ) : null}
      {detail && result ? (
        <OpsDialog
          title={`${tab.label} · 항목 ${detail.index + 1}`}
          busy={false}
          close={() => setDetail(null)}
        >
          <p className="ops-sheet-detail-caption">
            {detail.sheetTitle} · 읽기 전용
          </p>
          <dl className="ops-sheet-detail">
            {detail.columns.map((column, index) => (
              <div key={index}>
                <dt>{column || `열 ${index + 1}`}</dt>
                <dd>
                  <SheetCell value={detail.row[index] || ""} />
                </dd>
              </div>
            ))}
          </dl>
          <div className="ops-form-actions">
            <button type="button" data-dialog-close>
              닫기
            </button>
            {sourceUrl ? (
              <a href={sourceUrl} target="_blank" rel="noopener noreferrer">
                원본 시트 열기 <ArrowUpRight size={14} aria-hidden="true" />
              </a>
            ) : null}
          </div>
        </OpsDialog>
      ) : null}
    </div>
  );
}

export function PersonalSheetsPanel({ enabled }: { enabled: boolean }) {
  const [tabId, setTabId] = useState<SheetTab>("planning");
  const tab = sheetTabs.find((item) => item.id === tabId)!;
  return (
    <section className="ops-card ops-personal-sheets" aria-label="콘텐츠 시트">
      <div className="ops-section-head">
        <div>
          <h2>콘텐츠 시트</h2>
          <p>PERSONAL · Google Sheets 기획, 원고, 성과</p>
        </div>
        <span className="ops-sheet-readonly">읽기 전용</span>
      </div>
      {!enabled ? (
        <p className="ops-sheet-empty">개인 계정으로 로그인해 주세요.</p>
      ) : (
        <>
          <div className="ops-sheet-tabs" aria-label="조회할 시트 선택">
            {sheetTabs.map((item) => (
              <button
                type="button"
                key={item.id}
                aria-pressed={tabId === item.id}
                onClick={() => setTabId(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <SheetView key={tab.id} tab={tab} />
          <p className="ops-sheet-footer">
            Google Sheets에서 수정한 내용을 조회합니다. 목록을 보는 동안 1분마다
            새로 불러옵니다.
          </p>
        </>
      )}
    </section>
  );
}
