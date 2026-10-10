"use client";
import { useCallback, useEffect, useState } from "react";
import { OpsDialog } from "./ops-dialog";
import { occurrences, type Phase2Resource } from "@/lib/phase2";
import { scheduleOverlaps, type OpsData, type OpsRow } from "@/lib/ops";
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
    cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await res.json();
  if (!res.ok) throw new Error(result.error || "요청 실패");
  return result;
}
export function Phase2Panel({
  resource,
  enabled,
  projects,
  day,
  calendarView = "month",
  onCalendarData,
}: {
  resource: Exclude<Phase2Resource, "exceptions">;
  enabled: boolean;
  projects: OpsRow[];
  day: string;
  calendarView?: string;
  onCalendarData?: (data: OpsData) => void;
}) {
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
  const [calendarRecurrence, setCalendarRecurrence] = useState(false);
  const [archiveFilter, setArchiveFilter] = useState("all");
  const load = useCallback(async () => {
    setReady(false);
    setLoading(true);
    try {
      const r = await request("GET");
      setData(r.data);
      onCalendarData?.(r.data);
      setCalendarRecurrence(r.calendarRecurrence === true);
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
  }, [onCalendarData]);
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
  async function save(body: unknown, method = "POST") {
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
      setError(e instanceof Error ? e.message : "저장 실패");
    } finally {
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
  return (
    <section className="ops-card">
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
      <button disabled={!enabled || busy} onClick={() => load()}>
        운영 DB 새로고침
      </button>
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
      <input
        aria-label={`${labels[resource]} 검색`}
        placeholder="제목·메모 검색"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
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
      {filtered.slice(0, 300).map((r) => (
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
          {resource === "recurrence" ? (
            <p>
              {local(r.starts_at).replace("T", " ")} ~{" "}
              {local(r.ends_at).replace("T", " ")}
            </p>
          ) : null}
          {r.url || r.result_url ? (
            <a
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
              setEditor(r);
            }}
            aria-label={`${r.title} 수정`}
          >
            수정
          </button>
          <button
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
      ))}
      {ready && !filtered.length ? (
        <p>
          {list.length
            ? "검색·필터 결과가 없습니다."
            : "등록된 항목이 없습니다."}
        </p>
      ) : null}
      {list.length > 300 ? (
        <p>한 화면에 최대 300건 표시합니다. 검색으로 범위를 좁혀 주세요.</p>
      ) : null}
      {resource === "recurrence" ? (
        <p>
          목록은 기준 날짜부터 최대 370일 범위이며 회차 계산은 최대
          10,000건입니다. 대량 기록의 전체 집계가 아닙니다.
        </p>
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
            className="ops-form"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
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
                      <option key={v} disabled={resource === "recurrence" && field.key === "frequency" && ["monthly", "yearly"].includes(v) && !calendarRecurrence} value={v}>
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
            <button disabled={busy}>저장</button>
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
          <button
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
        </OpsDialog>
      ) : null}
    </section>
  );
}
