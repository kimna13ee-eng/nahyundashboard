"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import "./frengle-overview-memos.css";

type Memo = {
  id: string;
  body: string;
  done: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};
type MemoList = {
  ready: boolean;
  items: Memo[];
  archived: Memo[];
  truncated: boolean;
  archivedTruncated: boolean;
};
type MemoChange =
  | { body: string }
  | { done: boolean }
  | { action: "archive" | "restore" };

class MemoRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function memoRequest<T>(
  method: string,
  signal: AbortSignal,
  body?: unknown,
): Promise<T> {
  const response = await fetch("/api/frengle/memos", {
    method,
    cache: "no-store",
    signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]),
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      response.status === 401 || response.status === 403
        ? "FRENGLE에 다시 로그인해 주세요."
        : response.status === 503
          ? "메모 연결을 준비 중입니다. 잠시 후 새로고침해 주세요."
          : response.status === 409
            ? "다른 화면에서 메모가 변경됐어요. 최신 내용을 확인하고 다시 저장해 주세요."
            : typeof result?.error === "string"
              ? result.error
              : "메모를 처리하지 못했어요. 다시 시도해 주세요.";
    throw new MemoRequestError(message, response.status);
  }
  if (!result || typeof result !== "object")
    throw new Error("메모를 불러오지 못했어요. 다시 시도해 주세요.");
  return result as T;
}

const byCreated = (a: Memo, b: Memo) =>
  a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
const byArchived = (a: Memo, b: Memo) =>
  (b.deleted_at ?? "").localeCompare(a.deleted_at ?? "") ||
  b.id.localeCompare(a.id);
const shortBody = (body: string) =>
  body.length > 60 ? `${body.slice(0, 60)}…` : body;

