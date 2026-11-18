"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { OpsDialog } from "./ops-dialog";
import "./shooting-skills.css";

type Tip = { id: string; title: string; content: string; updated_at: string };
type Page = { items: Tip[]; nextOffset: number | null };

export function ShootingSkills({
  onSessionExpired,
}: {
  onSessionExpired: () => void;
}) {
  const [items, setItems] = useState<Tip[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editor, setEditor] = useState<Tip | null>(null);
  const [removing, setRemoving] = useState<Tip | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [notice, setNotice] = useState("");
  const textarea = useRef<HTMLTextAreaElement>(null);
  const lock = useRef(false);

  const call = useCallback(
    async <T,>(url: string, options?: RequestInit): Promise<T> => {
      const response = await fetch(url, {
        ...options,
        cache: "no-store",
        signal: options?.signal
          ? AbortSignal.any([options.signal, AbortSignal.timeout(30000)])
          : AbortSignal.timeout(30000),
      });
      const data = await response.json();
      if (response.status === 401) onSessionExpired();
      if (!response.ok)
        throw new Error(data.error || "메모를 저장하지 못했어요.");
      return data;
    },
    [onSessionExpired],
  );

  const load = useCallback(
    async (offset = 0, signal?: AbortSignal) => {
      setLoading(true);
      setError("");
      try {
        const data = await call<Page>(`/api/shooting-skills?offset=${offset}`, {
          signal,
        });
        if (signal?.aborted) return;
        setItems((prior) =>
          offset
            ? [
                ...prior,
                ...data.items.filter(
                  (item) => !prior.some((old) => old.id === item.id),
                ),
              ]
            : data.items,
        );
        setNext(data.nextOffset);
      } catch (cause) {
        if (!signal?.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "연결을 확인하고 다시 시도해 주세요.",
          );
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [call],
  );

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) void load(0, controller.signal);
    });
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    if (textarea.current) {
      textarea.current.style.height = "auto";
      textarea.current.style.height = `${textarea.current.scrollHeight}px`;
    }
  }, [content, editor]);

  function open(item?: Tip) {
    setError("");
    setTitle(item?.title || "");
    setContent(item?.content || "");
    setEditor(
      item || {
        id: crypto.randomUUID(),
        title: "",
        content: "",
        updated_at: "",
      },
    );
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (lock.current || !editor) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await call("/api/shooting-skills", {
        method: editor.updated_at ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editor.id,
          title,
          content,
          ...(editor.updated_at
            ? { expectedUpdatedAt: editor.updated_at }
            : {}),
        }),
      });
      setEditor(null);
      setNotice("촬영 메모를 저장했어요.");
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "저장하지 못했어요. 다시 시도해 주세요.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function remove() {
    if (lock.current || !removing) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await call("/api/shooting-skills", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: removing.id,
          expectedUpdatedAt: removing.updated_at,
        }),
      });
      setRemoving(null);
      setNotice("메모를 삭제했어요.");
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "삭제하지 못했어요. 다시 시도해 주세요.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <section className="shooting-skills" aria-label="촬영 스킬 메모">
      <div className="shooting-toolbar">
        <p>촬영 전에 꺼내 보는 나만의 팁</p>
        <button className="shooting-add" onClick={() => open()}>
          ＋ 메모 추가
        </button>
      </div>
      <p className="shooting-notice" role="status">
        {notice}
      </p>
      {error && !editor && !removing && (
        <p role="alert">
          {error} <button onClick={() => void load()}>다시 불러오기</button>
        </p>
      )}
      {loading && <p role="status">메모를 불러오고 있어요.</p>}
      {!loading && !error && !items.length && (
        <div className="shooting-empty">
          <span aria-hidden="true">📷</span>
          <h2>잘 나왔던 촬영 세팅, 여기에</h2>
          <p>
            조명 위치, 카메라 설정, 촬영 각도처럼
            <br />
            다음에도 기억하고 싶은 팁을 적어 보세요.
          </p>
          <button onClick={() => open()}>첫 메모 추가하기</button>
        </div>
      )}
      <div className="shooting-list">
        {items.map((item) => (
          <article className="shooting-card" key={item.id}>
            <h2>
              <button
                onClick={() => open(item)}
                aria-label={`${item.title} 수정`}
              >
                {item.title}
              </button>
            </h2>
            <p className="shooting-content">{item.content}</p>
            <div className="shooting-actions">
              <button onClick={() => open(item)}>수정</button>
              <button
                onClick={() => {
                  setError("");
                  setRemoving(item);
                }}
                aria-label={`${item.title} 삭제`}
              >
                삭제
              </button>
            </div>
          </article>
        ))}
      </div>
      {next !== null && (
        <button disabled={loading} onClick={() => void load(next)}>
          메모 더 보기
        </button>
      )}
      {editor && (
        <OpsDialog
          title={editor.updated_at ? "촬영 메모 수정" : "촬영 메모 추가"}
          busy={busy}
          close={() => {
            setEditor(null);
            setError("");
          }}
        >
          <form className="shooting-form" onSubmit={save}>
            <label>
              제목
              <input
                name="title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={100}
                required
                placeholder="예: 저녁 실내 조명 세팅"
                disabled={busy}
              />
            </label>
            <label>
              메모
              <textarea
                ref={textarea}
                name="content"
                value={content}
                onChange={(event) => setContent(event.target.value)}
                maxLength={10000}
                required
                rows={5}
                placeholder="기억할 세팅을 편하게 적어 주세요."
                disabled={busy}
              />
            </label>
            <small>
              줄바꿈과 띄어쓰기는 그대로 저장돼요. 화면 폭을 넘는 긴 문장은
              자연스럽게 이어져요.
            </small>
            {error && <p role="alert">{error}</p>}
            <button
              className="shooting-add"
              disabled={busy || !title.trim() || !content.trim()}
            >
              {busy ? "저장 중…" : "저장"}
            </button>
          </form>
        </OpsDialog>
      )}
      {removing && (
        <OpsDialog
          title="촬영 메모 삭제"
          busy={busy}
          close={() => {
            setRemoving(null);
            setError("");
          }}
        >
          <p>
            ‘{removing.title}’ 메모를 삭제할까요? 삭제하면 되돌릴 수 없어요.
          </p>
          {error && <p role="alert">{error}</p>}
          <button disabled={busy} onClick={() => void remove()}>
            {busy ? "삭제 중…" : "삭제하기"}
          </button>
        </OpsDialog>
      )}
    </section>
  );
}
