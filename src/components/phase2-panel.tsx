"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { OpsDialog } from "./ops-dialog";
import { OpsFormActions } from "./ops-form-actions";
import { RecurringScheduleRow } from "./recurring-schedule-row";
import { LeavePanel } from "./leave-panel";
import "./leave-record.css";
import { occurrences, type Phase2Resource } from "@/lib/phase2";
import { scheduleOverlaps, type OpsData, type OpsRow } from "@/lib/ops";
import { metricKeys, personalTemplates } from "@/lib/personal-content";
import { needsPersonalContentType } from "@/lib/personal-content-form";
import { recurrenceStatus, runStates } from "@/lib/workflow";
type Field = {
  key: string;
  label: string;
  type?: string;
  choices?: [string, string][];
  initial?: string;
};
const fields: Record<string, Field[]> = {
  content: [
    { key: "channel", label: "채널" },
    {
      key: "stage",
      label: "제작 단계",
      choices: [
        ["idea", "아이디어"],
        ["production", "제작"],
        ["review", "검수"],
        ["approval", "승인"],
        ["published", "발행"],
        ["results", "성과 확인"],
      ],
    },
    {
      key: "approval",
      label: "승인 상태",
      choices: [
        ["none", "해당 없음"],
        ["pending", "대기"],
        ["approved", "승인됨"],
      ],
    },
    {
      key: "publish_at",
      label: "발행 예정 (서울 시간)",
      type: "datetime-local",
    },
    { key: "result_url", label: "발행 URL", type: "url" },
  ],
  inspiration: [
    { key: "url", label: "레퍼런스 URL", type: "url" },
    {
      key: "category",
      label: "카테고리",
      choices: ["개발", "디자인", "이미지 콘텐츠", "영상 콘텐츠", "운영"].map(
        (s) => [s, s],
      ),
    },
    { key: "favorite", label: "즐겨찾기", type: "checkbox" },
    { key: "inbox", label: "Inbox", type: "checkbox" },
  ],
  leave: [
    { key: "date", label: "기록 날짜", type: "date" },
    {
      key: "kind",
      label: "유형",
      choices: [
        ["grant", "확인된 발생"],
        ["use", "사용"],
        ["adjust", "수동 조정"],
      ],
    },
    {
      key: "amount",
      label: "일수 (사용은 음수, 반차 -0.5)",
      type: "number",
      initial: "0.5",
    },
  ],
  recurrence: [
    { key: "starts_at", label: "첫 시작 (서울 시간)", type: "datetime-local" },
    { key: "ends_at", label: "첫 종료 (서울 시간)", type: "datetime-local" },
    {
      key: "frequency",
      label: "반복 주기",
      choices: [
        ["daily", "매일"],
        ["weekly", "매주"],
        ["monthly", "매월"],
        ["yearly", "매년"],
      ],
    },
    { key: "interval", label: "반복 간격", type: "number", initial: "1" },
    { key: "until_date", label: "반복 종료일", type: "date" },
  ],
};
const labels: Record<string, string> = {
  content: "콘텐츠",
  inspiration: "레퍼런스",
  leave: "개인 연차 기록",
  recurrence: "반복 일정",
};
function local(value: unknown) {
  if (!value) return "";
  return new Date(Date.parse(String(value)) + 9 * 3600000)
    .toISOString()
    .slice(0, 16);
}
async function request(method: string, body?: unknown) {
  const res = await fetch("/api/phase2?workspace=PERSONAL", {
    method,
    signal: method === "GET" ? AbortSignal.timeout(20000) : undefined,
    cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await res.json();
  if (!res.ok)
    throw new Error(
      res.status === 401
        ? "인증이 만료되었습니다. 설정에서 다시 로그인해 주세요."
        : result.error || "요청 실패",
    );
  return result;
}
type Phase2PanelProps = {
  resource: Exclude<Phase2Resource, "exceptions">;
  enabled: boolean;
  projects: OpsRow[];
  day: string;
  calendarView?: string;
  onCalendarData?: (data: OpsData) => void;
  onOpenTask?: (id: string) => void;
  initialContentId?: string;
};
export function Phase2Panel(props: Phase2PanelProps) {
  return props.resource === "leave" ? (
    <LeavePanel enabled={props.enabled} />
  ) : (
    <Phase2ResourcePanel {...props} />
  );
}
function Phase2ResourcePanel({
  resource,
  enabled,
  projects,
  day,
  calendarView = "month",
  onCalendarData,
  onOpenTask,
  initialContentId,
}: Phase2PanelProps) {
  const [data, setData] = useState<OpsData>({}),
    [ready, setReady] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [editor, setEditor] = useState<OpsRow | null>(null),
    [removal, setRemoval] = useState<OpsRow | null>(null),
    [query, setQuery] = useState(""),
    [notice, setNotice] = useState(""),
    [scope, setScope] = useState("one");
  const openedContent = useRef<string | undefined>(undefined);
  useEffect(() => {
    const row = (data.content || []).find((r) => r.id === initialContentId);
    if (
      resource === "content" &&
      row &&
      openedContent.current !== initialContentId
    ) {
      openedContent.current = initialContentId;
      queueMicrotask(() => setEditor(row));
    }
  }, [data, initialContentId, resource]);
  const [calendarRecurrence, setCalendarRecurrence] = useState(false);
  const [recurrenceArchive, setRecurrenceArchive] = useState(false);
  const [personalContent, setPersonalContent] = useState(false);
  const [contentHistory, setContentHistory] = useState(false),
    [versions, setVersions] = useState<OpsRow[]>([]);
  const [contentTasks, setContentTasks] = useState<OpsRow[]>([]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(interval);
  }, []);
  const [runReady, setRunReady] = useState(false),
    [runs, setRuns] = useState<OpsRow[]>([]);
  const [archiveFilter, setArchiveFilter] = useState("all");
  const saving = useRef(false);
  const [uncertainSave, setUncertainSave] = useState(false);
  const load = useCallback(async () => {
    setReady(false);
    setLoading(true);
    try {
      const r = await request("GET");
      setData(r.data);
      onCalendarData?.(r.data);
      setCalendarRecurrence(r.calendarRecurrence === true);
      setRecurrenceArchive(r.recurrenceArchive === true);
      setPersonalContent(r.personalContent === true);
      setContentHistory(r.contentHistory === true);
      setVersions(r.versions || []);
      setContentTasks(r.contentTasks || []);
      if (resource === "recurrence") {
        const response = await fetch("/api/workflow?workspace=PERSONAL", {
          cache: "no-store",
        });
        const workflow = await response.json();
        setRunReady(response.ok && workflow.ready === true);
        setRuns(workflow.data?.runs || []);
      }
      setReady(true);
      if (r.truncated.length)
        setError("조회 제한 1,000건 초과. 전체 데이터가 아닙니다.");
      else setError("");
      return true;
    } catch (e) {
      setData({});
      onCalendarData?.({});
      setError(e instanceof Error ? e.message : "조회 실패");
      return false;
    } finally {
      setLoading(false);
    }
  }, [onCalendarData, resource]);
  useEffect(() => {
    let mounted = true;
    if (enabled)
      queueMicrotask(() => {
        if (mounted) void load();
      });
    return () => {
      mounted = false;
    };
  }, [enabled, load]);
  useEffect(() => {
    const refresh = (event: Event) => {
      if (
        enabled &&
        !saving.current &&
        !document.querySelector("dialog[open]")
      ) {
        const promise = load();
        (
          event as CustomEvent<{ waits?: Promise<boolean>[] }>
        )?.detail?.waits?.push(promise);
        void promise;
      }
    };
    window.addEventListener("myops:refresh", refresh);
    return () => window.removeEventListener("myops:refresh", refresh);
  }, [enabled, load]);
  async function save(body: unknown, method = "POST") {
    if (saving.current || uncertainSave) return;
    saving.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await request(method, body);
      setEditor(null);
      setRemoval(null);
      const loaded = await load();
      setNotice(
        loaded
          ? "서버 저장 및 DB 재조회가 확인되었습니다."
          : "서버 저장은 확인됐으나 재조회에 실패했습니다.",
      );
    } catch (e) {
      const uncertain = e instanceof TypeError || e instanceof SyntaxError;
      if (uncertain) setUncertainSave(true);
      setError(
        uncertain
          ? "저장 응답을 확인하지 못했습니다. 중복 생성을 막기 위해 재전송을 중지했습니다. 입력을 보존한 채 연결을 확인하고, 닫은 뒤 목록을 재조회하여 저장 여부를 먼저 확인해 주세요."
          : e instanceof Error
            ? e.message
            : "저장 실패",
      );
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  const values = enabled ? data[resource] || [] : [];
  const editValue =
    resource === "recurrence" && scope === "all" && editor?.rule_id
      ? values.find((r) => r.id === editor.rule_id) || editor
      : editor;
  const occurrencesTo = new Date(
    Date.parse(day + "T00:00:00Z") + 370 * 86400000,
  )
    .toISOString()
    .slice(0, 10);
  const from = calendarView === "month" ? `${day.slice(0, 7)}-01` : day;
  const list =
    resource === "recurrence"
      ? occurrences(values, data.exceptions || [], from, occurrencesTo).filter(
          (s) => scheduleOverlaps(s, day, calendarView),
        )
      : values;
  const canWrite = enabled && ready && !busy;
  const filtered = list.filter(
    (r) =>
      `${r.title} ${r.notes}`.toLowerCase().includes(query.toLowerCase()) &&
      (resource !== "inspiration" ||
        archiveFilter === "all" ||
        (archiveFilter === "inbox" ? r.inbox === true : r.favorite === true)),
  );
  const balance = values.reduce((sum, r) => sum + Number(r.amount), 0);
  async function recordRun(row: OpsRow, status: string) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/workflow?workspace=PERSONAL", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "run",
          id: row.rule_id || row.id,
          original_at: row.original_at,
          status,
        }),
      });
      const r = await response.json();
      if (!response.ok) throw new Error(r.error);
      if (await load())
        setNotice("실행 기록 저장 및 DB 재조회를 확인했습니다.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "실행 기록 저장 실패");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className={`ops-card${resource === "leave" ? " ops-leave-records" : ""}`}
    >
      <div className="ops-section-head">
        <div>
          <h2>{labels[resource]}</h2>
          <p>
            {resource === "leave"
              ? "PERSONAL 전용 · 업무 캘린더와 공유 보고서에 포함하지 않습니다."
              : resource === "recurrence"
                ? "일·주·월·연 반복 · 월·연은 추가 SQL 적용 후 사용"
                : "PERSONAL에서 직접 등록한 자료"}
          </p>
        </div>
        <button
          disabled={!canWrite}
          onClick={() => {
            setScope("all");
            setError("");
            setUncertainSave(false);
            setEditor({ id: "" });
          }}
        >
          {labels[resource]} 등록
        </button>
      </div>
      {!enabled ? <p>개인 로그인과 PERSONAL 선택이 필요합니다.</p> : null}
      {enabled && loading ? (
        <p role="status">운영 DB에서 불러오는 중…</p>
      ) : null}
      {enabled && !ready && !loading ? (
        <p>
          DB 연결 확인 필요 · 새 운영 기능은 003 SQL 적용 후 사용할 수 있습니다.
        </p>
      ) : null}
      {error ? (
        <p className="ops-alert bad" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? <p role="status">{notice}</p> : null}
      <div className="ops-resource-toolbar">
        <button disabled={!enabled || busy} onClick={() => load()}>
          운영 DB 새로고침
        </button>
        <input
          aria-label={`${labels[resource]} 검색`}
          placeholder="제목·메모 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {resource === "leave" && ready ? (
        <p>
          확인된 발생{" "}
          {values
            .filter((r) => r.kind === "grant")
            .reduce((a, r) => a + Number(r.amount), 0)}
          일 · 사용{" "}
          {Math.abs(
            values
              .filter((r) => r.kind === "use")
              .reduce((a, r) => a + Number(r.amount), 0),
          )}
          일 · 잔여 {balance}일
        </p>
      ) : null}
      {resource === "inspiration" ? (
        <label>
          보관 필터
          <select
            value={archiveFilter}
            onChange={(e) => setArchiveFilter(e.target.value)}
          >
            <option value="all">전체</option>
            <option value="inbox">Inbox</option>
            <option value="favorite">즐겨찾기</option>
          </select>
        </label>
      ) : null}
      {resource === "content" && ready ? (
        <p>
          Trend Radar 소재 후보:{" "}
          {values.filter((r) => r.stage === "idea").length}개 · 직접 등록한
          아이디어만 집계합니다. 외부 트렌드 수집·자동 업로드는 미연결입니다.
        </p>
      ) : null}
      {filtered.slice(0, 300).map((r) =>
        resource === "recurrence" ? (
          <RecurringScheduleRow
            key={r.id}
            row={r}
            start={local(r.starts_at).replace("T", " ")}
            end={local(r.ends_at).replace("T", " ")}
            status={recurrenceStatus(
              r,
              runs.find(
                (run) =>
                  run.rule_id === r.rule_id &&
                  Date.parse(String(run.original_at)) ===
                    Date.parse(String(r.original_at)),
              ),
              now,
            )}
            states={runStates}
            disabled={!canWrite}
            statusDisabled={!canWrite || !runReady}
            onStatus={(value) => void recordRun(r, value)}
            onEdit={() => {
              setError("");
              setScope("one");
              setUncertainSave(false);
              setEditor(r);
            }}
            onRemove={() => {
              setError("");
              setScope("one");
              setRemoval(r);
            }}
          />
        ) : (
          <div className="ops-note" key={r.id}>
            <strong>{String(r.title)}</strong>
            <p>{String(r.notes || "")}</p>
            {resource === "content" ? (
              <p>
                {
                  fields.content
                    .find((f) => f.key === "stage")
                    ?.choices?.find(([k]) => k === r.stage)?.[1]
                }{" "}
                · {String(r.channel || "채널 미지정")} · 승인{" "}
                {
                  fields.content
                    .find((f) => f.key === "approval")
                    ?.choices?.find(([key]) => key === r.approval)?.[1]
                }{" "}
                ·{" "}
                {r.publish_at
                  ? local(r.publish_at).replace("T", " ")
                  : "발행일 없음"}
              </p>
            ) : null}
            {resource === "content" ? (
              <details className="ops-record-disclosure">
                <summary>검수·수정·성과 버전 이력</summary>
                {contentHistory ? (
                  versions
                    .filter((v) => v.content_id === r.id)
                    .map((v) => {
                      const snapshot = v.snapshot as OpsRow,
                        details = snapshot.personal_details as
                          | Record<string, unknown>
                          | undefined;
                      return (
                        <div key={v.id}>
                          <strong>
                            버전 {String(v.version)} ·{" "}
                            {local(v.created_at).replace("T", " ")}
                          </strong>
                          <p>
                            {String(details?.step || snapshot.stage)} · 검수{" "}
                            {String(details?.review || snapshot.approval)} ·
                            담당 {String(details?.reviewer || "기록 없음")}
                          </p>
                          <p>
                            수정 사유:{" "}
                            {String(details?.change_reason || "기록 없음")}
                          </p>
                          <p>
                            검수 메모:{" "}
                            {String(details?.review_notes || "기록 없음")}
                          </p>
                          <p>
                            검수 날짜:{" "}
                            {details?.reviewed_at
                              ? local(details.reviewed_at).replace("T", " ")
                              : "기록 없음"}
                          </p>
                          {details?.metrics_at ? (
                            <p>
                              성과 기준{" "}
                              {local(details.metrics_at).replace("T", " ")} ·
                              조회수 {String(details.views ?? "미기록")} · 저장{" "}
                              {String(details.saves ?? "미기록")}
                            </p>
                          ) : null}
                        </div>
                      );
                    })
                ) : (
                  <p>
                    버전 원장은 SQL008 적용 후 보존합니다. 현재 저장된 상세는
                    그대로 유지합니다.
                  </p>
                )}
              </details>
            ) : null}
            {resource === "content" && r.personal_details ? (
              <>
                <button
                  disabled={!canWrite || !contentHistory}
                  onClick={() =>
                    void save({
                      action: "content_task",
                      id: r.id,
                      step: (r.personal_details as Record<string, unknown>)
                        .step,
                    })
                  }
                >
                  현재 제작 단계 업무 연결
                </button>
                {contentTasks
                  .filter((t) => t.content_id === r.id)
                  .map((t) => (
                    <button
                      key={t.id}
                      disabled={!onOpenTask || busy}
                      onClick={() => onOpenTask?.(String(t.task_id))}
                    >
                      {String(t.step)} 업무·시간 기록 열기
                    </button>
                  ))}
              </>
            ) : null}
            {resource === "inspiration" ? (
              <p>
                {String(r.category)} · {r.inbox ? "Inbox" : "보관"}{" "}
                {r.favorite ? "★" : ""}
              </p>
            ) : null}
            {resource === "leave" ? (
              <p>
                {String(r.date)} · {String(r.amount)}일
              </p>
            ) : null}
            {r.url || r.result_url ? (
              <a
                className="ops-link-action"
                href={String(r.url || r.result_url)}
                target="_blank"
                rel="noopener noreferrer"
              >
                원본 링크 열기
              </a>
            ) : null}
            <button
              disabled={!canWrite}
              onClick={() => {
                setError("");
                setScope("one");
                setUncertainSave(false);
                setEditor(r);
              }}
              aria-label={`${r.title} 수정`}
            >
              수정
            </button>
            <button
              className="ops-danger"
              disabled={!canWrite}
              onClick={() => {
                setError("");
                setScope("one");
                setRemoval(r);
              }}
              aria-label={`${r.title} 삭제`}
            >
              삭제
            </button>
          </div>
        ),
      )}
      {ready && !filtered.length ? (
        <p className="ops-empty-state">
          {list.length
            ? "검색·필터 결과가 없습니다."
            : "등록된 항목이 없습니다."}
        </p>
      ) : null}
      {list.length > 300 ? (
        <p>한 화면에 최대 300건 표시합니다. 검색으로 범위를 좁혀 주세요.</p>
      ) : null}
      {resource === "recurrence" ? (
        <details className="ops-note">
          <summary>반복 규칙 보관·복원</summary>
          <p>
            보관하면 캘린더에서 숨깁니다. 기존 회차와 수행 이력은 유지됩니다.
            복원하면 과거 미확인 회차도 다시 표시될 수 있습니다.
          </p>
          {!recurrenceArchive ? (
            <p>현재 연결에서는 반복 규칙 보관을 사용할 수 없습니다.</p>
          ) : null}
          {(data.recurrence || []).map((rule) => (
            <div className="ops-row-actions" key={rule.id}>
              <span>
                {String(rule.title)} · {rule.archived_at ? "보관됨" : "사용 중"}
              </span>
              <button
                type="button"
                disabled={!canWrite || !recurrenceArchive}
                aria-label={`${rule.title} 반복 규칙 ${rule.archived_at ? "복원" : "보관"}`}
                onClick={() =>
                  void save(
                    {
                      action: "recurrence_archive",
                      id: rule.id,
                      archived: !rule.archived_at,
                    },
                    "PATCH",
                  )
                }
              >
                {rule.archived_at ? "복원" : "보관"}
              </button>
            </div>
          ))}
        </details>
      ) : null}
      {resource === "recurrence" ? (
        <p className="ops-section-help">
          목록은 기준 날짜부터 최대 370일 범위이며 회차 계산은 최대
          10,000건입니다. 대량 기록의 전체 집계가 아닙니다.
        </p>
      ) : null}
      {resource === "recurrence" && ready ? (
        <>
          <p className="ops-section-help">
            {runReady
              ? "예정 시간이 지나도 실행 기록 없으면 실행 미확인입니다. 완료는 직접 확인해 기록하세요."
              : "실행 원장은 SQL007 적용 후 저장 가능합니다."}
          </p>
          <details>
            <summary>이전 미완료 실행 기록</summary>
            {runs
              .filter((r) => r.status !== "completed")
              .map((r) => (
                <div key={r.id}>
                  <strong>{String(r.title)}</strong>
                  <p>
                    {local(r.original_at).replace("T", " ")} ·{" "}
                    {runStates[r.status as keyof typeof runStates]}
                  </p>
                  <button
                    disabled={!canWrite || !runReady}
                    onClick={() => void recordRun(r, "completed")}
                  >
                    수동 완료 확인
                  </button>
                </div>
              ))}
            {!runs.some((r) => r.status !== "completed") ? (
              <p>
                저장된 미완료 실행 기록이 없습니다. 예정 회차 계산은 실행 기록이
                아닙니다.
              </p>
            ) : null}
          </details>
          <details>
            <summary>전체 실행 원장 (완료 포함)</summary>
            {runs.map((r) => (
              <div className="ops-note" key={r.id}>
                <strong>{String(r.title)}</strong>
                <p>
                  {local(r.original_at).replace("T", " ")} ·{" "}
                  {runStates[r.status as keyof typeof runStates]}
                </p>
                {r.notes ? <p>{String(r.notes)}</p> : null}
                {r.confirmed_at ? (
                  <small>
                    완료 확인: {local(r.confirmed_at).replace("T", " ")}
                  </small>
                ) : null}
              </div>
            ))}
            {!runs.length ? (
              <p>
                저장된 실행 기록이 없습니다. 예정 회차는 실행 기록과 구분합니다.
              </p>
            ) : null}
          </details>
        </>
      ) : null}
      {resource === "recurrence" && ready ? (
        <>
          <h3>콘텐츠 발행 예정</h3>
          {(data.content || [])
            .filter(
              (c) =>
                c.publish_at &&
                scheduleOverlaps(
                  {
                    ...c,
                    starts_at: c.publish_at,
                    ends_at: new Date(
                      Date.parse(String(c.publish_at)) + 60000,
                    ).toISOString(),
                  },
                  day,
                  calendarView,
                ),
            )
            .map((c) => (
              <p key={c.id}>
                {String(c.title)} · {local(c.publish_at).replace("T", " ")} ·{" "}
                {["published", "results"].includes(String(c.stage))
                  ? "수동 발행 기록"
                  : "예정"}
              </p>
            ))}
          <p>
            자동화 예정 시간은 실행기 미연결로 표시하지 않습니다. 연차는
            포함하지 않습니다.
          </p>
        </>
      ) : null}
      {editor ? (
        <OpsDialog
          title={`${labels[resource]} ${editor.id ? "수정" : "등록"}`}
          busy={busy}
          close={() => setEditor(null)}
        >
          <form
            key={scope}
            className={`ops-form${resource === "leave" ? " ops-leave-form" : ""}`}
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              if (
                resource === "content" &&
                personalContent &&
                (needsPersonalContentType(
                  f,
                  (
                    editor.personal_details as
                      | Record<string, unknown>
                      | undefined
                  )?.type,
                ) ||
                  (!f.get("personal:type") &&
                    !f.has("content:calendar_visible")))
              ) {
                setError(
                  "개인 콘텐츠 입력을 저장하려면 콘텐츠 유형을 선택해 주세요. 입력 내용은 유지됩니다.",
                );
                const typeField = e.currentTarget.elements.namedItem(
                  "personal:type",
                ) as HTMLSelectElement | null;
                typeField?.focus();
                return;
              }
              const value: Record<string, unknown> = Object.fromEntries(
                f.entries(),
              );
              for (const field of fields[resource]) {
                if (field.type === "checkbox")
                  value[field.key] = f.has(field.key);
                if (field.type === "datetime-local")
                  value[field.key] = value[field.key]
                    ? `${value[field.key]}:00+09:00`
                    : null;
              }
              if (
                resource === "content" &&
                personalContent &&
                f.get("personal:type")
              ) {
                const details = {
                  ...((editor.personal_details || {}) as Record<
                    string,
                    unknown
                  >),
                };
                for (const [key, input] of f.entries())
                  if (key.startsWith("personal:"))
                    details[key.slice(9)] = input;
                for (const key of [
                  "shoot_at",
                  "edit_at",
                  "published_at",
                  "reviewed_at",
                  "metrics_at",
                  "sponsor_due_at",
                ])
                  details[key] = details[key]
                    ? `${details[key]}:00+09:00`
                    : null;
                value.personal_details = details;
                details.calendar_hidden = !f.has("content:calendar_visible");
                details.sponsored = f.has("personal:sponsored");
                details.performance_checks = [24, 72, 168].filter((h) =>
                  f.has(`personal:check:${h}`),
                );
              }
              if (resource === "recurrence" && editor.id)
                void save({
                  action: "recurrence_change",
                  id: editor.rule_id || editor.id,
                  original_at: editor.original_at || editor.starts_at,
                  scope,
                  cancel: false,
                  value,
                });
              else
                void save(
                  { resource, id: editor.id, value },
                  editor.id ? "PATCH" : "POST",
                );
            }}
          >
            <label>
              제목
              <input
                name="title"
                required
                maxLength={120}
                defaultValue={String(editValue?.title || "")}
                disabled={busy}
              />
            </label>
            {resource !== "leave" ? (
              <label>
                메모
                <textarea
                  name="notes"
                  maxLength={2000}
                  defaultValue={String(editValue?.notes || "")}
                  disabled={busy}
                />
              </label>
            ) : null}
            {resource === "recurrence" && editor.id ? (
              <label>
                변경 범위
                <select
                  value={scope}
                  onChange={(e) => setScope(e.target.value)}
                  disabled={busy}
                >
                  <option value="one">이번 일정만</option>
                  <option value="future">이번 이후 일정</option>
                  <option value="all">전체 반복 일정</option>
                </select>
              </label>
            ) : null}
            {resource === "recurrence" && editor.id ? (
              <p>
                범위를 바꾸면 원본 값으로 입력창을 다시 채웁니다. 전체 변경은
                기존 예외를 초기화합니다. 이후 변경은 앞선 회차를 보존합니다.
              </p>
            ) : null}
            {fields[resource].map((field) => (
              <label key={field.key}>
                {field.label}
                {field.choices ? (
                  <select
                    name={field.key}
                    defaultValue={String(
                      editValue?.[field.key] || field.choices[0][0],
                    )}
                    disabled={busy}
                  >
                    {field.choices.map(([v, label]) => (
                      <option
                        key={v}
                        disabled={
                          resource === "recurrence" &&
                          field.key === "frequency" &&
                          ["monthly", "yearly"].includes(v) &&
                          !calendarRecurrence
                        }
                        value={v}
                      >
                        {label}
                      </option>
                    ))}
                  </select>
                ) : field.type === "checkbox" ? (
                  <input
                    name={field.key}
                    type="checkbox"
                    defaultChecked={
                      field.key === "inbox"
                        ? editValue?.[field.key] !== false
                        : editValue?.[field.key] === true
                    }
                    disabled={busy}
                  />
                ) : (
                  <input
                    name={field.key}
                    type={field.type || "text"}
                    step={field.key === "amount" ? "0.5" : undefined}
                    required={resource === "recurrence" || resource === "leave"}
                    defaultValue={
                      field.type === "datetime-local"
                        ? local(editValue?.[field.key]) ||
                          (resource === "content"
                            ? ""
                            : `${day}T${field.key === "ends_at" ? "10" : "09"}:00`)
                        : String(
                            editValue?.[field.key] ||
                              field.initial ||
                              (field.type === "date" ? day : ""),
                          )
                    }
                    disabled={busy}
                  />
                )}
              </label>
            ))}
            {resource === "content" ? (
              <fieldset disabled={busy || !personalContent}>
                <legend>PERSONAL 인스타그램 콘텐츠</legend>
                {error ? <p role="alert">{error}</p> : null}
                <label>
                  <input
                    type="checkbox"
                    name="content:calendar_visible"
                    defaultChecked={
                      (
                        editor.personal_details as
                          | Record<string, unknown>
                          | undefined
                      )?.calendar_hidden !== true
                    }
                  />
                  캘린더에 표시
                </label>
                <small>
                  표시를 끄면 촬영·편집·발행·성과 점검 일정을 숨깁니다. 원고와
                  발행 이력은 보존됩니다.
                </small>
                <PersonalChecklist
                  value={String(
                    (
                      editor.personal_details as
                        | Record<string, unknown>
                        | undefined
                    )?.checklist || "",
                  )}
                />
                <label>
                  <input
                    type="checkbox"
                    name="personal:sponsored"
                    defaultChecked={
                      (
                        editor.personal_details as
                          | Record<string, unknown>
                          | undefined
                      )?.sponsored === true
                    }
                  />
                  협찬 콘텐츠
                </label>
                <label>
                  협찬 제출 기한 (서울 시간)
                  <input
                    type="datetime-local"
                    name="personal:sponsor_due_at"
                    defaultValue={local(
                      (
                        editor.personal_details as
                          | Record<string, unknown>
                          | undefined
                      )?.sponsor_due_at,
                    )}
                  />
                </label>
                {!personalContent ? (
                  <p>
                    추가 SQL 006 적용 전입니다. 기존 콘텐츠 등록은 계속 사용할
                    수 있습니다.
                  </p>
                ) : null}
                {(
                  [
                    [
                      "type",
                      "콘텐츠 유형",
                      [
                        ["", "기존 콘텐츠 (개인 확장 사용 안 함)"],
                        ["reel", "메이크업 릴스"],
                        ["selfie", "셀카·완성컷"],
                        ["carousel", "발색·제품 비교 캐러셀"],
                        ["review", "뷰티 제품 리뷰"],
                        ["sponsored", "협찬 콘텐츠"],
                      ],
                    ],
                    [
                      "step",
                      "개인 제작 단계",
                      [
                        ["idea", "아이디어"],
                        ["planning", "기획"],
                        ["shooting", "촬영"],
                        ["editing", "편집"],
                        ["review", "검수"],
                        ["revision", "수정 요청"],
                        ["scheduled", "발행 예정"],
                        ["published", "발행 완료"],
                        ["results", "성과 확인"],
                      ],
                    ],
                    [
                      "review",
                      "개인 검수 상태",
                      [
                        ["none", "해당 없음"],
                        ["pending", "검수 대기"],
                        ["revision", "수정 요청"],
                        ["approved", "승인"],
                      ],
                    ],
                  ] as [string, string, [string, string][]][]
                ).map(([key, label, choices]) => (
                  <label key={key}>
                    {label}
                    <select
                      name={`personal:${key}`}
                      defaultValue={String(
                        (
                          editor.personal_details as
                            | Record<string, unknown>
                            | undefined
                        )?.[key] ?? choices[0][0],
                      )}
                    >
                      {choices.map(([v, name]) => (
                        <option key={v} value={v}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
                {[
                  ["products", "사용 제품", "text"],
                  ["reference_url", "레퍼런스 URL", "url"],
                  ["shoot_at", "촬영 예정 (서울 시간)", "datetime-local"],
                  ["edit_at", "편집 예정 (서울 시간)", "datetime-local"],
                  [
                    "published_at",
                    "실제 발행 시각 (서울 시간)",
                    "datetime-local",
                  ],
                  ["review_notes", "검수 메모", "text"],
                  ["change_reason", "수정 사유", "text"],
                  ["reviewer", "승인 담당자", "text"],
                  ["reviewed_at", "검수 시각 (서울 시간)", "datetime-local"],
                  ["sponsor_disclosure", "협찬 표기 확인 메모", "text"],
                  ["outcome", "결과 및 성과 메모", "text"],
                  [
                    "metrics_at",
                    "성과 기록 기준 시각 (서울 시간)",
                    "datetime-local",
                  ],
                  ...metricKeys.map((key, i) => [
                    key,
                    [
                      "조회수",
                      "도달",
                      "좋아요",
                      "댓글",
                      "공유",
                      "저장",
                      "프로필 방문",
                      "팔로워 변화",
                    ][i],
                    "number",
                  ]),
                ].map(([key, label, type]) => {
                  const value = (
                    editor.personal_details as
                      | Record<string, unknown>
                      | undefined
                  )?.[key];
                  return (
                    <label key={key}>
                      {label}
                      <input
                        name={`personal:${key}`}
                        type={type}
                        maxLength={2000}
                        step={type === "number" ? "1" : undefined}
                        defaultValue={
                          type === "datetime-local"
                            ? local(value)
                            : String(value ?? "")
                        }
                      />
                    </label>
                  );
                })}
                <p>
                  성과는 수동 기록입니다. 단계별 업무·버전 이력은 SQL008 적용 후
                  연결합니다.
                </p>
                <p>
                  성과 점검 일정은 선택한 경우에만 실제 발행 시각을 기준으로
                  Calendar에 표시합니다. 외부 실행·알림·자동 업로드는 하지
                  않습니다.
                </p>
                {[24, 72, 168].map((h) => (
                  <label key={h}>
                    <input
                      type="checkbox"
                      name={`personal:check:${h}`}
                      defaultChecked={(
                        (
                          editor.personal_details as
                            | Record<string, unknown>
                            | undefined
                        )?.performance_checks as number[] | undefined
                      )?.includes(h)}
                    />
                    {h === 168 ? "7일" : `${h}시간`} 성과 점검 일정
                  </label>
                ))}
              </fieldset>
            ) : null}
            {resource === "content" ? (
              <label>
                프로젝트
                <select
                  name="project_id"
                  defaultValue={String(editor.project_id || "")}
                  disabled={busy}
                >
                  <option value="">연결 없음</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {String(p.title)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {error ? <p role="alert">{error}</p> : null}
            <OpsFormActions busy={busy}>
              <button className="ops-primary" disabled={busy || uncertainSave}>
                저장
              </button>
            </OpsFormActions>
          </form>
        </OpsDialog>
      ) : null}
      {removal ? (
        <OpsDialog
          title="운영 항목 삭제 확인"
          busy={busy}
          close={() => setRemoval(null)}
        >
          <p>{String(removal.title)}</p>
          {resource === "recurrence" ? (
            <label>
              삭제 범위
              <select value={scope} onChange={(e) => setScope(e.target.value)}>
                <option value="one">이번 일정만</option>
                <option value="future">이번 이후 일정</option>
                <option value="all">전체 반복 일정</option>
              </select>
            </label>
          ) : null}
          {error ? <p role="alert">{error}</p> : null}
          <OpsFormActions busy={busy}>
            <button
              className="ops-danger"
              disabled={busy}
              onClick={() =>
                resource === "recurrence"
                  ? save({
                      action: "recurrence_change",
                      id: removal.rule_id,
                      original_at: removal.original_at,
                      scope,
                      cancel: true,
                    })
                  : save({ resource, id: removal.id }, "DELETE")
              }
            >
              삭제
            </button>
          </OpsFormActions>
        </OpsDialog>
      ) : null}
    </section>
  );
}
function PersonalChecklist({ value }: { value: string }) {
  const [text, setText] = useState(value);
  return (
    <>
      <div className="ops-actions">
        {Object.entries(personalTemplates).map(([type, body], i) => (
          <button
            type="button"
            key={type}
            onClick={(e) => {
              setText(body);
              const typeField = e.currentTarget.form?.elements.namedItem(
                "personal:type",
              ) as HTMLSelectElement | null;
              if (typeField) {
                typeField.value = type;
              }
            }}
          >
            {["릴스", "셀카", "캐러셀", "리뷰", "협찬"][i]} 체크리스트 불러오기
          </button>
        ))}
      </div>
      <label>
        수정 가능한 제작 체크리스트
        <textarea
          name="personal:checklist"
          maxLength={2000}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <p>체크리스트를 불러와도 일정은 자동 확정하지 않습니다.</p>
    </>
  );
}
