"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  Archive,
  ArrowUpRight,
  RefreshCw,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import type {
  PersonalRecord,
  PersonalRecordKind,
} from "@/lib/personal-records";
import { seoulDate } from "@/lib/ops";
import { OpsDialog } from "./ops-dialog";
import "./personal-records-panel.css";

type RecordList = {
  ready: boolean;
  items: PersonalRecord[];
  archived: PersonalRecord[];
  truncated: boolean;
  archivedTruncated: boolean;
};
type RecordDraft = Pick<PersonalRecord, "body" | "kind" | "entry_date">;
type EditingRecord = RecordDraft & { id: string; expectedUpdatedAt: string };
const kinds: { id: PersonalRecordKind; label: string; emoji: string }[] = [
  { id: "note", label: "기록", emoji: "📝" },
  { id: "idea", label: "아이디어", emoji: "💡" },
  { id: "todo", label: "할 일", emoji: "☑️" },
];
const recordTitle = (body: string) =>
  body
    .split("\n")
    .find((line) => line.trim())
    ?.slice(0, 60) || "기록";
const orderRecords = (a: PersonalRecord, b: PersonalRecord) =>
  b.entry_date.localeCompare(a.entry_date) ||
  b.created_at.localeCompare(a.created_at) ||
  b.id.localeCompare(a.id);

class RecordRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(
  method: string,
  signal: AbortSignal,
  body?: unknown,
): Promise<T> {
  const response = await fetch("/api/personal-records", {
    method,
    cache: "no-store",
    signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]),
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw new RecordRequestError(
      response.status === 401 || response.status === 403
        ? "PERSONAL에 다시 로그인해 주세요."
        : response.status === 503
          ? "기록 저장소 연결을 준비 중이에요. 잠시 후 새로고침해 주세요."
          : response.status === 409
            ? "다른 화면에서 기록이 변경됐어요. 최신 내용과 내 입력을 확인해 주세요."
            : typeof result?.error === "string"
              ? result.error
              : "기록을 처리하지 못했어요. 다시 시도해 주세요.",
      response.status,
    );
  }
  if (!result || typeof result !== "object")
    throw new Error("Invalid record response");
  return result as T;
}

