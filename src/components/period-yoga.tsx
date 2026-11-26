"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { OpsDialog } from "./ops-dialog";
import { YogaVideoFields } from "./yoga-video-fields";
import { parseScheduleVideoUrl } from "@/lib/schedule-category";
import "./period-yoga.css";
type Video = {
  id: string;
  title: string;
  video_url: string;
  duration_minutes: number | null;
  notes: string;
  updated_at: string;
};
type Page = { items: Video[]; nextOffset: number | null };
function safeLink(url: string) {
  try {
    return parseScheduleVideoUrl(url);
  } catch {
    return "";
  }
}
export function PeriodYoga({
  onSessionExpired,
}: {
  onSessionExpired?: () => void;
}) {
  const [items, setItems] = useState<Video[]>([]),
    [next, setNext] = useState<number | null>(null);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [editor, setEditor] = useState<Video | null>(null),
    [remove, setRemove] = useState<Video | null>(null);
  const [notice, setNotice] = useState("");
  const lock = useRef(false);
  const call = useCallback(
    async <T,>(query: string, options?: RequestInit): Promise<T> => {
      const response = await fetch("/api/period-yoga" + query, {
        ...options,
        cache: "no-store",
        signal: options?.signal
          ? AbortSignal.any([options.signal, AbortSignal.timeout(25000)])
          : AbortSignal.timeout(25000),
      });
      const data = await response.json();
      if (response.status === 401) onSessionExpired?.();
      if (!response.ok)
        throw new Error(data.error || "영상을 불러오지 못했어요.");
      return data;
    },
    [onSessionExpired],
  );
  const load = useCallback(
    async (offset = 0, signal?: AbortSignal) => {
      setLoading(true);
      setError("");
      try {
        const data = await call<Page>(`?offset=${offset}`, { signal });
        if (signal?.aborted) return;
        setItems((old) =>
          offset
            ? [
                ...old,
                ...data.items.filter(
                  (item) => !old.some((row) => row.id === item.id),
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
  function open(item?: Video) {
    setError("");
    setEditor(
      item || {
        id: crypto.randomUUID(),
        title: "",
        video_url: "",
        duration_minutes: null,
        notes: "",
        updated_at: "",
      },
    );
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || !editor) return;
    const fields = new FormData(event.currentTarget),
      minutes = String(fields.get("duration_minutes") || "");
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await call("", {
        method: editor.updated_at ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editor.id,
          title: fields.get("title"),
          video_url: fields.get("video_url"),
          duration_minutes: minutes ? Number(minutes) : null,
          notes: fields.get("notes") || "",
          ...(editor.updated_at
            ? { expectedUpdatedAt: editor.updated_at }
            : {}),
        }),
      });
      setEditor(null);
      setNotice("영상을 보관했어요.");
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
  async function erase() {
    if (lock.current || !remove) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await call("", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: remove.id,
          expectedUpdatedAt: remove.updated_at,
        }),
      });
      setRemove(null);
      setNotice("보관한 영상을 삭제했어요.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "삭제하지 못했어요.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="period-yoga" aria-labelledby="period-yoga-title">
      <header>
        <div>
          <h2 id="period-yoga-title">🌷 생리 때 할 요가</h2>
          <p>그때 꺼내 볼 영상을 따로 모아두세요.</p>
        </div>
        <button type="button" onClick={() => open()} disabled={busy}>
          ＋ 영상 추가
        </button>
      </header>
      <p className="period-yoga-hint">
        날짜와 상관없이 보관하는 영상 모음이에요. 이 칸에 추가한 영상은 밤 9시
        알림에 포함되지 않아요.
      </p>
      {notice && <p role="status">{notice}</p>}
      {error && !editor && !remove && (
        <p role="alert">
          {error} <button onClick={() => void load()}>다시 불러오기</button>
        </p>
      )}
      {loading && <p role="status">영상을 불러오고 있어요.</p>}
      {!loading && !error && !items.length && (
        <p className="period-yoga-empty">
          편하게 하고 싶은 요가 영상 링크를 넣어 두세요.
          <br />
          제목과 운동 시간, 짧은 메모도 함께 볼 수 있어요.
        </p>
      )}
      <div className="period-yoga-list">
        {items.map((item) => (
          <article key={item.id}>
            <h3>{item.title}</h3>
            {item.duration_minutes && (
              <span className="period-yoga-minutes">
                {item.duration_minutes}분
              </span>
            )}
            {item.notes && <p className="period-yoga-notes">{item.notes}</p>}
            <div className="period-yoga-actions">
              {safeLink(item.video_url) && (
                <a
                  href={safeLink(item.video_url)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  영상 보기 ↗
                </a>
              )}
              <button onClick={() => open(item)}>수정</button>
              <button
                aria-label={`${item.title} 보관 삭제`}
                onClick={() => {
                  setError("");
                  setRemove(item);
                }}
              >
                삭제
              </button>
            </div>
          </article>
        ))}
      </div>
      {next !== null && (
        <button disabled={loading} onClick={() => void load(next)}>
          영상 더 보기
        </button>
      )}
      {editor && (
        <OpsDialog
          title={
            editor.updated_at ? "보관한 요가 수정" : "생리 때 할 요가 추가"
          }
          busy={busy}
          close={() => {
            setEditor(null);
            setError("");
          }}
        >
          <form className="period-yoga-form" onSubmit={save}>
            <YogaVideoFields
              initialTitle={editor.title}
              initialUrl={editor.video_url}
              initialMinutes={editor.duration_minutes}
              durationReady
              disabled={busy}
            />
            <label>
              메모 (선택)
              <textarea
                name="notes"
                defaultValue={editor.notes}
                maxLength={2000}
                rows={3}
                disabled={busy}
                placeholder="기억해 둘 내용이나 원하는 동작"
              />
            </label>
            {error && <p role="alert">{error}</p>}
            <button disabled={busy}>{busy ? "저장 중…" : "보관하기"}</button>
          </form>
        </OpsDialog>
      )}
      {remove && (
        <OpsDialog
          title="보관한 요가 삭제"
          busy={busy}
          close={() => {
            setRemove(null);
            setError("");
          }}
        >
          <p>
            ‘{remove.title}’을 이 모음에서 삭제할까요? 삭제하면 되돌릴 수
            없어요.
          </p>
          {error && <p role="alert">{error}</p>}
          <button disabled={busy} onClick={() => void erase()}>
            {busy ? "삭제 중…" : "삭제하기"}
          </button>
        </OpsDialog>
      )}
    </section>
  );
}
