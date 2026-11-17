"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Bell,
  Download,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Undo2,
} from "lucide-react";
import {
  blogBoards,
  blogKeywordLimit,
  type BlogBoard,
  type BlogKeyword,
} from "@/lib/blog-keywords";
import { OpsDialog } from "./ops-dialog";
import { seoulToday } from "@/lib/leave";
import "./blog-keywords.css";

type Props = { enabled: boolean; onSessionExpired?: () => void };
type Identity = { id: string; expectedUpdatedAt: string };
type Fields = Pick<
  BlogKeyword,
  "keyword" | "sub_keyword" | "summary" | "board" | "is_draft"
>;
type Create = Fields & { id: string };
type Editor = { original: BlogKeyword | null; fields: Fields };
type ArchivePreview = { count: number; snapshot: string };
type ArchiveBatch = { count: number; batchId: string };
const reminderThreshold = 30;
const collectionPath = "/api/blog-keywords";
const archivePath = collectionPath + "/archive";

function reminderKey(collectionId: string) {
  return "personal.blog-keywords.last-export." + collectionId;
}

function fieldsOf(row?: Partial<Fields> | null): Fields {
  return {
    keyword: row?.keyword ?? "",
    sub_keyword: row?.sub_keyword ?? "",
    summary: row?.summary ?? "",
    board: row?.board ?? null,
    is_draft: row?.is_draft ?? false,
  };
}

class KeywordRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function fetchCollection(
  method: string,
  signal: AbortSignal,
  body?: unknown,
  path = collectionPath,
) {
  const response = await fetch(path, {
    method,
    cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.any([
      signal,
      AbortSignal.timeout(path === collectionPath ? 20000 : 60000),
    ]),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new KeywordRequestError(
      response.status === 401
        ? "로그인이 만료됐어요. 다시 로그인해 주세요."
        : data.error || "키워드를 저장소에서 확인하지 못했어요.",
      response.status,
    );
  }
  return response;
}

async function request(
  method: string,
  signal: AbortSignal,
  body?: unknown,
  path = collectionPath,
) {
  return (await fetchCollection(method, signal, body, path)).json();
}

function identity(item: BlogKeyword): Identity {
  return { id: item.id, expectedUpdatedAt: item.updated_at };
}

function errorMessage(error: unknown) {
  return error instanceof KeywordRequestError
    ? error.message
    : "응답을 확인하지 못했어요. 연결을 확인하고 다시 시도해 주세요.";
}

function KeywordCollection({
  onSessionExpired,
}: Pick<Props, "onSessionExpired">) {
  const [items, setItems] = useState<BlogKeyword[]>([]);
  const [total, setTotal] = useState(0);
  const [collectionId, setCollectionId] = useState("");
  const [lastExportedAt, setLastExportedAt] = useState("");
  const [lastSnapshot, setLastSnapshot] = useState("");
  const [archivePreview, setArchivePreview] = useState<ArchivePreview | null>(
    null,
  );
  const [archiveUndo, setArchiveUndo] = useState<ArchiveBatch | null>(null);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState("");
  const [stale, setStale] = useState(false);
  const [notice, setNotice] = useState("");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [uncertainCreate, setUncertainCreate] = useState(false);
  const [deleting, setDeleting] = useState<BlogKeyword[] | null>(null);
  const [undo, setUndo] = useState<BlogKeyword[]>([]);
  const pendingCreate = useRef<Create | null>(null);
  const lock = useRef(true);
  const active = useRef(true);
  const mutation = useRef<AbortController | null>(null);
  const sessionExpired = useRef(onSessionExpired);

  useEffect(() => {
    sessionExpired.current = onSessionExpired;
  }, [onSessionExpired]);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      mutation.current?.abort();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    lock.current = true;
    async function load() {
      setLoading(true);
      try {
        const data = await request("GET", controller.signal);
        if (controller.signal.aborted) return;
        const rows = data.items as BlogKeyword[];
        setItems(rows);
        setTotal(data.total ?? rows.length);
        setCollectionId(data.collectionId ?? "");
        if (data.collectionId) {
          try {
            setLastExportedAt(
              localStorage.getItem(reminderKey(data.collectionId)) || "",
            );
          } catch {
            // The current visit still remembers the download if storage is disabled.
          }
        }
        const activeIds = new Set(rows.map((row) => row.id));
        setUndo((current) => current.filter((row) => !activeIds.has(row.id)));
        setTruncated(Boolean(data.truncated));
        setLoaded(true);
        setStale(false);
        setError("");
        const pending = pendingCreate.current;
        if (pending && rows.some((row) => row.id === pending.id)) {
          pendingCreate.current = null;
          setUncertainCreate(false);
          setEditor((current) => (current?.original ? current : null));
          setNotice("소재가 저장된 것을 확인했어요.");
        }
      } catch (cause) {
        if (controller.signal.aborted) return;
        setError(errorMessage(cause));
        if (cause instanceof KeywordRequestError && cause.status === 401) {
          setItems([]);
          setLoaded(false);
          sessionExpired.current?.();
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          lock.current = false;
        }
      }
    }
    void load();
    return () => controller.abort();
  }, [revision]);

  function refresh() {
    if (lock.current) return;
    lock.current = true;
    setLoading(true);
    setDeleting(null);
    setArchivePreview(null);
    setRevision((value) => value + 1);
  }

  function mutate(
    method: string,
    body: unknown,
    success: (data: { item: BlogKeyword; items: BlogKeyword[] }) => void,
    creating = false,
  ) {
    return perform(
      (signal) => request(method, signal, body),
      success,
      creating ? "create" : "update",
    );
  }

  async function perform<T>(
    operation: (signal: AbortSignal) => Promise<T>,
    success: (data: T) => void,
    kind: "create" | "update" | "read",
  ) {
    if (lock.current || !loaded || stale) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const controller = new AbortController();
    mutation.current = controller;
    try {
      const data = await operation(controller.signal);
      if (controller.signal.aborted || !active.current) return;
      success(data);
    } catch (cause) {
      if (controller.signal.aborted || !active.current) return;
      const status = cause instanceof KeywordRequestError ? cause.status : 0;
      setError(errorMessage(cause));
      setDeleting(null);
      setArchivePreview(null);
      if (kind === "create") {
        const uncertain = status === 0 || status >= 500;
        setUncertainCreate(uncertain);
        if (!uncertain) pendingCreate.current = null;
      }
      if (
        status === 409 ||
        (kind === "update" && (status === 0 || status >= 500))
      )
        setStale(true);
      if (status === 401) {
        setItems([]);
        setLoaded(false);
        setUndo([]);
        setArchiveUndo(null);
        sessionExpired.current?.();
      }
    } finally {
      if (!controller.signal.aborted && active.current) {
        setBusy(false);
        lock.current = false;
      }
    }
  }

  function openEditor(original: BlogKeyword | null) {
    setEditor({
      original,
      fields: fieldsOf(original ?? pendingCreate.current),
    });
    setError("");
    setNotice("");
  }

  function changeField<K extends keyof Fields>(key: K, value: Fields[K]) {
    setEditor(
      (current) =>
        current && {
          ...current,
          fields: { ...current.fields, [key]: value },
        },
    );
  }

  function save(event: FormEvent) {
    event.preventDefault();
    if (!editor || blocked || lock.current || formUnavailable || invalidFields)
      return;
    const fields = {
      ...editor.fields,
      keyword: editor.fields.keyword.trim(),
      sub_keyword: editor.fields.sub_keyword.trim(),
      summary: editor.fields.summary.trim(),
    };
    if (editor.original) {
      const original = fieldsOf(editor.original);
      const changes = Object.fromEntries(
        (Object.keys(fields) as (keyof Fields)[])
          .filter((key) => fields[key] !== original[key])
          .map((key) => [key, fields[key]]),
      );
      if (!Object.keys(changes).length) {
        setEditor(null);
        return;
      }
      void mutate(
        "PATCH",
        { ...identity(editor.original), ...changes },
        ({ item }) => {
          replaceItem(item);
          setEditor(null);
          setNotice("소재를 수정했어요.");
        },
      );
      return;
    }
    if (!pendingCreate.current)
      pendingCreate.current = { id: crypto.randomUUID(), ...fields };
    void mutate(
      "POST",
      pendingCreate.current,
      ({ item }) => {
        if (!items.some((row) => row.id === item.id))
          setTotal((value) => value + 1);
        if (
          items.length >= blogKeywordLimit &&
          !items.some((row) => row.id === item.id)
        )
          setTruncated(true);
        setItems((current) =>
          [item, ...current.filter((row) => row.id !== item.id)].slice(
            0,
            blogKeywordLimit,
          ),
        );
        pendingCreate.current = null;
        setUncertainCreate(false);
        setEditor(null);
        setNotice("소재를 추가했어요.");
      },
      true,
    );
  }

  function replaceItem(item: BlogKeyword) {
    setItems((current) =>
      current.map((row) => (row.id === item.id ? item : row)),
    );
  }

  function toggle(item: BlogKeyword, key: "used" | "is_draft") {
    void mutate(
      "PATCH",
      { ...identity(item), [key]: !item[key] },
      ({ item: updated }) => {
        replaceItem(updated);
        setNotice(
          key === "is_draft"
            ? updated.is_draft
              ? "임시저장으로 표시했어요."
              : "임시저장 표시를 해제했어요."
            : updated.used
              ? "쓴 소재로 체크했어요."
              : "아직 안 쓴 소재로 바꿨어요.",
        );
      },
    );
  }

  function removeChecked() {
    if (!deleting?.length) return;
    void mutate(
      "DELETE",
      { items: deleting.map(identity) },
      ({ items: deleted }) => {
        const ids = new Set(deleted.map((item) => item.id));
        setItems((current) => current.filter((item) => !ids.has(item.id)));
        setUndo(deleted);
        setTotal((value) => value - ids.size);
        if (truncated) setRevision((value) => value + 1);
        setDeleting(null);
        setNotice(`${deleted.length}개 키워드를 삭제했어요.`);
      },
    );
  }

  function restore() {
    void mutate(
      "POST",
      { action: "restore", items: undo.map(identity) },
      ({ items: restored }) => {
        const ids = new Set(restored.map((item) => item.id));
        setTotal(
          (value) =>
            value +
            restored.filter((item) => !items.some((row) => row.id === item.id))
              .length,
        );
        if (
          restored.length + items.filter((item) => !ids.has(item.id)).length >
          blogKeywordLimit
        )
          setTruncated(true);
        setItems((current) =>
          [...restored, ...current.filter((item) => !ids.has(item.id))]
            .sort(
              (a, b) =>
                b.created_at.localeCompare(a.created_at) ||
                b.id.localeCompare(a.id),
            )
            .slice(0, blogKeywordLimit),
        );
        setUndo([]);
        setNotice(`${restored.length}개 키워드를 복원했어요.`);
      },
    );
  }

  function exportCsv() {
    void perform(
      async (signal) => {
        const response = await fetchCollection(
          "GET",
          signal,
          undefined,
          archivePath + "?format=csv",
        );
        if (!response.headers.get("content-type")?.includes("text/csv"))
          throw new KeywordRequestError(
            "CSV 파일을 불러오지 못했어요. 다시 시도해 주세요.",
            502,
          );
        return {
          blob: await response.blob(),
          count: Number(response.headers.get("X-Archive-Count")),
          newest: response.headers.get("X-Archive-Newest-Created-At") ?? "",
          snapshot: response.headers.get("X-Archive-Snapshot") ?? "",
        };
      },
      ({ blob, count, newest, snapshot }) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `블로그-소재-${seoulToday()}.csv`;
        document.body.appendChild(link);
        try {
          link.click();
        } finally {
          link.remove();
          setTimeout(() => URL.revokeObjectURL(url), 60000);
        }
        setLastSnapshot(snapshot);
        if (newest) {
          setLastExportedAt(newest);
          if (collectionId) {
            try {
              localStorage.setItem(reminderKey(collectionId), newest);
            } catch {
              // Downloads also work without access to local storage.
            }
          }
        }
        setNotice(`소재 ${count}개의 CSV 다운로드를 시작했어요.`);
      },
      "read",
    );
  }

  function previewRemoveAll() {
    void perform<ArchivePreview>(
      (signal) => request("GET", signal, undefined, archivePath),
      (preview) => {
        if (preview.count > 0) setArchivePreview(preview);
        else {
          setNotice("삭제할 소재가 없어요.");
          setRevision((value) => value + 1);
        }
      },
      "read",
    );
  }

  function removeAll() {
    if (!archivePreview) return;
    void perform<ArchiveBatch>(
      (signal) =>
        request(
          "DELETE",
          signal,
          { snapshot: archivePreview.snapshot },
          archivePath,
        ),
      (batch) => {
        setArchivePreview(null);
        setArchiveUndo(batch);
        setItems([]);
        setTotal(0);
        setTruncated(false);
        setNotice(`소재 ${batch.count}개를 삭제했어요.`);
        setRevision((value) => value + 1);
      },
      "update",
    );
  }

  function restoreAll() {
    if (!archiveUndo) return;
    void perform<{ count: number }>(
      (signal) =>
        request("POST", signal, { batchId: archiveUndo.batchId }, archivePath),
      ({ count }) => {
        setArchiveUndo(null);
        setNotice(`소재 ${count}개를 복원했어요.`);
        setRevision((value) => value + 1);
      },
      "update",
    );
  }

  const checked = items.filter((item) => item.used);
  // Loaded in newest-first order. Even the capped list contains the first 30
  // active additions since the last download whenever a reminder is due.
  const reminderDue =
    total >= reminderThreshold &&
    (!lastExportedAt ||
      items.filter(
        (row) => Date.parse(row.created_at) > Date.parse(lastExportedAt),
      ).length >= reminderThreshold);
  const blocked = !loaded || loading || busy || stale;
  const latest =
    editor?.original && items.find((item) => item.id === editor.original?.id);
  const formUnavailable = Boolean(
    editor?.original && editor.original.updated_at !== latest?.updated_at,
  );
  const frozen =
    busy ||
    loading ||
    stale ||
    formUnavailable ||
    (!editor?.original && uncertainCreate);
  const fields = editor?.fields;
  const tooLong =
    fields &&
    (Array.from(fields.keyword.trim()).length > 200 ||
      Array.from(fields.sub_keyword.trim()).length > 200 ||
      Array.from(fields.summary.trim()).length > 1000);
  const invalidFields = !fields?.board || !fields.keyword.trim() || tooLong;
  const errorPanel = error && (
    <div className="blog-keywords-error" role="alert">
      <p>{error}</p>
      <button type="button" disabled={busy || loading} onClick={refresh}>
        {stale ? "최신 목록 불러오기" : "다시 불러오기"}
      </button>
    </div>
  );

  return (
    <section
      className="blog-keywords"
      aria-labelledby="blog-keywords-title"
      aria-busy={loading || busy}
    >
      <header className="blog-keywords-heading">
        <div>
          <h2 id="blog-keywords-title">블로그 소재 수집</h2>
        </div>
        <button
          type="button"
          className="blog-keywords-add"
          aria-label="키워드 추가"
          aria-haspopup="dialog"
          disabled={blocked || !!editor}
          onClick={() => openEditor(null)}
        >
          <Plus size={22} aria-hidden="true" />
        </button>
      </header>

      {editor && fields && (
        <OpsDialog
          key={editor.original?.updated_at ?? "add"}
          title={editor.original ? "블로그 소재 수정" : "블로그 소재 추가"}
          busy={busy}
          close={() => setEditor(null)}
        >
          <form className="blog-keywords-form" onSubmit={save}>
            <label>
              게시판
              <select
                name="board"
                required
                value={fields.board ?? ""}
                disabled={frozen}
                onChange={(event) =>
                  changeField("board", event.target.value as BlogBoard)
                }
              >
                <option value="" disabled>
                  게시판 선택
                </option>
                {blogBoards.map((board) => (
                  <option key={board} value={board}>
                    {board}
                  </option>
                ))}
              </select>
            </label>
            <label>
              메인 키워드
              <input
                name="keyword"
                required
                autoComplete="off"
                value={fields.keyword}
                disabled={frozen}
                placeholder="예: 봄웜 블러셔"
                onChange={(event) => changeField("keyword", event.target.value)}
              />
            </label>
            <label>
              서브 키워드
              <input
                name="sub_keyword"
                autoComplete="off"
                value={fields.sub_keyword}
                disabled={frozen}
                placeholder="예: 코랄, 발색 비교"
                onChange={(event) =>
                  changeField("sub_keyword", event.target.value)
                }
              />
            </label>
            <label>
              글 내용 요약
              <textarea
                name="summary"
                rows={3}
                value={fields.summary}
                disabled={frozen}
                placeholder="어떤 글을 쓸지 짧게 적어주세요."
                onChange={(event) => changeField("summary", event.target.value)}
              />
            </label>
            <label className="blog-keywords-status">
              <input
                type="checkbox"
                name="is_draft"
                className="blog-keywords-check"
                checked={fields.is_draft}
                disabled={frozen}
                onChange={(event) =>
                  changeField("is_draft", event.target.checked)
                }
              />
              임시저장
            </label>
            {tooLong && (
              <p role="alert" className="blog-keywords-pending">
                키워드는 각각 200자, 글 내용 요약은 1,000자까지 입력할 수
                있어요.
              </p>
            )}
            {!editor.original && uncertainCreate && (
              <p className="blog-keywords-pending">
                저장 응답을 받지 못했어요. ‘다시 확인’을 누르면 같은 소재의 저장
                여부를 확인해요.
              </p>
            )}
            {errorPanel}
            {formUnavailable && (
              <div className="blog-keywords-error" role="alert">
                <p>
                  {latest
                    ? "다른 곳에서 수정된 소재예요. 최신 내용으로 다시 열면 지금 입력한 내용이 교체돼요."
                    : "현재 목록에 이 소재가 없어 수정할 수 없어요."}
                </p>
                {latest && (
                  <button
                    type="button"
                    disabled={busy || loading}
                    onClick={() => openEditor(latest)}
                  >
                    최신 내용으로 다시 열기
                  </button>
                )}
              </div>
            )}
            <div className="blog-keywords-form-actions">
              <button type="button" data-dialog-close disabled={busy}>
                취소
              </button>
              <button
                type="submit"
                disabled={blocked || formUnavailable || !!invalidFields}
              >
                {busy
                  ? "저장 중…"
                  : !editor.original && uncertainCreate
                    ? "다시 확인"
                    : "저장"}
              </button>
            </div>
          </form>
        </OpsDialog>
      )}

      {!editor && errorPanel}
      {(notice || undo.length > 0 || archiveUndo) && (
        <div className="blog-keywords-notice" role="status">
          <span>{notice}</span>
          {undo.length > 0 && (
            <button type="button" disabled={blocked} onClick={restore}>
              <Undo2 size={15} aria-hidden="true" /> 삭제 취소 ({undo.length}개)
            </button>
          )}
          {archiveUndo && (
            <button type="button" disabled={blocked} onClick={restoreAll}>
              <Undo2 size={15} aria-hidden="true" /> 전체 삭제 취소 (
              {archiveUndo.count}개)
            </button>
          )}
        </div>
      )}

      <div className="blog-keywords-toolbar">
        <p>
          {loaded && truncated ? (
            <>
              전체 소재 <strong>{total}</strong>개
            </>
          ) : loaded ? (
            <>
              안 쓴 소재 <strong>{items.length - checked.length}</strong> · 쓴
              소재 <strong>{checked.length}</strong>
            </>
          ) : (
            "나의 키워드"
          )}
        </p>
        <button
          type="button"
          className="blog-keywords-refresh"
          aria-label="키워드 새로고침"
          disabled={loading || busy}
          onClick={refresh}
        >
          <RefreshCw size={17} aria-hidden="true" />
        </button>
      </div>

      {loaded && total > 0 && (
        <div
          className={"blog-keywords-archive" + (reminderDue ? " is-due" : "")}
        >
          {reminderDue && (
            <p role="status">
              <Bell size={17} aria-hidden="true" />
              <span>
                <strong>소재가 {total}개 쌓였어요.</strong> CSV로 저장해 두세요.
              </span>
            </p>
          )}
          <div className="blog-keywords-archive-actions">
            <button type="button" disabled={blocked} onClick={exportCsv}>
              <Download size={16} aria-hidden="true" /> CSV 저장
            </button>
            <button
              type="button"
              disabled={blocked}
              aria-haspopup="dialog"
              onClick={previewRemoveAll}
            >
              <Trash2 size={15} aria-hidden="true" /> 전체 삭제
            </button>
          </div>
        </div>
      )}

      {loading && !loaded ? (
        <p className="blog-keywords-empty" role="status">
          키워드를 불러오는 중이에요.
        </p>
      ) : loaded && !items.length ? (
        <div className="blog-keywords-empty">
          <span aria-hidden="true">📝</span>
          <strong>첫 번째 블로그 소재를 담아볼까요?</strong>
          <p>위의 + 버튼으로 키워드를 추가해 주세요.</p>
        </div>
      ) : (
        items.length > 0 && (
          <ul className="blog-keywords-list" aria-label="블로그 키워드 목록">
            {items.map((item) => (
              <li key={item.id} className={item.used ? "is-used" : ""}>
                <div className="blog-keywords-row">
                  <button
                    type="button"
                    className="blog-keywords-edit"
                    disabled={blocked}
                    aria-label={`${item.keyword} 소재 수정`}
                    onClick={() => openEditor(item)}
                  >
                    <span>
                      <span className="blog-keywords-board">
                        {item.board ?? "게시판 미지정"}
                      </span>
                      <strong className="blog-keywords-word">
                        {item.keyword}
                      </strong>
                    </span>
                    <Pencil size={15} aria-hidden="true" />
                  </button>
                  {item.sub_keyword && (
                    <p className="blog-keywords-sub">
                      <span>서브</span> {item.sub_keyword}
                    </p>
                  )}
                  {item.summary && (
                    <p className="blog-keywords-summary">{item.summary}</p>
                  )}
                  <div className="blog-keywords-statuses">
                    <label className="blog-keywords-status">
                      <input
                        className="blog-keywords-check"
                        type="checkbox"
                        checked={!!item.is_draft}
                        disabled={blocked}
                        aria-label={`${item.keyword} 임시저장`}
                        onChange={() => toggle(item, "is_draft")}
                      />
                      임시저장
                    </label>
                    <label className="blog-keywords-status">
                      <input
                        className="blog-keywords-check"
                        type="checkbox"
                        checked={item.used}
                        disabled={blocked}
                        aria-label={`${item.keyword} 쓴 소재로 표시`}
                        onChange={() => toggle(item, "used")}
                      />
                      썼어요
                    </label>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )
      )}

      {checked.length > 0 && (
        <div className="blog-keywords-delete-area">
          <p>‘썼어요’에 체크한 소재만 삭제해요.</p>
          <button
            type="button"
            disabled={blocked}
            onClick={() => {
              setError("");
              setDeleting(checked);
            }}
          >
            <Trash2 size={16} aria-hidden="true" /> 체크한 {checked.length}개
            삭제
          </button>
        </div>
      )}
      {truncated && (
        <p className="blog-keywords-limit">
          최근 {blogKeywordLimit}개를 표시하고 있어요. CSV 저장과 전체 삭제는
          모든 소재에 적용돼요.
        </p>
      )}

      {deleting && (
        <OpsDialog
          title="체크한 키워드 삭제"
          busy={busy}
          close={() => setDeleting(null)}
        >
          <div className="blog-keywords-confirm">
            <p>
              쓴 소재로 체크한 <strong>{deleting.length}개</strong>를 목록에서
              삭제할까요?
            </p>
            <ul>
              {deleting.slice(0, 5).map((item) => (
                <li key={item.id}>{item.keyword}</li>
              ))}
            </ul>
            {deleting.length > 5 && <p>외 {deleting.length - 5}개</p>}
            <p>삭제 후 화면에서 취소할 수 있어요.</p>
            <div className="blog-keywords-confirm-actions">
              <button type="button" data-dialog-close disabled={busy}>
                취소
              </button>
              <button type="button" disabled={busy} onClick={removeChecked}>
                {deleting.length}개 삭제
              </button>
            </div>
          </div>
        </OpsDialog>
      )}
      {archivePreview && (
        <OpsDialog
          title="블로그 소재 전체 삭제"
          busy={busy}
          close={() => setArchivePreview(null)}
        >
          <div className="blog-keywords-confirm">
            <p>
              모든 게시판의 소재 <strong>{archivePreview.count}개</strong>를
              삭제할까요? 임시저장한 소재와 이미 쓴 소재도 함께 삭제돼요.
            </p>
            {lastSnapshot && lastSnapshot !== archivePreview.snapshot && (
              <p>
                마지막 CSV 다운로드 이후 목록이 바뀌었어요. 최신 파일이 필요하면
                취소하고 CSV를 다시 저장해 주세요.
              </p>
            )}
            <div className="blog-keywords-confirm-actions">
              <button type="button" data-dialog-close disabled={busy}>
                취소
              </button>
              <button type="button" disabled={blocked} onClick={removeAll}>
                {archivePreview.count}개 전체 삭제
              </button>
            </div>
          </div>
        </OpsDialog>
      )}
    </section>
  );
}

export function BlogKeywords({ enabled, onSessionExpired }: Props) {
  return enabled ? (
    <KeywordCollection onSessionExpired={onSessionExpired} />
  ) : (
    <section className="blog-keywords" aria-label="블로그 소재 수집">
      <p className="blog-keywords-empty">
        개인 계정으로 로그인하면 키워드를 모을 수 있어요.
      </p>
    </section>
  );
}
