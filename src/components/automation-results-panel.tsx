"use client";
import type { OpsRow } from "@/lib/ops";
export function AutomationResultsPanel({
  results,
  ready,
  refresh,
}: {
  results: OpsRow[];
  ready: boolean;
  refresh: () => void;
}) {
  return (
    <section className="ops-card">
      <div className="ops-section-head">
        <div>
          <h2>ChatGPT 자동화 결과</h2>
          <p>PERSONAL · Metricool 데이터 확인</p>
        </div>
        <button onClick={refresh}>결과 새로고침</button>
      </div>
      <p>
        ChatGPT 도구가 전달하고 서버가 저장한 결과만 표시합니다. 목록이 비어
        있어도 예약 작업이 실패했다는 뜻은 아닙니다.
      </p>
      {!ready ? (
        <p role="status">결과 저장소 연결이 필요합니다.</p>
      ) : !results.length ? (
        <p>아직 전달된 실행 결과가 없습니다.</p>
      ) : null}
      {ready
        ? results.map((result) => (
            <details className="ops-note" key={result.id}>
              <summary>
                {String(result.title)} ·{" "}
                {new Date(String(result.received_at)).toLocaleString("ko-KR", {
                  timeZone: "Asia/Seoul",
                })}{" "}
                수신
              </summary>
              <p>
                작업 보고 시각:{" "}
                {new Date(String(result.reported_at)).toLocaleString("ko-KR", {
                  timeZone: "Asia/Seoul",
                })}
              </p>
              <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                {String(result.body)}
              </p>
              <a
                href={String(result.source_url)}
                target="_blank"
                rel="noopener noreferrer"
              >
                ChatGPT 원본 열기
              </a>
            </details>
          ))
        : null}
      <h3>FRENGLE 자동화</h3>
      <p>
        키워드 검색 자동화 · 사이트 읽고 키워드 추천은 회사 저장소 연결 후
        받습니다. PERSONAL에는 저장하지 않습니다.
      </p>
      <a href="/frengle">회사 계정 연결 및 자동화 결과 열기</a>
    </section>
  );
}