export function PersonalRecordsPanel({
  enabled,
  compact = false,
  ideasOnly = false,
  onOpenAll,
  onUseRecord,
}: {
  enabled: boolean;
  compact?: boolean;
  ideasOnly?: boolean;
  onOpenAll?: () => void;
  onUseRecord?: (record: PersonalRecord) => void;
}) {
  const headingId = useId();
  const [items, setItems] = useState<PersonalRecord[]>([]);
  const [archived, setArchived] = useState<PersonalRecord[]>([]);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<RecordDraft>(() => ({
    body: "",
    kind: ideasOnly ? "idea" : "note",
    entry_date: seoulDate(),
  }));
  const [editing, setEditing] = useState<EditingRecord | null>(null);
  const [filter, setFilter] = useState<"all" | PersonalRecordKind>("all");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [truncated, setTruncated] = useState(false);
  const [archivedTruncated, setArchivedTruncated] = useState(false);
  const lifecycle = useRef(0);
  const reads = useRef(0);
  const busyRef = useRef(false);
  const enabledRef = useRef(enabled);
  const readController = useRef<AbortController | null>(null);
  const writeController = useRef<AbortController | null>(null);
  const pendingCreate = useRef<{ id: string; draft: RecordDraft } | null>(null);
  const createResolution = useRef<"saved" | "changed" | null>(null);
  const [retryCreate, setRetryCreate] = useState(false);

  const refresh = useCallback(async (): Promise<boolean> => {
    if (!enabledRef.current || busyRef.current) return true;
    const epoch = lifecycle.current;
    const read = ++reads.current;
    readController.current?.abort();
    const controller = new AbortController();
    readController.current = controller;
    setLoading(true);
    try {
      const result = await request<RecordList>("GET", controller.signal);
      if (
        controller.signal.aborted ||
        epoch !== lifecycle.current ||
        read !== reads.current
      )
        return false;
      if (
        !result.ready ||
        !Array.isArray(result.items) ||
        !Array.isArray(result.archived)
      )
        throw new Error("Invalid record list");
      setItems([...result.items].sort(orderRecords));
      setArchived(result.archived);
      setTruncated(Boolean(result.truncated));
      setArchivedTruncated(Boolean(result.archivedTruncated));
      setReady(true);
      setError("");
      const pending = pendingCreate.current;
      const previousSave = pending
        ? [...result.items, ...result.archived].find(
            (record) => record.id === pending.id,
          )
        : undefined;
      if (pending && previousSave) {
        pendingCreate.current = null;
        setRetryCreate(false);
        if (
          previousSave.body === pending.draft.body &&
          previousSave.kind === pending.draft.kind &&
          previousSave.entry_date === pending.draft.entry_date
        ) {
          createResolution.current = "saved";
          setDraft((current) =>
            current.body.trim() === pending.draft.body &&
            current.kind === pending.draft.kind &&
            current.entry_date === pending.draft.entry_date
              ? { ...current, body: "" }
              : current,
          );
          setStatus(
            previousSave.archived_at
              ? "앞서 저장한 기록이 보관함에 있어요."
              : "앞서 저장한 기록을 확인했어요.",
          );
        } else {
          createResolution.current = "changed";
          setError(
            "앞서 요청한 기록의 저장 내용이 달라졌어요. 목록과 보관함을 확인해 주세요. 내 입력은 유지돼요.",
          );
        }
      }
      return true;
    } catch (failure) {
      if (
        controller.signal.aborted ||
        epoch !== lifecycle.current ||
        read !== reads.current
      )
        return false;
      setReady(false);
      if (
        failure instanceof RecordRequestError &&
        [401, 403].includes(failure.status)
      ) {
        setItems([]);
        setArchived([]);
      }
      setError(
        failure instanceof RecordRequestError
          ? failure.message
          : "기록을 불러오지 못했어요. 새로고침해 주세요.",
      );
      return false;
    } finally {
      if (epoch === lifecycle.current && read === reads.current)
        setLoading(false);
    }
  }, []);

  useEffect(() => {
    enabledRef.current = enabled;
    const epoch = ++lifecycle.current;
    busyRef.current = false;
    readController.current?.abort();
    writeController.current?.abort();
    queueMicrotask(() => {
      if (epoch !== lifecycle.current) return;
      setItems([]);
      setArchived([]);
      setReady(false);
      setLoading(false);
      setBusy(false);
      setError("");
      setStatus("");
      if (!enabled) {
        setDraft({
          body: "",
          kind: ideasOnly ? "idea" : "note",
          entry_date: seoulDate(),
        });
        setEditing(null);
        pendingCreate.current = null;
        setRetryCreate(false);
      } else void refresh();
    });
    const appRefresh = (event: Event) => {
      const promise = refresh();
      (
        event as CustomEvent<{ waits?: Promise<boolean>[] }>
      ).detail?.waits?.push(promise);
      void promise;
    };
    const recordsRefresh = (event: Event) => {
      if (
        (event as CustomEvent<{ source?: string }>).detail?.source !== headingId
      )
        void refresh();
    };
    window.addEventListener("myops:refresh", appRefresh);
    window.addEventListener("myops:personal-records-changed", recordsRefresh);
    return () => {
      lifecycle.current += 1;
      readController.current?.abort();
      writeController.current?.abort();
      window.removeEventListener("myops:refresh", appRefresh);
      window.removeEventListener(
        "myops:personal-records-changed",
        recordsRefresh,
      );
    };
  }, [enabled, headingId, ideasOnly, refresh]);

  async function write(
    method: "POST" | "PATCH",
    values: unknown,
    message: string,
  ) {
    if (!enabledRef.current || !ready || busyRef.current) return false;
    const epoch = lifecycle.current;
    busyRef.current = true;
    reads.current += 1;
    readController.current?.abort();
    const controller = new AbortController();
    writeController.current = controller;
    setBusy(true);
    setLoading(false);
    setError("");
    setStatus("");
    let conflict = false;
    let saved = false;
    try {
      const result = await request<{ item: PersonalRecord }>(
        method,
        controller.signal,
        values,
      );
      if (controller.signal.aborted || epoch !== lifecycle.current)
        return false;
      const record = result.item;
      if (
        !record?.id ||
        typeof record.body !== "string" ||
        typeof record.updated_at !== "string"
      )
        throw new Error("Invalid saved record");
      setItems((previous) =>
        [
          ...previous.filter((item) => item.id !== record.id),
          ...(record.archived_at ? [] : [record]),
        ].sort(orderRecords),
      );
      setArchived((previous) =>
        [
          ...previous.filter((item) => item.id !== record.id),
          ...(record.archived_at ? [record] : []),
        ].sort((a, b) =>
          (b.archived_at || "").localeCompare(a.archived_at || ""),
        ),
      );
      setStatus(message);
      saved = true;
      window.dispatchEvent(
        new CustomEvent("myops:personal-records-changed", {
          detail: { source: headingId },
        }),
      );
    } catch (failure) {
      if (controller.signal.aborted || epoch !== lifecycle.current)
        return false;
      conflict =
        failure instanceof RecordRequestError && failure.status === 409;
      if (
        method === "POST" &&
        failure instanceof RecordRequestError &&
        [400, 401, 403, 404, 413, 422].includes(failure.status)
      ) {
        pendingCreate.current = null;
        setRetryCreate(false);
      }
      if (
        failure instanceof RecordRequestError &&
        [401, 403, 503].includes(failure.status)
      ) {
        setReady(false);
        if ([401, 403].includes(failure.status)) {
          setItems([]);
          setArchived([]);
        }
      }
      setError(
        failure instanceof RecordRequestError
          ? failure.message
          : "저장 여부를 확인하지 못했어요. 새로고침으로 확인하거나 다시 저장해 주세요. 입력은 유지돼요.",
      );
    } finally {
      if (epoch === lifecycle.current) {
        busyRef.current = false;
        setBusy(false);
      }
    }
    if (conflict && epoch === lifecycle.current) {
      await refresh();
      if (epoch === lifecycle.current) {
        if (method === "POST") {
          pendingCreate.current = null;
          setRetryCreate(false);
          if (createResolution.current !== "saved")
            setError(
              "앞선 기록과 저장 충돌이 있었어요. 목록과 보관함을 확인한 뒤 필요한 내용을 새로 저장해 주세요.",
            );
        } else {
          setError("기록이 변경됐어요. 최신 내용과 내 입력을 확인해 주세요.");
        }
      }
    }
    return saved;
  }

  async function create() {
    const next = { ...draft, body: draft.body.trim() };
    if (!next.body || !next.entry_date || !canWrite) return;
    const pending = pendingCreate.current || {
      id: crypto.randomUUID(),
      draft: next,
    };
    createResolution.current = null;
    pendingCreate.current = pending;
    if (
      await write(
        "POST",
        { id: pending.id, ...pending.draft },
        "기록을 저장했어요.",
      )
    ) {
      pendingCreate.current = null;
      setRetryCreate(false);
      setDraft((current) => ({ ...current, body: "" }));
    } else if (pendingCreate.current) setRetryCreate(true);
  }

  async function change(
    record: PersonalRecord,
    values: Record<string, unknown>,
    message: string,
  ) {
    return write(
      "PATCH",
      { id: record.id, expectedUpdatedAt: record.updated_at, ...values },
      message,
    );
  }

  const canWrite = enabled && ready && !busy;
  const normalizedQuery = query.trim().toLocaleLowerCase("ko-KR");
  const scopedItems = ideasOnly
    ? items.filter((record) => record.kind === "idea")
    : items;
  const scopedArchive = ideasOnly
    ? archived.filter((record) => record.kind === "idea")
    : archived;
  const matching = scopedItems.filter(
    (record) =>
      (filter === "all" || record.kind === filter) &&
      (!normalizedQuery ||
        record.body.toLocaleLowerCase("ko-KR").includes(normalizedQuery)),
  );
  const recent = compact
    ? [
        ...new Map(
          [
            ...scopedItems
              .filter((record) => record.kind === "todo" && !record.done)
              .slice(0, 2),
            ...scopedItems,
          ].map((record) => [record.id, record]),
        ).values(),
      ].slice(0, 4)
    : matching;
  const currentEditing = editing
    ? [...items, ...archived].find((record) => record.id === editing.id)
    : undefined;
  const editingConflict = Boolean(
    editing &&
      currentEditing &&
      editing.expectedUpdatedAt !== currentEditing.updated_at,
  );
  const editingUnavailable = Boolean(
    editing && (!currentEditing || currentEditing.archived_at),
  );

  function row(record: PersonalRecord, isArchived = false) {
    const kind = kinds.find((item) => item.id === record.kind)!;
    return (
      <li
        className={`ops-personal-record ${record.done ? "is-done" : ""}`}
        key={record.id}
      >
        <div className="ops-personal-record-top">
          <span className={`ops-personal-record-kind is-${record.kind}`}>
            {kind.emoji} {kind.label}
          </span>
          <time dateTime={record.entry_date}>
            {record.entry_date.replaceAll("-", ".")}
          </time>
        </div>
        <div className="ops-personal-record-main">
          {record.kind === "todo" && !isArchived ? (
            <input
              type="checkbox"
              checked={record.done}
              disabled={!canWrite}
              aria-label={`${record.done ? "완료 취소" : "완료하기"}: ${recordTitle(record.body)}`}
              onChange={() =>
                void change(
                  record,
                  { done: !record.done },
                  record.done ? "다시 할 일로 옮겼어요." : "완료했어요.",
                )
              }
            />
          ) : null}
          {isArchived ? (
            <p className="ops-personal-record-body">{record.body}</p>
          ) : (
            <button
              type="button"
              className="ops-personal-record-body"
              disabled={!enabled || busy}
              aria-label={`기록 열기: ${recordTitle(record.body)}`}
              onClick={() => {
                setEditing({
                  id: record.id,
                  body: record.body,
                  kind: record.kind,
                  entry_date: record.entry_date,
                  expectedUpdatedAt: record.updated_at,
                });
                setError("");
              }}
            >
              {record.body}
            </button>
          )}
        </div>
        <div className="ops-personal-record-actions">
          {!isArchived && onUseRecord ? (
            <button
              type="button"
              disabled={!enabled || busy}
              onClick={() => onUseRecord(record)}
            >
              <Sparkles size={13} aria-hidden="true" />
              소재로 쓰기
            </button>
          ) : null}
          <button
            type="button"
            disabled={!canWrite}
            aria-label={`${isArchived ? "기록 복원" : "기록 보관"}: ${recordTitle(record.body)}`}
            onClick={() =>
              void change(
                record,
                { action: isArchived ? "restore" : "archive" },
                isArchived ? "기록을 복원했어요." : "보관함으로 옮겼어요.",
              )
            }
          >
            {isArchived ? (
              <RotateCcw size={13} aria-hidden="true" />
            ) : (
              <Archive size={13} aria-hidden="true" />
            )}
            {isArchived ? "복원" : "보관"}
          </button>
        </div>
      </li>
    );
  }

  return (
    <section
      className={`ops-card ops-personal-records${compact ? " is-compact" : ""}`}
      aria-labelledby={headingId}
    >
      <header className="ops-personal-records-heading">
        <div>
          <span className="ops-personal-records-chip" aria-hidden="true">
            {ideasOnly ? "💡" : "📝"}
          </span>
          <h2 id={headingId}>
            {ideasOnly ? "소재 노트" : compact ? "오늘의 한 줄" : "나의 기록"}
          </h2>
          <p>
            {ideasOnly
              ? "만들고 싶은 이야기부터 짧게 적어두세요."
              : compact
                ? "할 일도, 떠오른 생각도 가볍게."
                : "일상과 아이디어를 모아두는 나만의 노트."}
          </p>
        </div>
        <button
          type="button"
          aria-label="기록 새로고침"
          title="기록 새로고침"
          disabled={!enabled || loading || busy}
          onClick={() => void refresh()}
        >
          <RefreshCw size={16} aria-hidden="true" />
        </button>
      </header>
      <form
        className="ops-personal-records-compose"
        onSubmit={(event) => {
          event.preventDefault();
          void create();
        }}
      >
        {!ideasOnly ? (
          <fieldset
            disabled={!enabled || busy || retryCreate}
            className="ops-personal-records-kind-picker"
          >
            <legend className="sr-only">새 기록 종류</legend>
            {kinds.map((kind) => (
              <label
                key={kind.id}
                className={draft.kind === kind.id ? "is-selected" : ""}
              >
                <input
                  type="radio"
                  name={`${headingId}-kind`}
                  value={kind.id}
                  checked={draft.kind === kind.id}
                  onChange={() => setDraft({ ...draft, kind: kind.id })}
                />
                <span>
                  {kind.emoji} {kind.label}
                </span>
              </label>
            ))}
          </fieldset>
        ) : null}
        <textarea
          aria-label="새 기록 내용"
          placeholder={
            draft.kind === "todo"
              ? "오늘 챙길 작은 할 일"
              : draft.kind === "idea"
                ? "문득 떠오른 콘텐츠 아이디어"
                : "기억하고 싶은 오늘의 한 장면"
          }
          rows={compact ? 3 : 4}
          maxLength={6000}
          value={draft.body}
          disabled={!enabled || busy || retryCreate}
          onChange={(event) => setDraft({ ...draft, body: event.target.value })}
        />
        <div className="ops-personal-records-compose-bottom">
          <label>
            <span className="sr-only">새 기록 날짜</span>
            <input
              type="date"
              aria-label="새 기록 날짜"
              required
              value={draft.entry_date}
              disabled={!enabled || busy || retryCreate}
              onChange={(event) =>
                setDraft({ ...draft, entry_date: event.target.value })
              }
            />
          </label>
          <button
            type="submit"
            className="ops-personal-records-save"
            disabled={!canWrite || !draft.body.trim() || !draft.entry_date}
          >
            {busy
              ? "저장 중…"
              : retryCreate
                ? "같은 기록 다시 저장"
                : "기록 남기기"}
          </button>
        </div>
      </form>
      <div className="ops-personal-records-feedback" aria-live="polite">
        {!enabled ? <p>PERSONAL 로그인 후 기록을 남길 수 있어요.</p> : null}
        {loading ? <p>기록을 불러오는 중…</p> : null}
        {error ? (
          <p className="is-error" role="alert">
            {error}
          </p>
        ) : status ? (
          <p role="status">{status}</p>
        ) : null}
        {retryCreate ? (
          <p>
            앞선 저장을 확인하고 있어요. 새로고침하거나 같은 기록을 다시 저장해
            주세요.
          </p>
        ) : null}
      </div>
      {!compact && enabled ? (
        <div className="ops-personal-records-filter">
          <label>
            <span className="sr-only">기록 검색</span>
            <input
              type="search"
              placeholder="기록에서 찾기"
              aria-label="기록 검색"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          {!ideasOnly ? (
            <label>
              <span className="sr-only">기록 종류 필터</span>
              <select
                aria-label="기록 종류 필터"
                value={filter}
                onChange={(event) =>
                  setFilter(event.target.value as typeof filter)
                }
              >
                <option value="all">모든 기록</option>
                {kinds.map((kind) => (
                  <option key={kind.id} value={kind.id}>
                    {kind.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      ) : null}
      {enabled && scopedItems.length ? (
        <ul
          className="ops-personal-records-list"
          aria-label={
            ideasOnly
              ? "소재 노트 목록"
              : compact
                ? "최근 기록과 할 일"
                : "나의 기록 목록"
          }
        >
          {recent.map((record) => row(record))}
        </ul>
      ) : null}
      {enabled && ready && !recent.length ? (
        <p className="ops-personal-records-empty">
          {query || filter !== "all"
            ? "찾는 기록이 없어요."
            : "짧은 한 줄부터 남겨보세요."}
        </p>
      ) : null}
      {compact && onOpenAll ? (
        <button
          type="button"
          className="ops-personal-records-more"
          disabled={busy || Boolean(draft.body.trim()) || retryCreate}
          onClick={onOpenAll}
        >
          나의 기록 모두 보기 <ArrowUpRight size={14} aria-hidden="true" />
        </button>
      ) : null}
      {!compact && enabled ? (
        <details className="ops-personal-records-archive">
          <summary>
            보관함{" "}
            <span>
              {scopedArchive.length}
              {archivedTruncated ? "+" : ""}
            </span>
          </summary>
          {scopedArchive.length ? (
            <ul className="ops-personal-records-list" aria-label="보관한 기록">
              {scopedArchive.map((record) => row(record, true))}
            </ul>
          ) : (
            <p className="ops-personal-records-empty">보관한 기록이 없어요.</p>
          )}
          {archivedTruncated ? (
            <p className="ops-personal-records-limit">
              최근 보관한 100개 안에서 표시하고 있어요.
            </p>
          ) : null}
        </details>
      ) : null}
      {truncated ? (
        <p className="ops-personal-records-limit">
          최근 기록 300개 안에서 표시하고 검색해요.
        </p>
      ) : null}
      {editing ? (
        <OpsDialog title="나의 기록" busy={busy} close={() => setEditing(null)}>
          <form
            className="ops-personal-record-edit"
            onSubmit={async (event) => {
              event.preventDefault();
              if (
                !canWrite ||
                editingUnavailable ||
                editingConflict ||
                !editing.body.trim()
              )
                return;
              if (
                await write(
                  "PATCH",
                  { ...editing, body: editing.body.trim() },
                  "기록을 수정했어요.",
                )
              )
                setEditing(null);
            }}
          >
            <div className="ops-personal-record-edit-meta">
              <label>
                종류
                <select
                  aria-label="수정할 기록 종류"
                  value={editing.kind}
                  disabled={!enabled || busy}
                  onChange={(event) =>
                    setEditing({
                      ...editing,
                      kind: event.target.value as PersonalRecordKind,
                    })
                  }
                >
                  {kinds.map((kind) => (
                    <option key={kind.id} value={kind.id}>
                      {kind.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                날짜
                <input
                  type="date"
                  aria-label="수정할 기록 날짜"
                  required
                  value={editing.entry_date}
                  disabled={!enabled || busy}
                  onChange={(event) =>
                    setEditing({ ...editing, entry_date: event.target.value })
                  }
                />
              </label>
            </div>
            <label>
              내용
              <textarea
                aria-label="수정할 기록 내용"
                rows={8}
                maxLength={6000}
                value={editing.body}
                disabled={!enabled || busy}
                onChange={(event) =>
                  setEditing({ ...editing, body: event.target.value })
                }
              />
            </label>
            {error ? (
              <p role="alert" className="ops-personal-record-edit-error">
                {error}
              </p>
            ) : null}
            {editingUnavailable ? (
              <p role="alert">
                이 기록을 목록에서 확인할 수 없어요. 보관함이나 최신 기록을
                확인해 주세요. 입력한 내용은 유지돼요.
              </p>
            ) : null}
            {editingConflict && currentEditing ? (
              <div className="ops-personal-record-conflict">
                <strong>다른 화면에서 저장한 최신 기록</strong>
                <p>
                  {currentEditing.entry_date} ·{" "}
                  {kinds.find((kind) => kind.id === currentEditing.kind)?.label}
                </p>
                <p>{currentEditing.body}</p>
                <button
                  type="button"
                  disabled={!canWrite}
                  onClick={() => {
                    setEditing({
                      ...editing,
                      expectedUpdatedAt: currentEditing.updated_at,
                    });
                    setError("");
                  }}
                >
                  최신 기록을 확인했고 내 입력으로 수정하기
                </button>
              </div>
            ) : null}
            <div className="ops-form-actions">
              <button type="button" data-dialog-close disabled={busy}>
                닫기
              </button>
              <button
                type="submit"
                disabled={
                  !canWrite ||
                  editingUnavailable ||
                  editingConflict ||
                  !editing.body.trim() ||
                  !editing.entry_date
                }
              >
                수정 저장
              </button>
            </div>
          </form>
        </OpsDialog>
      ) : null}
    </section>
  );
}
