"use client";
import { ArrowUpRight, RefreshCw } from "lucide-react";
import type { OpsRow } from "@/lib/ops";
import {
  automationReceiptIso,
  automationReceiptRows,
  automationReceiptTime,
  automationSourceLabel,
  chatGptSourceUrl,
  type AutomationWorkspace,
} from "@/lib/automation-receipts";
import "@/app/automation-results.css";

export function AutomationReceiptList({
  results,
  workspace,
  limit,
}: {
  results: OpsRow[];
  workspace: AutomationWorkspace;
  limit?: number;
}) {
  const rows = automationReceiptRows(results, workspace, limit);
  return (
    <div className="ops-automation-list">
      {rows.map((result) => {
        const title = String(result.title || "자동화 결과");
        const sourceUrl = chatGptSourceUrl(result.source_url);
        return (
          <article className="ops-automation-receipt" key={result.id}>
            <header>
              <div className="ops-automation-copy">
                <span className="ops-automation-source">
                  {automationSourceLabel(result.source)}
                </span>
                <h3>
                  {sourceUrl ? (
                    <a
                      href={sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {title}
                    </a>
                  ) : (
                    title
                  )}
                </h3>
                <p className="ops-automation-received">
                  <time dateTime={automationReceiptIso(result.received_at)}>
                    {automationReceiptTime(result.received_at)}
                  </time>{" "}
                  수신
                </p>
              </div>
              {sourceUrl ? (
                <a
                  className="ops-automation-chat"
                  href={sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${title} · ChatGPT 대화 열기`}
                >
                  ChatGPT 대화 열기{" "}
                  <ArrowUpRight size={14} aria-hidden="true" />
                </a>
              ) : (
                <span className="ops-automation-no-link">
                  원본 대화 링크 없음
                </span>
              )}
            </header>
            <details className="ops-automation-body">
              <summary>결과 내용 보기</summary>
              <p className="ops-automation-reported">
                작업 보고: {automationReceiptTime(result.reported_at)}
              </p>
              <div>{String(result.body || "저장된 내용이 없습니다.")}</div>
            </details>
          </article>
        );
      })}
    </div>
  );
}

export function AutomationResultsPanel({
  results,
  ready,
  refresh,
  enabled = true,
  loading = false,
  compact = false,
  onViewAll,
  workspace = "PERSONAL",
}: {
  results: OpsRow[];
  ready: boolean;
  refresh: () => void;
  enabled?: boolean;
  loading?: boolean;
  compact?: boolean;
  onViewAll?: () => void;
  workspace?: AutomationWorkspace;
}) {
  const rows =
    enabled && ready ? automationReceiptRows(results, workspace) : [];
  return (
    <section
      className={`ops-card ops-automation-results${compact ? " compact" : ""}`}
    >
      <div className="ops-section-head">
        <div>
          <h2>{compact ? "최근 자동화 결과" : "자동화 데이터"}</h2>
          <p>
            {workspace === "PERSONAL"
              ? "PERSONAL · Metricool 데이터 확인"
              : "FRENGLE · 출근 업무 · 키워드 순찰 · 사이트 소재"}{" "}
            {enabled && ready ? `· ${rows.length}건 수신` : ""}
          </p>
        </div>
        <div className="ops-automation-actions">
          {compact && onViewAll ? (
            <button type="button" onClick={onViewAll}>
              전체 결과 보기
            </button>
          ) : null}
          <button
            type="button"
            onClick={refresh}
            disabled={!enabled || loading}
          >
            <RefreshCw size={14} aria-hidden="true" />{" "}
            {loading ? "확인 중" : "결과 새로고침"}
          </button>
        </div>
      </div>
      {!enabled ? (
        <p className="ops-automation-state" role="status">
          {workspace} 계정으로 로그인하면 이 공간의 자동화 결과를 볼 수
          있습니다.
        </p>
      ) : loading && !ready ? (
        <p className="ops-automation-state" role="status">
          자동화 결과를 불러오는 중입니다.
        </p>
      ) : !ready ? (
        <p className="ops-automation-state" role="status">
          자동화 결과를 확인하지 못했습니다. 결과 새로고침으로 다시 확인해
          주세요.
        </p>
      ) : !rows.length ? (
        <p className="ops-automation-state">
          아직 수신한 {workspace === "PERSONAL" ? "Metricool" : "회사 자동화"}{" "}
          결과가 없습니다. ChatGPT에서 결과가 전달되면 여기에 표시됩니다.
        </p>
      ) : (
        <AutomationReceiptList
          results={rows}
          workspace={workspace}
          limit={compact ? 3 : undefined}
        />
      )}
      <p className="ops-automation-help">
        저장된 결과만 표시합니다. 수신 내역이 없다고 예약 작업이 실패한 것은
        아닙니다.
      </p>
    </section>
  );
}
