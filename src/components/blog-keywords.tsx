"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Plus, RefreshCw, Trash2, Undo2 } from "lucide-react";
import { blogKeywordLimit, type BlogKeyword } from "@/lib/blog-keywords";
import { OpsDialog } from "./ops-dialog";
import "./blog-keywords.css";

type Props = { enabled: boolean; onSessionExpired?: () => void };
type Identity = { id: string; expectedUpdatedAt: string };
type Create = { id: string; keyword: string };

class KeywordRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request(method: string, signal: AbortSignal, body?: unknown) {
  const response = await fetch("/api/blog-keywords", {
    method,
    cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]),
  });
  const data = await response.json();
  if (!response.ok)
    throw new KeywordRequestError(
      response.status === 401
        ? "로그인이 만료됐어요. 다시 로그인해 주세요."
        : data.error || "키워드를 저장소에서 확인하지 못했어요.",
      response.status,
    );
  return data;
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
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState("");
  const [stale, setStale] = useState(false);
  const [notice, setNotice] = useState("");
  const [adding, setAdding] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [uncertainCreate, setUncertainCreate] = useState(false);
  const [deleting, setDeleting] = useState<BlogKeyword[] | null>(null);
  const [undo, setUndo] = useState<BlogKeyword[]>([]);
  const pendingCreate = useRef<Create | null>(null);
  const input = useRef<HTMLInputElement | null>(null);
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
    if (adding) input.current?.focus();
  }, [adding]);

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
        const activeIds = new Set(rows.map((row) => row.id));
        setUndo((current) => current.filter((row) => !activeIds.has(row.id)));
        setTruncated(Boolean(data.truncated));
        setLoaded(true);
        setStale(false);
        setError("");
        const pending = pendingCreate.current;
        if (
          pending &&
          rows.some(
            (row) => row.id === pending.id && row.keyword === pending.keyword,
          )
        ) {
          pendingCreate.current = null;
          setUncertainCreate(false);
          setKeyword("");
          setAdding(false);
          setNotice("키워드가 저장된 것을 확인했어요.");
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
    setRevision((value) => value + 1);
  }

  async function mutate(
    method: string,
    body: unknown,
    success: (data: { item: BlogKeyword; items: BlogKeyword[] }) => void,
    creating = false,
  ) {
    if (lock.current || !loaded || stale) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const controller = new AbortController();
    mutation.current = controller;
    try {
      const data = await request(method, controller.signal, body);
      if (controller.signal.aborted || !active.current) return;
      success(data);
    } catch (cause) {
      if (controller.signal.aborted || !active.current) return;
      const status = cause instanceof KeywordRequestError ? cause.status : 0;
      setError(errorMessage(cause));
      setDeleting(null);
      if (creating) {
        const uncertain = status === 0 || status >= 500;
        setUncertainCreate(uncertain);
        if (!uncertain) pendingCreate.current = null;
      }
      if (status === 409 || (!creating && (status === 0 || status >= 500)))
        setStale(true);
      if (status === 401) {
        setItems([]);
        setLoaded(false);
        setUndo([]);
        sessionExpired.current?.();
      }
    } finally {
      if (!controller.signal.aborted && active.current) {
        setBusy(false);
        lock.current = false;
      }
    }
  }

  function add(event: FormEvent) {
    event.preventDefault();
    const value = keyword.trim();
    if (!value || Array.from(value).length > 200 || lock.current) return;
    if (!pendingCreate.current)
      pendingCreate.current = { id: crypto.randomUUID(), keyword: value };
    void mutate(
      "POST",
      pendingCreate.current,
      ({ item }) => {
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
        setKeyword("");
        setAdding(false);
        setNotice("키워드를 추가했어요.");
      },
      true,
    );
  }

  function toggle(item: BlogKeyword) {
    void mutate(
      "PATCH",
      { ...identity(item), used: !item.used },
      ({ item: updated }) => {
        setItems((current) =>
          current.map((row) => (row.id === updated.id ? updated : row)),
        );
        setNotice(
          updated.used
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

  const checked = items.filter((item) => item.used);
  const blocked = !loaded || loading || busy || stale;

  return (
    <section
      className="blog-keywords"
      aria-labelledby="blog-keywords-title"
      aria-busy={loading || busy}
    >
      <header className="blog-keywords-heading">
        <div>
          <h2 id="blog-keywords-title">블로그 소재 수집</h2>
          <p>생각난 키워드를 담아두고, 포스팅을 마치면 체크해요.</p>
        </div>
        <button
          type="button"
          className="blog-keywords-add"
          aria-label="키워드 추가"
          aria-expanded={adding}
          aria-controls="blog-keywords-add-form"
          disabled={blocked || adding}
          onClick={() => setAdding(true)}
        >
          <Plus size={22} aria-hidden="true" />
        </button>
      </header>

      {adding && (
        <form
          id="blog-keywords-add-form"
          className="blog-keywords-form"
          onSubmit={add}
        >
          <label htmlFor="blog-keyword-input">추가할 키워드</label>
          <input
            ref={input}
            id="blog-keyword-input"
            name="keyword"
            type="text"
            value={keyword}
            maxLength={200}
            required
            placeholder="예: 겨울 보습 루틴"
            disabled={busy || uncertainCreate}
            autoComplete="off"
            onChange={(event) => {
              setKeyword(event.target.value);
              pendingCreate.current = null;
            }}
          />
          {uncertainCreate && (
            <p className="blog-keywords-pending">
              저장 여부를 확인하지 못했어요. 같은 키워드로 다시 확인하면 중복
              등록되지 않아요.
            </p>
          )}
          <div className="blog-keywords-form-actions">
            <button
              type="button"
              disabled={busy || uncertainCreate}
              onClick={() => setAdding(false)}
            >
              닫기
            </button>
            <button type="submit" disabled={blocked || !keyword.trim()}>
              {busy ? "저장 중…" : uncertainCreate ? "다시 확인" : "추가"}
            </button>
          </div>
        </form>
      )}

      {error && (
        <div className="blog-keywords-error" role="alert">
          <p>{error}</p>
          <button type="button" disabled={busy || loading} onClick={refresh}>
            {stale ? "최신 목록 불러오기" : "다시 불러오기"}
          </button>
        </div>
      )}
      {(notice || undo.length > 0) && (
        <div className="blog-keywords-notice" role="status">
          <span>{notice}</span>
          {undo.length > 0 && (
            <button type="button" disabled={blocked} onClick={restore}>
              <Undo2 size={15} aria-hidden="true" /> 삭제 취소 ({undo.length}개)
            </button>
          )}
        </div>
      )}

      <div className="blog-keywords-toolbar">
        <p>
          {loaded ? (
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
                <label className="blog-keywords-row">
                  <input
                    className="blog-keywords-check"
                    type="checkbox"
                    checked={item.used}
                    disabled={blocked}
                    aria-label={`${item.keyword} 쓴 소재로 표시`}
                    onChange={() => toggle(item)}
                  />
                  <span className="blog-keywords-word">{item.keyword}</span>
                  {item.used && (
                    <span className="blog-keywords-used">썼어요</span>
                  )}
                </label>
              </li>
            ))}
          </ul>
        )
      )}

      {checked.length > 0 && (
        <div className="blog-keywords-delete-area">
          <p>체크한 소재를 한 번에 정리할 수 있어요.</p>
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
          소재가 많아 최근 500개만 표시돼요. 삭제는 이 목록에서 체크한 항목에만
          적용돼요.
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
