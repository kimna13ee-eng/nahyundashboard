"use client";
import { workKindSeconds } from "@/lib/work-kind";
import { isVerificationRecord } from "@/lib/content-analytics";
import { useState } from "react";
import {
  intervalSeconds,
  intervalSecondsForDay,
  type OpsData,
} from "@/lib/ops";
export function AnalyticsPanel({
  taskClassification,
  data,
  enabled,
  now,
  day,
}: {
  taskClassification: boolean;
  data: OpsData;
  enabled: boolean;
  now: number;
  day: string;
}) {
  const [excludeTests, setExcludeTests] = useState(true);
  const [date, setDate] = useState(day);
  const tasks = (data.tasks || []).filter(
    (t) => !excludeTests || !isVerificationRecord(t),
  );
  const taskIds = new Set(tasks.map((t) => t.id));
  const sessions = (data.work_sessions || []).filter((s) =>
    taskIds.has(String(s.task_id)),
  );
  const ids = new Set(sessions.map((s) => s.id));
  const intervals = (data.session_intervals || []).filter((i) =>
    ids.has(String(i.session_id)),
  );
  const switches = (data.session_events || []).filter(
    (e) => e.kind === "switch" && ids.has(String(e.session_id)),
  );
  const kindTimes = workKindSeconds(tasks, sessions, intervals, date, now);
  const fmt = (seconds: number) => `${(seconds / 3600).toFixed(2)}시간`;
  return (
    <section className="ops-card">
      <h2>Analytics</h2>
      <p>실제 PERSONAL 작업 구간 기준 · 선택 날짜 {date}</p>
      <div className="ops-analytics-toolbar">
        <label>
          기준 날짜
          <input
            aria-label="통계 날짜"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value || day)}
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={excludeTests}
            onChange={(e) => setExcludeTests(e.target.checked)}
          />
          테스트 업무 제외 (미지정은 기존 제목 기준)
        </label>
      </div>
      {!enabled ? (
        <p>로그인 후 실제 DB 조회가 필요합니다.</p>
      ) : (
        <>
          <div className="ops-analytics-metrics">
            <div>
              <span>선택 날짜 작업 시간</span>
              <strong>
                {fmt(intervalSecondsForDay(intervals, now, date))}
              </strong>
            </div>
            <div>
              <span>전체 작업 시간</span>
              <strong>{fmt(intervalSeconds(intervals, now))}</strong>
            </div>
            <div>
              <span>전체 업무 전환</span>
              <strong>{switches.length}회</strong>
            </div>
          </div>
          <h3>선택 날짜 업무 분류별 작업 시간</h3>
          {taskClassification ? (
            <div className="ops-table-wrap">
              <table className="ops-analytics-table">
                <thead>
                  <tr>
                    <th scope="col">업무 분류</th>
                    <th scope="col">선택 날짜 작업 시간</th>
                  </tr>
                </thead>
                <tbody>
                  {(
                    [
                      ["계획 업무", kindTimes.planned],
                      ["돌발 업무", kindTimes.unexpected],
                      ["미분류", kindTimes.unclassified],
                    ] as const
                  ).map(([label, seconds]) => (
                    <tr key={label}>
                      <td>{label}</td>
                      <td>{fmt(seconds)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>업무 분류 DB 미적용: 005 SQL 적용 후 집계합니다.</p>
          )}
          <p>
            현재 업무 분류를 기준으로 과거 작업 시간도 집계합니다. 기존 업무는
            미분류이며 자동 추정하지 않습니다.
          </p>
          <h3>프로젝트별 전체 작업 시간</h3>
          <div className="ops-table-wrap">
            <table className="ops-analytics-table">
              <thead>
                <tr>
                  <th scope="col">프로젝트</th>
                  <th scope="col">전체 작업 시간</th>
                </tr>
              </thead>
              <tbody>
                {(data.projects || []).map((p) => {
                  const tids = new Set(
                    tasks.filter((t) => t.project_id === p.id).map((t) => t.id),
                  );
                  const sids = new Set(
                    sessions
                      .filter((s) => tids.has(String(s.task_id)))
                      .map((s) => s.id),
                  );
                  return (
                    <tr key={p.id}>
                      <td>{String(p.title)}</td>
                      <td>
                        {fmt(
                          intervalSeconds(
                            intervals.filter((i) =>
                              sids.has(String(i.session_id)),
                            ),
                            now,
                          ),
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!(data.projects || []).length ? (
                  <tr>
                    <td colSpan={2}>등록된 프로젝트가 없습니다.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <h3>업무별 계획 대비 실제 (전체 기간)</h3>
          <div className="ops-table-wrap">
            <table className="ops-analytics-table">
              <thead>
                <tr>
                  <th scope="col">업무</th>
                  <th scope="col">계획</th>
                  <th scope="col">실제</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t) => {
                  const sids = new Set(
                    sessions.filter((s) => s.task_id === t.id).map((s) => s.id),
                  );
                  return (
                    <tr key={t.id}>
                      <td>{String(t.title)}</td>
                      <td>{Number(t.estimated_minutes || 0)}분</td>
                      <td>
                        {(
                          intervalSeconds(
                            intervals.filter((i) =>
                              sids.has(String(i.session_id)),
                            ),
                            now,
                          ) / 60
                        ).toFixed(1)}
                        분
                      </td>
                    </tr>
                  );
                })}
                {!tasks.length ? (
                  <tr>
                    <td colSpan={3}>집계할 업무가 없습니다.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <p>
            외부 자동화는 미연결입니다. 조회 제한이 있는 경우 전체 통계가
            아닙니다.
          </p>
        </>
      )}
    </section>
  );
}
