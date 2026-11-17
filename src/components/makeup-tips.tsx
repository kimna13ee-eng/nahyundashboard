"use client";

import Image from "next/image";
import { ChevronRight, ImagePlus, Plus } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { BoardError, failure, request } from "@/lib/makeup-request";
import { preparePhoto } from "@/lib/prepare-photo";
import { OpsDialog } from "./ops-dialog";
import "./makeup-tips.css";

const endpoint = "/api/makeup-tips";
type Tip = {
  id: string;
  content: string;
  has_photo: boolean;
  created_at: string;
  updated_at: string;
};
type Page = { items: Tip[]; nextOffset: number | null };
const compactCount = 3;
const dateFormat = new Intl.DateTimeFormat("ko-KR", {
  month: "short",
  day: "numeric",
  timeZone: "Asia/Seoul",
});

function imageUrl(tip: Tip, thumbnail = false) {
  const params = new URLSearchParams({ v: tip.updated_at });
  if (thumbnail) params.set("size", "thumb");
  return `${endpoint}/${tip.id}/image?${params}`;
}

function TipDialog({
  original,
  close,
  reload,
  onSessionExpired,
}: {
  original: Tip | null;
  close: () => void;
  reload: () => void;
  onSessionExpired: () => void;
}) {
  const [mode, setMode] = useState<"view" | "edit" | "delete">(
    original ? "view" : "edit",
  );
  const [id] = useState(() => original?.id ?? crypto.randomUUID());
  const [content, setContent] = useState(original?.content ?? "");
  const [photo, setPhoto] = useState<
    (Awaited<ReturnType<typeof preparePhoto>> & { preview: string }) | null
  >(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [uncertainCreate, setUncertainCreate] = useState(false);
  const operation = useRef<AbortController | null>(null);
  useEffect(() => () => operation.current?.abort(), []);
  useEffect(
    () => () => {
      if (photo) URL.revokeObjectURL(photo.preview);
    },
    [photo],
  );
  const preview =
    photo?.preview ??
    (original?.has_photo && !removeImage ? imageUrl(original, true) : null);
  const length = Array.from(content.trim()).length;
  const canSave = !conflict && length <= 1500 && Boolean(length || preview);

  async function choose(file?: File) {
    if (!file || operation.current) return;
    const controller = new AbortController();
    operation.current = controller;
    setError("");
    setWorking(true);
    try {
      const selected = await preparePhoto(file);
      if (!controller.signal.aborted) {
        setPhoto({
          ...selected,
          preview: URL.createObjectURL(selected.thumbnail),
        });
        setRemoveImage(false);
      }
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(
          cause instanceof Error ? cause.message : "사진을 읽지 못했어요.",
        );
    } finally {
      if (!controller.signal.aborted) {
        operation.current = null;
        setWorking(false);
      }
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (operation.current || conflict || (mode !== "delete" && !canSave))
      return;
    const controller = new AbortController();
    operation.current = controller;
    setWorking(true);
    setError("");
    try {
      const options: RequestInit = { signal: controller.signal };
      if (mode === "delete" && original) {
        options.method = "DELETE";
        options.headers = { "Content-Type": "application/json" };
        options.body = JSON.stringify({
          id,
          expectedUpdatedAt: original.updated_at,
        });
      } else {
        const form = new FormData();
        form.set("id", id);
        form.set("content", content.trim());
        if (original) form.set("expectedUpdatedAt", original.updated_at);
        if (photo) {
          form.set("image", photo.image, "tip.jpg");
          form.set("thumbnail", photo.thumbnail, "thumb.jpg");
        } else if (removeImage && original?.has_photo)
          form.set("removeImage", "true");
        options.method = original ? "PATCH" : "POST";
        options.body = form;
      }
      await request(endpoint, options);
      if (controller.signal.aborted) return;
      close();
      reload();
    } catch (cause) {
      if (controller.signal.aborted) return;
      setError(failure(cause));
      if (cause instanceof BoardError && cause.status === 401)
        onSessionExpired();
      else if (
        cause instanceof BoardError &&
        (cause.status === 409 || cause.status === 404)
      ) {
        setConflict(true);
        reload();
      } else if (
        !original &&
        (!(cause instanceof BoardError) || cause.status >= 500)
      ) {
        // Keep the original ID, bytes and memo together if the server already saved them.
        setUncertainCreate(true);
      }
    } finally {
      if (!controller.signal.aborted) {
        operation.current = null;
        setWorking(false);
      }
    }
  }

  const title =
    mode === "view"
      ? "메이크업 팁"
      : mode === "delete"
        ? "메이크업 팁 삭제"
        : original
          ? "메이크업 팁 수정"
          : "메이크업 팁 추가";
  return (
    <OpsDialog key={mode} title={title} busy={working} close={close}>
      {mode === "view" && original ? (
        <div className="tip-detail">
          {original.has_photo && (
            <a
              className="tip-photo-link"
              href={imageUrl(original)}
              target="_blank"
              rel="noopener"
              aria-label="사진 원본 열기"
            >
              <Image
                unoptimized
                src={imageUrl(original)}
                width={640}
                height={480}
                alt="메이크업 팁 사진"
              />
            </a>
          )}
          {original.content && <p className="tip-memo">{original.content}</p>}
          <div className="tip-actions">
            <button
              type="button"
              className="tip-delete"
              onClick={() => setMode("delete")}
            >
              삭제
            </button>
            <button
              type="button"
              className="tip-primary"
              onClick={() => setMode("edit")}
            >
              수정
            </button>
          </div>
        </div>
      ) : (
        <form className="tip-detail" onSubmit={submit}>
          {mode === "delete" ? (
            <p>
              이 메이크업 팁을 삭제할까요? 저장한 사진과 메모도 함께 삭제돼요.
            </p>
          ) : (
            <>
              {preview && (
                <div className="tip-editor-photo">
                  <Image
                    unoptimized
                    src={preview}
                    width={480}
                    height={320}
                    alt="선택한 사진 미리보기"
                  />
                  <button
                    type="button"
                    disabled={working || uncertainCreate}
                    onClick={() => {
                      setPhoto(null);
                      setRemoveImage(Boolean(original?.has_photo));
                    }}
                  >
                    첨부 해제
                  </button>
                </div>
              )}
              <label className="tip-file">
                <ImagePlus size={19} aria-hidden="true" />{" "}
                {preview ? "사진 교체" : "사진·캡처 추가"}
                <input
                  type="file"
                  accept="image/*"
                  aria-label="팁 사진 선택"
                  disabled={working || uncertainCreate}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    void choose(file);
                  }}
                />
              </label>
              <input
                type="hidden"
                name="attachment"
                value={photo?.id ?? (removeImage ? "removed" : "")}
              />
              <label className="tip-memo-field">
                팁 메모
                <textarea
                  name="content"
                  value={content}
                  rows={4}
                  disabled={working || uncertainCreate}
                  onChange={(event) => setContent(event.target.value)}
                  placeholder="예: 블러셔는 볼 중앙에서 바깥쪽으로 옅게 펴기"
                />
              </label>
              {length > 1500 && (
                <p role="alert" className="tip-error">
                  메모를 1,500자 이내로 줄여 주세요.
                </p>
              )}
            </>
          )}
          {error && (
            <p role="alert" className="tip-error">
              {error}
              {conflict && " 목록에서 팁을 다시 열어 주세요."}
            </p>
          )}
          <div className="tip-actions">
            <button type="button" data-dialog-close disabled={working}>
              취소
            </button>
            <button
              className={mode === "delete" ? "tip-danger" : "tip-primary"}
              type="submit"
              disabled={working || conflict || (mode !== "delete" && !canSave)}
            >
              {mode === "delete"
                ? "팁 삭제"
                : uncertainCreate
                  ? "다시 저장"
                  : "저장"}
            </button>
          </div>
        </form>
      )}
    </OpsDialog>
  );
}