export function FrengleOverviewMemos({ enabled }: { enabled: boolean }) {
  const [items, setItems] = useState<Memo[]>([]);
  const [archived, setArchived] = useState<Memo[]>([]);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<{
    id: string;
    body: string;
    updatedAt: string;
  } | null>(null);
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

  const refresh = useCallback(async (initial = false) => {
    if (!enabledRef.current || busyRef.current) return;
    const epoch = lifecycle.current;
    const request = ++reads.current;
    readController.current?.abort();
    const controller = new AbortController();
    readController.current = controller;
    setLoading(true);
    if (initial) setError("");
    try {
      const result = await memoRequest<MemoList>("GET", controller.signal);
      if (
        controller.signal.aborted ||
        epoch !== lifecycle.current ||
        request !== reads.current
      )
        return;
      if (
        !result.ready ||
        !Array.isArray(result.items) ||
        !Array.isArray(result.archived)
      ) {
        throw new Error("Invalid memo list response");
      }
      setItems([...result.items].sort(byCreated));
      setArchived([...result.archived].sort(byArchived));
      setTruncated(Boolean(result.truncated));
      setArchivedTruncated(Boolean(result.archivedTruncated));
      setReady(true);
      setError("");
    } catch (failure) {
      if (
        controller.signal.aborted ||
        epoch !== lifecycle.current ||
        request !== reads.current
      )
        return;
      setReady(false);
      setItems([]);
      setArchived([]);
      setTruncated(false);
      setArchivedTruncated(false);
      setStatus("");
      setError(
        failure instanceof MemoRequestError
          ? failure.message
          : "메모를 불러오지 못했어요. 새로고침해 주세요.",
      );
    } finally {
      if (epoch === lifecycle.current && request === reads.current)
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
      setBusy(false);
      setReady(false);
      setItems([]);
      setArchived([]);
      setError("");
      setStatus("");
      setLoading(false);
      if (!enabled) {
        setDraft("");
        setEditing(null);
        return;
      }
      void refresh(true);
    });
    if (!enabled)
      return () => {
        lifecycle.current += 1;
      };
    const updateIfVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const timer = window.setInterval(updateIfVisible, 60000);
    window.addEventListener("focus", updateIfVisible);
    document.addEventListener("visibilitychange", updateIfVisible);
    return () => {
      lifecycle.current += 1;
      readController.current?.abort();
      writeController.current?.abort();
      window.clearInterval(timer);
      window.removeEventListener("focus", updateIfVisible);
      document.removeEventListener("visibilitychange", updateIfVisible);
    };
  }, [enabled, refresh]);

  async function write(
    body: unknown,
    method: "POST" | "PATCH",
    message: string,
  ) {
    if (!enabledRef.current || !ready || busyRef.current) return false;
    busyRef.current = true;
    const epoch = lifecycle.current;
    reads.current += 1;
    readController.current?.abort();
    const controller = new AbortController();
    writeController.current = controller;
    setBusy(true);
    setLoading(false);
    setError("");
    setStatus("");
    let conflict = false;
    let success = false;
    try {
      const { item } = await memoRequest<{ item: Memo }>(
        method,
        controller.signal,
        body,
      );
      if (controller.signal.aborted || epoch !== lifecycle.current)
        return false;
      if (
        !item?.id ||
        typeof item.body !== "string" ||
        typeof item.updated_at !== "string"
      ) {
        throw new Error("Invalid memo response");
      }
      setItems((previous) =>
        [
          ...previous.filter((memo) => memo.id !== item.id),
          ...(item.deleted_at ? [] : [item]),
        ].sort(byCreated),
      );
      setArchived((previous) =>
        [
          ...previous.filter((memo) => memo.id !== item.id),
          ...(item.deleted_at ? [item] : []),
        ]
          .sort(byArchived)
          .slice(0, 50),
      );
      setStatus(message);
      success = true;
    } catch (failure) {
      if (controller.signal.aborted || epoch !== lifecycle.current)
        return false;
      conflict = failure instanceof MemoRequestError && failure.status === 409;
      if (
        failure instanceof MemoRequestError &&
        [401, 403, 503].includes(failure.status)
      ) {
        setReady(false);
        setItems([]);
        setArchived([]);
      }
      setError(
        failure instanceof MemoRequestError
          ? failure.message
          : "저장 여부를 확인하지 못했어요. 새로고침으로 확인해 주세요. 입력한 내용은 유지돼요.",
      );
    } finally {
      if (epoch === lifecycle.current) {
        busyRef.current = false;
        setBusy(false);
      }
    }
    if (conflict && epoch === lifecycle.current) {
      await refresh();
      if (epoch === lifecycle.current)
        setError(
          "다른 화면에서 메모가 변경됐어요. 최신 내용을 확인하고 다시 저장해 주세요.",
        );
    }
    return success;
  }

  async function change(
    memo: Memo,
    values: MemoChange,
    message: string,
    expectedUpdatedAt = memo.updated_at,
  ) {
    const saved = await write(
      { id: memo.id, expected_updated_at: expectedUpdatedAt, ...values },
      "PATCH",
      message,
    );
    if (
      saved &&
      "action" in values &&
      values.action === "archive" &&
      editing?.id === memo.id
    )
      setEditing(null);
    return saved;
  }

  const pending = items.filter((memo) => !memo.done);
  const completed = items.filter((memo) => memo.done);
  const canWrite = enabled && ready && !busy;

  function memoRow(memo: Memo, trash = false) {
    const isEditing = !trash && editing?.id === memo.id;
    return (
      <li
        className={`ops-frengle-memo-row${memo.done ? " is-done" : ""}${trash ? " is-archived" : ""}`}
        key={memo.id}
      >
        {!trash && (
          <input
            type="checkbox"
            checked={memo.done}
            disabled={!canWrite}
            aria-label={`${memo.done ? "다시 할 일로 옮기기" : "완료하기"}: ${shortBody(memo.body)}`}
            onChange={() =>
              void change(
                memo,
                { done: !memo.done },
                memo.done ? "다시 할 일로 옮겼어요." : "완료했어요.",
              )
            }
          />
        )}
        {isEditing ? (
          <form
            className="ops-frengle-memo-edit"
            onSubmit={async (event) => {
              event.preventDefault();
              const body = editing.body.trim();
              if (!body) return;
              if (
                await change(memo, { body }, "수정했어요.", editing.updatedAt)
              )
                setEditing(null);
            }}
          >
            <textarea
              aria-label="메모 수정"
              value={editing.body}
              maxLength={1000}
              rows={3}
              disabled={!canWrite}
              onChange={(event) =>
                setEditing({ ...editing, body: event.target.value })
              }
              autoFocus
            />
            {editing.updatedAt !== memo.updated_at && (
              <div className="ops-frengle-memo-conflict">
                <span>최신 저장 내용</span>
                <p>{memo.body}</p>
                <button
                  type="button"
                  disabled={!canWrite}
                  onClick={() => {
                    setEditing({ ...editing, updatedAt: memo.updated_at });
                    setError("");
                    setStatus("최신 내용을 기준으로 편집을 이어가요.");
                  }}
                >
                  최신 기준으로 다시 편집
                </button>
              </div>
            )}
            <div className="ops-frengle-memo-edit-actions">
              <button
                type="button"
                disabled={busy}
                onClick={() => setEditing(null)}
              >
                <X size={13} />
                취소
              </button>
              <button
                type="submit"
                disabled={
                  !canWrite ||
                  !editing.body.trim() ||
                  editing.updatedAt !== memo.updated_at
                }
              >
                <Check size={13} />
                저장
              </button>
            </div>
          </form>
        ) : trash ? (
          <p className="ops-frengle-memo-body">{memo.body}</p>
        ) : (
          <button
            className="ops-frengle-memo-body ops-frengle-memo-edit-trigger"
            type="button"
            disabled={!canWrite}
            aria-label={`메모 수정: ${shortBody(memo.body)}`}
            onClick={() =>
              setEditing({
                id: memo.id,
                body: memo.body,
                updatedAt: memo.updated_at,
              })
            }
          >
            {memo.body}
          </button>
        )}
        {!isEditing && (
          <button
            className="ops-frengle-memo-icon"
            type="button"
            disabled={!canWrite}
            title={trash ? "메모 복원" : "휴지통으로 이동"}
            aria-label={`${trash ? "메모 복원" : "휴지통으로 이동"}: ${shortBody(memo.body)}`}
            onClick={() =>
              void change(
                memo,
                { action: trash ? "restore" : "archive" },
                trash ? "복원했어요." : "휴지통으로 옮겼어요.",
              )
            }
          >
            {trash ? <RotateCcw size={14} /> : <Trash2 size={14} />}
          </button>
        )}
      </li>
    );
  }

  return (
    <section
      className="ops-card ops-frengle-memos"
      aria-labelledby="frengle-memos-title"
    >
      <header className="ops-frengle-memos-heading">
        <div>
          <span className="ops-frengle-memos-eyebrow">
            <span className="ops-frengle-memos-chip" aria-hidden="true">
              📝
            </span>
            나의 체크리스트
          </span>
          <h2 id="frengle-memos-title">
            메모 <span>{enabled && ready ? pending.length : "—"}</span>
          </h2>
        </div>
        <button
          className="ops-frengle-memo-icon ops-frengle-memos-refresh"
          type="button"
          aria-label="메모 새로고침"
          title="메모 새로고침"
          disabled={!enabled || busy || loading}
          onClick={() => void refresh()}
        >
          <RefreshCw size={15} className={loading ? "is-loading" : undefined} />
        </button>
      </header>
      <form
        className="ops-frengle-memos-add"
        onSubmit={async (event) => {
          event.preventDefault();
          const body = draft.trim();
          if (!body) return;
          if (await write({ body }, "POST", "추가했어요.")) setDraft("");
        }}
      >
        <textarea
          aria-label="새 메모"
          placeholder="잊지 않을 내용을 적어두세요"
          maxLength={1000}
          rows={2}
          value={draft}
          disabled={!enabled || busy}
          onChange={(event) => setDraft(event.target.value)}
        />
        <div className="ops-frengle-memos-add-bottom">
          <span>
            {draft.length
              ? `${draft.length.toLocaleString()} / 1,000`
              : "내용을 누르면 수정할 수 있어요"}
          </span>
          <button type="submit" disabled={!canWrite || !draft.trim()}>
            <Plus size={14} />
            추가
          </button>
        </div>
      </form>
      <div
        className="ops-frengle-memos-status"
        aria-live="polite"
        role="status"
      >
        {error ? (
          <p className="is-error">{error}</p>
        ) : !enabled ? (
          <p>FRENGLE 로그인 후 메모를 확인할 수 있어요.</p>
        ) : loading && !ready ? (
          <p>메모를 불러오는 중이에요.</p>
        ) : status ? (
          <p>{status}</p>
        ) : null}
      </div>
      {enabled &&
        editing &&
        !loading &&
        !items.some((memo) => memo.id === editing.id) && (
          <div className="ops-frengle-memo-recovery">
            <p>수정 중이던 내용은 남겨두었어요.</p>
            <textarea
              aria-label="수정 중이던 메모"
              value={editing.body}
              readOnly
              rows={3}
            />
            <button
              type="button"
              disabled={busy || Boolean(draft.trim())}
              onClick={() => {
                setDraft(editing.body);
                setEditing(null);
              }}
            >
              새 메모로 가져오기
            </button>
          </div>
        )}
      {enabled && ready && (
        <div className="ops-frengle-memos-content">
          {pending.length ? (
            <ul className="ops-frengle-memos-list" aria-label="미완료 메모">
              {pending.map((memo) => memoRow(memo))}
            </ul>
          ) : (
            <p className="ops-frengle-memos-empty">
              {completed.length
                ? "남아 있는 메모가 없어요."
                : "짧은 메모부터 하나 남겨보세요."}
            </p>
          )}
          <details
            className="ops-frengle-memos-fold"
            open={
              completed.some((memo) => memo.id === editing?.id) || undefined
            }
          >
            <summary>
              <ChevronDown size={13} />
              완료 <span>{completed.length}</span>
            </summary>
            {completed.length ? (
              <ul className="ops-frengle-memos-list" aria-label="완료한 메모">
                {completed.map((memo) => memoRow(memo))}
              </ul>
            ) : (
              <p className="ops-frengle-memos-empty">완료한 메모가 없어요.</p>
            )}
          </details>
          <details className="ops-frengle-memos-fold ops-frengle-memos-trash">
            <summary>
              <ChevronDown size={13} />
              휴지통{" "}
              <span>
                {archived.length}
                {archivedTruncated ? "+" : ""}
              </span>
            </summary>
            {archived.length ? (
              <ul className="ops-frengle-memos-list" aria-label="휴지통 메모">
                {archived.map((memo) => memoRow(memo, true))}
              </ul>
            ) : (
              <p className="ops-frengle-memos-empty">휴지통이 비어 있어요.</p>
            )}
            {archivedTruncated && (
              <p className="ops-frengle-memos-limit">
                최근 50개 메모를 표시하고 있어요.
              </p>
            )}
          </details>
          {truncated && (
            <p className="ops-frengle-memos-limit">
              등록한 순서대로 200개 메모를 표시하고 있어요.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
