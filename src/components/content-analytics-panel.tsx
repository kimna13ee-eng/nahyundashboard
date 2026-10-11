"use client";
import { useEffect, useState } from "react";
import { contentStages, contentSummary } from "@/lib/content-analytics";
import type { OpsRow } from "@/lib/ops";
import { isVerificationRecord } from "@/lib/content-analytics";

export function ContentAnalyticsPanel({
  enabled,
  projects,
  day,
  now,
}: {
  enabled: boolean;
  projects: OpsRow[];
  day: string;
  now: number;
}) {
  const [result, setResult] = useState<{
    rows: OpsRow[];
    truncated: boolean;
  } | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [excludeTests, setExcludeTests] = useState(true);
  const [channel, setChannel] = useState("all");
  const [project, setProject] = useState("all");
  const [date, setDate] = useState(day);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/phase2?workspace=PERSONAL", {
          cache: "no-store",
          signal: controller.signal,
        });
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.error || "콘텐츠 조회에 실패했습니다.");
        if (!controller.signal.aborted) {
          setResult({
            rows: body.data.content,
            truncated: body.truncated.includes("content"),
          });
          setError("");
        }
      } catch (e) {
        if (!controller.signal.aborted) {
          setResult(null);
          setError(
            e instanceof Error ? e.message : "콘텐츠 조회에 실패했습니다.",
          );
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [enabled, revision]);
  const rows = enabled ? result?.rows || [] : [];
  const summary = contentSummary(rows, {
    day: date,
    now,
    excludeTests,
    channel,
    project,
  });
  const channels = [
    ...new Set(rows.map((row) => String(row.channel || ""))),
  ].sort();
  return (
    <section
      className="ops-card ops-content-analytics"
      aria-labelledby="content-analytics-heading"
    >
      <h2 id="content-analytics-heading">콘텐츠 현황</h2>
      <p>
        PERSONAL 저장 기록 기준 · 단계·승인은 전체 기간, 발행일은 선택 날짜 기준
      </p>
      {!enabled ? (
        <p>
          개인 로그인과 PERSONAL 저장소 연결이 필요합니다. FRENGLE은
          미연결입니다.
        </p>
      ) : (
        <>
          <div className="ops-toolbar">
            <label>
              발행일{" "}
              <input
                aria-label="콘텐츠 통계 날짜"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value || day)}
              />
            </label>
            <label>
              채널{" "}
              <select
                aria-label="콘텐츠 통계 채널"
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
              >
                <option value="all">전체 채널</option>
                {channels.map((c) => (
                  <option key={c} value={c}>
                    {c || "채널 미지정"}
                  </option>
                ))}
              </select>
            </label>
            <label>
              프로젝트{" "}
              <select
                aria-label="콘텐츠 통계 프로젝트"
                value={project}
                onChange={(e) => setProject(e.target.value)}
              >
                <option value="all">전체 프로젝트</option>
                <option value="">연결 없음</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {String(p.title)}
                  </option>
                ))}
              </select>
            </label>
            <button
              disabled={loading}
              onClick={() => {
                setLoading(true);
                setResult(null);
                setError("");
                setRevision((r) => r + 1);
              }}
            >
              콘텐츠 통계 새로고침
            </button>
          </div>
          <label>
            <input
              type="checkbox"
              checked={excludeTests}
              onChange={(e) => setExcludeTests(e.target.checked)}
            />{" "}
            명시적인 검증용 제목의 콘텐츠 제외
          </label>
          {loading ? (
            <p role="status">콘텐츠 통계를 불러오는 중…</p>
          ) : error ? (
            <p role="alert">{error}</p>
          ) : result ? (
            <>
              {result.truncated ? (
                <p role="alert">
                  콘텐츠 조회 제한 1,000건 초과. 아래 수치는 조회된 일부
                  데이터의 집계입니다.
                </p>
              ) : null}
              <p role="status">
                집계 콘텐츠 {summary.total}건 · 승인 대기 {summary.pending}건 ·
                발행 단계 기록 {summary.recordedPublished}건
              </p>
              <p>
                미발행 중 발행일 지정 {summary.scheduled}건 · 예정 시각 경과{" "}
                {summary.overdue}건 · 발행일 미지정 {summary.unscheduled}건
              </p>
              <p>
                선택 날짜 {date}의 발행일 기록 {summary.selectedDay}건 (발행
                여부와 무관)
              </p>
              <h3>제작 단계별 현황</h3>
              <div className="ops-table-wrap">
                <table>
                  <caption>현재 필터에 해당하는 전체 기간 콘텐츠</caption>
                  <thead>
                    <tr>
                      <th scope="col">단계</th>
                      <th scope="col">건수</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contentStages.map(([key, label]) => (
                      <tr key={key}>
                        <th scope="row">{label}</th>
                        <td>{summary.stages[key]}건</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <h3>채널별 현황</h3>
              <h3>개인 콘텐츠 수동 성과 비교</h3>
              <p>
                콘텐츠별 마지막 입력값입니다. 기록 기준 시각이 다르면 같은 기간
                성과로 비교할 수 없습니다.
              </p>
              <div className="ops-table-wrap">
                <table>
                  <caption>
                    직접 입력한 인스타그램 성과 · 누락 값은 미기록
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">콘텐츠</th>
                      <th scope="col">기준 시각</th>
                      {[
                        "조회수",
                        "도달",
                        "좋아요",
                        "댓글",
                        "공유",
                        "저장",
                        "프로필 방문",
                        "팔로워 변화",
                      ].map((s) => (
                        <th scope="col" key={s}>
                          {s}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows
                      .filter(
                        (r) =>
                          (!excludeTests || !isVerificationRecord(r)) &&
                          (channel === "all" ||
                            String(r.channel || "") === channel) &&
                          (project === "all" ||
                            String(r.project_id || "") === project),
                      )
                      .filter(
                        (r) =>
                          (
                            r.personal_details as
                              | Record<string, unknown>
                              | undefined
                          )?.metrics_at,
                      )
                      .map((r) => {
                        const d = r.personal_details as Record<string, unknown>;
                        return (
                          <tr key={r.id}>
                            <th scope="row">{r.title}</th>
                            <td>
                              {new Date(String(d.metrics_at)).toLocaleString(
                                "ko-KR",
                                { timeZone: "Asia/Seoul" },
                              )}
                            </td>
                            {[
                              "views",
                              "reach",
                              "likes",
                              "comments",
                              "shares",
                              "saves",
                              "profile_visits",
                              "follower_change",
                            ].map((key) => (
                              <td key={key}>{String(d[key] ?? "미기록")}</td>
                            ))}
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
              {summary.channels.map(([name, count]) => (
                <p key={name}>
                  {name || "채널 미지정"}: {count}건
                </p>
              ))}
              {!summary.total ? (
                <p>현재 필터에 집계할 콘텐츠가 없습니다.</p>
              ) : null}
              <p className="ops-footnote">
                발행·성과 확인은 사용자가 입력한 상태입니다. 외부
                조회수·전환율·자동 발행 여부는 미연결로 집계하지 않습니다.
                검증용 제외는 제목 접두어 기준입니다.
              </p>
            </>
          ) : null}
        </>
      )}
    </section>
  );
}