export function MakeupTips({
  onSessionExpired,
  children,
}: {
  onSessionExpired: () => void;
  children: (panel: ReactNode) => ReactNode;
}) {
  const [page, setPage] = useState<Page>({ items: [], nextOffset: null });
  const [expanded, setExpanded] = useState(false);
  const [opened, setOpened] = useState<Tip | "new" | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const loadRequest = useRef<AbortController | null>(null);
  const expired = useRef(onSessionExpired);
  useEffect(() => {
    expired.current = onSessionExpired;
  }, [onSessionExpired]);
  const load = useCallback(async (offset = 0) => {
    loadRequest.current?.abort();
    const controller = new AbortController();
    loadRequest.current = controller;
    setError("");
    setLoading(true);
    try {
      const next = await request<Page>(endpoint + "?offset=" + offset, {
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setPage((previous) => {
        if (!offset) return next;
        const unique = new Map(previous.items.map((tip) => [tip.id, tip]));
        for (const tip of next.items) unique.set(tip.id, tip);
        return { items: [...unique.values()], nextOffset: next.nextOffset };
      });
    } catch (cause) {
      if (controller.signal.aborted) return;
      setError(failure(cause));
      if (cause instanceof BoardError && cause.status === 401)
        expired.current();
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) void load();
    });
    return () => {
      active = false;
      loadRequest.current?.abort();
    };
  }, [load]);

  const visible = expanded ? page.items : page.items.slice(0, compactCount);
  const panel = (
    <section className="makeup-tips" aria-labelledby="makeup-tips-heading">
      <header className="tip-head">
        <h2 id="makeup-tips-heading">메이크업 팁</h2>
        <button
          type="button"
          aria-haspopup="dialog"
          className="tip-primary"
          onClick={() => setOpened("new")}
        >
          <Plus size={16} aria-hidden="true" /> 팁 추가
        </button>
      </header>
      {visible.length > 0 && (
        <ul className="tip-list">
          {visible.map((tip) => (
            <li key={tip.id}>
              <button
                type="button"
                aria-haspopup="dialog"
                aria-label={`${tip.content || "사진으로 저장한 팁"} 자세히 보기`}
                onClick={() => setOpened(tip)}
              >
                {tip.has_photo && (
                  <Image
                    unoptimized
                    src={imageUrl(tip, true)}
                    width={60}
                    height={60}
                    alt=""
                  />
                )}
                <span className="tip-excerpt">
                  <span>{tip.content || "사진으로 저장한 팁"}</span>
                  <time dateTime={tip.created_at}>
                    {dateFormat.format(new Date(tip.created_at))}
                  </time>
                </span>
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {loading && (
        <p className="tip-state" role="status">
          팁을 불러오는 중이에요…
        </p>
      )}
      {error && (
        <p className="tip-error" role="alert">
          {error}{" "}
          <button
            type="button"
            className="tip-link"
            onClick={() => void load()}
          >
            다시 시도
          </button>
        </p>
      )}
      {!error && !loading && !visible.length && (
        <p className="tip-state">
          기억하고 싶은 메이크업 팁을 사진이나 메모로 담아보세요.
        </p>
      )}
      {page.items.length > compactCount && (
        <div className="tip-pages">
          {!expanded ? (
            <button
              type="button"
              className="tip-link"
              onClick={() => setExpanded(true)}
            >
              팁 더 보기
            </button>
          ) : (
            <>
              {page.nextOffset !== null && (
                <button
                  type="button"
                  className="tip-link"
                  disabled={loading}
                  onClick={() => void load(page.nextOffset!)}
                >
                  팁 더 보기
                </button>
              )}
              <button
                type="button"
                className="tip-link"
                onClick={() => setExpanded(false)}
              >
                접기
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
  return (
    <>
      {children(panel)}
      {opened !== null && (
        <TipDialog
          original={opened === "new" ? null : opened}
          close={() => setOpened(null)}
          reload={() => void load()}
          onSessionExpired={onSessionExpired}
        />
      )}
    </>
  );
}
