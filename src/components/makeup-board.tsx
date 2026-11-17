"use client";

import Image from "next/image";
import {
  Bookmark,
  BookmarkCheck,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  Images,
  Plus,
  Trash2,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { seoulDate } from "@/lib/ops";
import { moveYogaDay, yogaWeek } from "@/lib/yoga-week";
import { OpsDialog } from "./ops-dialog";
import "./makeup-board.css";

type LookCategory = "female" | "male" | null;
type CategoryFilter = "all" | "unclassified" | NonNullable<LookCategory>;
const categoryLabels = {
  all: "전체",
  female: "여자",
  male: "남자",
  unclassified: "미분류",
} as const;
const categories = ["female", "male", "unclassified"] as const;
type Look = {
  id: string;
  title: string;
  created_at: string;
  picked: boolean;
  category: LookCategory;
};
type Page = { items: Look[]; nextOffset: number | null };
type Photo = { id: string; image: Blob; thumbnail: Blob };
type SessionProps = { onSessionExpired: () => void };
const endpoint = "/api/makeup-looks";

class BoardError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const timeout = AbortSignal.timeout(45000);
  const response = await fetch(url, {
    ...options,
    cache: "no-store",
    signal: options?.signal
      ? AbortSignal.any([options.signal, timeout])
      : timeout,
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new BoardError(
      detail.error || "사진 보관함에 연결하지 못했어요.",
      response.status,
    );
  }
  return response.json() as Promise<T>;
}

function failure(error: unknown) {
  return error instanceof BoardError
    ? error.message
    : "응답을 확인하지 못했어요. 연결을 확인하고 다시 시도해 주세요.";
}

function usePhotoList(
  week: string,
  picked: boolean,
  filter: CategoryFilter,
  onSessionExpired: () => void,
) {
  const [page, setPage] = useState<Page | null>(null);
  const [retryOffset, setRetryOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const current = useRef<AbortController | null>(null);

  const load = useCallback(
    async (offset = 0) => {
      current.current?.abort();
      const controller = new AbortController();
      current.current = controller;
      try {
        const query = new URLSearchParams({ week, offset: String(offset) });
        if (picked) query.set("picked", "true");
        if (filter !== "all") query.set("category", filter);
        const result = await request<Page>(`${endpoint}?${query}`, {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setError("");
        setPage((previous) => {
          if (!offset || !previous) return result;
          const items = new Map(previous.items.map((item) => [item.id, item]));
          for (const item of result.items) items.set(item.id, item);
          return {
            items: Array.from(items.values()),
            nextOffset: result.nextOffset,
          };
        });
      } catch (cause) {
        if (controller.signal.aborted) return;
        setRetryOffset(offset);
        setError(failure(cause));
        if (cause instanceof BoardError && cause.status === 401)
          onSessionExpired();
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [week, picked, filter, onSessionExpired],
  );

  useEffect(() => {
    let mounted = true;
    queueMicrotask(() => {
      if (mounted) void load();
    });
    return () => {
      mounted = false;
      current.current?.abort();
    };
  }, [load]);
  function reload(offset = 0) {
    setLoading(true);
    setError("");
    return load(offset);
  }
  return { page, loading, error, load: reload, setPage, retryOffset };
}

function blobFromCanvas(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error())),
      "image/jpeg",
      quality,
    ),
  );
}

async function scaledJpeg(
  image: HTMLImageElement,
  edge: number,
  limit: number,
) {
  const canvas = document.createElement("canvas");
  const scale = Math.min(
    1,
    edge / Math.max(image.naturalWidth, image.naturalHeight),
  );
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error();
  try {
    for (;;) {
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await blobFromCanvas(canvas, 0.86);
      if (blob.size <= limit) return blob;
      canvas.width = Math.max(1, Math.floor(canvas.width * 0.76));
      canvas.height = Math.max(1, Math.floor(canvas.height * 0.76));
    }
  } finally {
    canvas.width = canvas.height = 1;
  }
}

async function preparePhoto(file: File): Promise<Photo> {
  if (file.size > 40 * 1024 * 1024)
    throw new Error("40MB 이하 사진을 선택해 주세요.");
  const src = URL.createObjectURL(file);
  try {
    const image = new window.Image();
    image.src = src;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) throw new Error();
    const full = await scaledJpeg(image, 1600, 1024 * 1024);
    const thumbnail = await scaledJpeg(image, 480, 64 * 1024);
    return { id: crypto.randomUUID(), image: full, thumbnail };
  } catch {
    throw new Error(
      "이 사진을 읽지 못했어요. JPG, PNG 또는 화면 캡처로 다시 선택해 주세요.",
    );
  } finally {
    URL.revokeObjectURL(src);
  }
}

function shortDate(iso: string) {
  return `${Number(iso.slice(5, 7))}.${Number(iso.slice(8, 10))}`;
}

type GalleryState = ReturnType<typeof usePhotoList>;
function PhotoList({
  list,
  picked,
  weekName,
  filter,
  disabled,
  onOpen,
  onToggle,
  onAdd,
  hasLibrary,
}: {
  list: GalleryState;
  picked: boolean;
  weekName: string;
  filter: CategoryFilter;
  disabled: boolean;
  onOpen: (item: Look) => void;
  onToggle: (item: Look) => void;
  onAdd: () => void;
  hasLibrary: boolean;
}) {
  const { page, loading, error, load } = list;
  let emptyTitle = picked
    ? "이번에 해보고 싶은 룩이 있나요?"
    : "첫 메이크업 사진을 보관해 보세요.";
  if (filter !== "all") {
    const label = categoryLabels[filter];
    emptyTitle = picked
      ? `${weekName}에 담은 ${label} 룩이 없어요.`
      : `${label}로 분류된 사진이 없어요.`;
  }
  return (
    <>
      {page && page.items.length > 0 && (
        <ul className="makeup-grid">
          {page.items.map((item) => (
            <li className="makeup-tile" key={item.id}>
              <button
                type="button"
                className="makeup-cover"
                onClick={() => onOpen(item)}
                aria-label={`${item.title || "메이크업 사진"} 크게 보기`}
              >
                <Image
                  unoptimized
                  fill
                  sizes="(max-width: 540px) 45vw, (max-width: 900px) 30vw, 200px"
                  src={`${endpoint}/${item.id}/image?size=thumb`}
                  alt={item.title || "메이크업 참고 사진"}
                />
              </button>
              <button
                type="button"
                className="makeup-pin"
                aria-label={`${item.title || "사진"} ${weekName} ${item.picked ? "목록에서 빼기" : "목록에 담기"}`}
                aria-pressed={item.picked}
                disabled={disabled}
                onClick={() => onToggle(item)}
              >
                {item.picked ? (
                  <BookmarkCheck size={19} />
                ) : (
                  <Bookmark size={19} />
                )}
              </button>
              {(filter === "all" || item.title) && (
                <div className="makeup-caption">
                  {filter === "all" && (
                    <span className="makeup-category-tag">
                      {categoryLabels[item.category ?? "unclassified"]}
                    </span>
                  )}
                  {item.title && <span>{item.title}</span>}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {loading && (
        <p className="makeup-state" role="status">
          사진을 불러오는 중이에요…
        </p>
      )}
      {error && (
        <div className="makeup-state" role="alert">
          {error}{" "}
          <button
            type="button"
            className="makeup-link"
            onClick={() => void load(list.retryOffset)}
          >
            다시 시도
          </button>
        </div>
      )}
      {page && !loading && !error && page.items.length === 0 && (
        <div className="makeup-empty">
          {picked ? (
            <Bookmark size={25} aria-hidden="true" />
          ) : (
            <Images size={25} aria-hidden="true" />
          )}
          <div>
            <strong>{emptyTitle}</strong>
            <p>
              {picked && hasLibrary
                ? "보관함 사진의 책갈피를 누르면 여기에 모여요."
                : filter === "all"
                  ? "앨범에서 참고할 사진 한 장을 골라주세요."
                  : "사진을 추가하거나 다른 사진을 열어 분류를 바꿔주세요."}
            </p>
            {picked &&
              (hasLibrary ? (
                <a href="#makeup-archive" className="makeup-link">
                  보관함에서 고르기
                </a>
              ) : (
                <button
                  type="button"
                  onClick={onAdd}
                  className="makeup-link"
                  disabled={disabled}
                >
                  이 주에 사진 추가
                </button>
              ))}
          </div>
        </div>
      )}
      {page?.nextOffset != null && !loading && !error && (
        <button
          className="makeup-more"
          type="button"
          onClick={() => void load(page.nextOffset!)}
          disabled={disabled}
        >
          사진 더 보기
        </button>
      )}
    </>
  );
}

function CategoryPicker({
  value,
  disabled,
  onChange,
}: {
  value: LookCategory;
  disabled: boolean;
  onChange: (value: LookCategory) => void;
}) {
  return (
    <fieldset className="makeup-category-field" disabled={disabled}>
      <legend>룩 분류</legend>
      <div className="makeup-category-options">
        {categories.map((category) => (
          <button
            type="button"
            key={category}
            aria-pressed={(value ?? "unclassified") === category}
            onClick={() =>
              onChange(category === "unclassified" ? null : category)
            }
          >
            {categoryLabels[category]}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function UploadDialog({
  weekName,
  defaultPick,
  initialCategory,
  close,
  save,
  busy,
  error,
}: {
  weekName: string;
  defaultPick: boolean;
  initialCategory: LookCategory;
  close: () => void;
  save: (
    photo: Photo,
    title: string,
    picked: boolean,
    category: LookCategory,
  ) => void;
  busy: boolean;
  error: string;
}) {
  const [photo, setPhoto] = useState<(Photo & { preview: string }) | null>(
    null,
  );
  const [preparing, setPreparing] = useState(false);
  const [title, setTitle] = useState("");
  const [picked, setPicked] = useState(defaultPick);
  const [category, setCategory] = useState(initialCategory);
  const [notice, setNotice] = useState("");
  const preview = photo?.preview;
  const sequence = useRef(0);
  useEffect(
    () => () => {
      sequence.current++;
    },
    [],
  );
  useEffect(() => {
    if (preview) return () => URL.revokeObjectURL(preview);
  }, [preview]);
  async function choose(file?: File) {
    if (!file) return;
    const turn = ++sequence.current;
    setPreparing(true);
    setPhoto(null);
    setNotice("");
    try {
      const prepared = await preparePhoto(file);
      if (turn === sequence.current)
        setPhoto({ ...prepared, preview: URL.createObjectURL(prepared.image) });
    } catch (cause) {
      if (turn === sequence.current)
        setNotice(
          cause instanceof Error ? cause.message : "사진을 읽지 못했어요.",
        );
    } finally {
      if (turn === sequence.current) setPreparing(false);
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!photo || preparing || busy) return;
    save(photo, title.trim(), picked, category);
  }
  return (
    <OpsDialog title="메이크업 사진 추가" busy={busy} close={close}>
      <form className="makeup-form" onSubmit={submit}>
        <label className="makeup-upload">
          {preview && (
            <Image
              unoptimized
              src={preview}
              fill
              alt="선택한 사진 미리보기"
              sizes="420px"
            />
          )}
          <span>
            <ImagePlus size={20} aria-hidden="true" />
            {preparing
              ? "사진 준비 중…"
              : photo
                ? "다른 사진 선택"
                : "앨범에서 사진 선택"}
          </span>
          <input
            type="file"
            accept="image/*"
            aria-label="메이크업 사진 선택"
            disabled={busy}
            onChange={(event) => void choose(event.target.files?.[0])}
          />
        </label>
        <label className="makeup-name">
          룩 이름 <span>(선택)</span>
          <input
            type="text"
            name="title"
            maxLength={100}
            placeholder="예: 로즈 브라운 스모키"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            disabled={busy}
          />
        </label>
        <input type="hidden" name="category" value={category ?? ""} />
        <CategoryPicker
          value={category}
          disabled={busy}
          onChange={setCategory}
        />
        <label className="makeup-choice">
          <input
            type="checkbox"
            name="picked"
            checked={picked}
            onChange={(event) => setPicked(event.target.checked)}
            disabled={busy}
          />
          {weekName} 할 메이크업에도 담기
        </label>
        {(notice || error) && (
          <p className="makeup-error" role="alert">
            {notice || error}
          </p>
        )}
        <button
          type="submit"
          className="makeup-primary"
          disabled={!photo || preparing || busy}
        >
          사진 저장
        </button>
      </form>
    </OpsDialog>
  );
}

function WeekBoard({
  week,
  filter,
  busy,
  setBusy,
  onWeek,
  onSessionExpired,
}: SessionProps & {
  week: string;
  filter: CategoryFilter;
  busy: boolean;
  setBusy: (value: boolean) => void;
  onWeek: (week: string) => void;
}) {
  const archive = usePhotoList(week, false, filter, onSessionExpired);
  const weekly = usePhotoList(week, true, filter, onSessionExpired);
  const [upload, setUpload] = useState<boolean | null>(null);
  const [detail, setDetail] = useState<Look | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  const todayWeek = yogaWeek(seoulDate())![0];
  const weekName = todayWeek === week ? "이번 주" : "선택한 주";
  const blocked = busy || archive.loading || weekly.loading;

  async function change<T>(
    method: string,
    body: FormData | object,
    done: (result: T) => void,
  ) {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setNotice("");
    setError("");
    try {
      const result = await request<T>(endpoint, {
        method,
        signal: controller.signal,
        headers:
          body instanceof FormData
            ? undefined
            : { "Content-Type": "application/json" },
        body: body instanceof FormData ? body : JSON.stringify(body),
      });
      if (!controller.signal.aborted) done(result);
    } catch (cause) {
      if (controller.signal.aborted) return;
      setError(failure(cause));
      if (cause instanceof BoardError && cause.status === 401)
        onSessionExpired();
    } finally {
      if (!controller.signal.aborted) {
        active.current = null;
        setBusy(false);
      }
    }
  }

  function openUpload(pick: boolean) {
    setError("");
    setUpload(pick);
  }
  function openLook(item: Look) {
    setError("");
    setConfirmDelete(false);
    setDetail(item);
  }
  function toggle(item: Look) {
    void change<{ id: string; picked: boolean }>(
      "PATCH",
      { id: item.id, picked: !item.picked, week },
      (result) => {
        archive.setPage(
          (previous) =>
            previous && {
              ...previous,
              items: previous.items.map((row) =>
                row.id === result.id ? { ...row, picked: result.picked } : row,
              ),
            },
        );
        setDetail((previous) =>
          previous?.id === result.id
            ? { ...previous, picked: result.picked }
            : previous,
        );
        void weekly.load();
        setNotice(
          result.picked
            ? `${weekName} 할 메이크업에 담았어요.`
            : `${weekName} 목록에서 뺐어요. 사진은 보관함에 있어요.`,
        );
      },
    );
  }
  function save(
    photo: Photo,
    title: string,
    picked: boolean,
    category: LookCategory,
  ) {
    const form = new FormData();
    form.set("id", photo.id);
    form.set("title", title);
    form.set("image", photo.image, "look.jpg");
    form.set("thumbnail", photo.thumbnail, "thumb.jpg");
    if (category) form.set("category", category);
    if (picked) form.set("week", week);
    void change("POST", form, () => {
      setUpload(null);
      setNotice(
        `${categoryLabels[category ?? "unclassified"]} 사진을 저장했어요.`,
      );
      void archive.load();
      if (picked) void weekly.load();
    });
  }
  function classify(item: Look, category: LookCategory) {
    if (category === (item.category ?? null)) return;
    void change("PATCH", { id: item.id, category }, () => {
      setDetail((previous) =>
        previous?.id === item.id ? { ...previous, category } : previous,
      );
      void archive.load();
      void weekly.load();
      setNotice("룩 분류를 저장했어요.");
    });
  }
  function remove(item: Look) {
    void change("DELETE", { id: item.id }, () => {
      setDetail(null);
      setConfirmDelete(false);
      setNotice("보관함에서 사진을 삭제했어요.");
      void archive.load();
      void weekly.load();
    });
  }
  function jump(days: number) {
    const target = moveYogaDay(week, days);
    if (target && yogaWeek(target)) onWeek(target);
  }
  const listProps = {
    weekName,
    filter,
    disabled: blocked,
    onOpen: openLook,
    onToggle: toggle,
    hasLibrary: Boolean(archive.page?.items.length),
  };
  return (
    <div className="makeup-board">
      <section className="makeup-week" aria-labelledby="makeup-week-title">
        <header className="makeup-week-head">
          <div className="makeup-week-title">
            <CalendarDays size={20} aria-hidden="true" />
            <h2 id="makeup-week-title">{weekName}에 할 메이크업</h2>
          </div>
          <div className="makeup-week-controls">
            <button
              type="button"
              aria-label="이전 주"
              disabled={busy}
              onClick={() => jump(-7)}
            >
              <ChevronLeft size={18} />
            </button>
            <span aria-label={`${week}부터 ${moveYogaDay(week, 6)}까지`}>
              {week.slice(0, 4)}. {shortDate(week)} –{" "}
              {shortDate(moveYogaDay(week, 6)!)}
            </span>
            <button
              type="button"
              aria-label="다음 주"
              disabled={busy}
              onClick={() => jump(7)}
            >
              <ChevronRight size={18} />
            </button>
            {week !== todayWeek && (
              <button
                type="button"
                className="makeup-current"
                disabled={busy}
                onClick={() => onWeek(todayWeek)}
              >
                이번 주
              </button>
            )}
          </div>
        </header>
        <PhotoList
          {...listProps}
          list={weekly}
          picked
          onAdd={() => openUpload(true)}
        />
      </section>
      <section
        className="makeup-archive"
        aria-labelledby="makeup-archive-title"
        id="makeup-archive"
        tabIndex={-1}
      >
        <header className="makeup-archive-head">
          <h2 id="makeup-archive-title">사진 보관함</h2>
          <button
            className="makeup-primary"
            disabled={busy}
            type="button"
            onClick={() => openUpload(false)}
          >
            <Plus size={17} />
            사진 추가
          </button>
        </header>
        <PhotoList
          {...listProps}
          list={archive}
          picked={false}
          onAdd={() => openUpload(false)}
        />
      </section>
      {!detail && upload === null && error && (
        <p className="makeup-error" role="alert">
          {error}
        </p>
      )}
      <p className="makeup-notice" role="status">
        {notice}
      </p>
      {upload !== null && (
        <UploadDialog
          weekName={weekName}
          defaultPick={upload}
          initialCategory={
            filter === "female" || filter === "male" ? filter : null
          }
          busy={busy}
          error={error}
          close={() => {
            setUpload(null);
            setError("");
          }}
          save={save}
        />
      )}
      {detail && (
        <OpsDialog
          title={detail.title || "메이크업 사진"}
          close={() => {
            setDetail(null);
            setConfirmDelete(false);
            setError("");
          }}
          busy={busy}
        >
          <div className="makeup-detail">
            <div className="makeup-full">
              <Image
                unoptimized
                fill
                sizes="(max-width: 600px) 94vw, 600px"
                src={`${endpoint}/${detail.id}/image`}
                alt={detail.title || "메이크업 참고 사진"}
              />
            </div>
            {!confirmDelete && (
              <CategoryPicker
                value={detail.category}
                disabled={blocked}
                onChange={(category) => classify(detail, category)}
              />
            )}
            {error && (
              <p role="alert" className="makeup-error">
                {error}
              </p>
            )}
            {confirmDelete ? (
              <div className="makeup-confirm">
                <p>이 사진을 보관함과 모든 주의 목록에서 삭제할까요?</p>
                <div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setConfirmDelete(false)}
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    className="makeup-danger"
                    disabled={busy}
                    onClick={() => remove(detail)}
                  >
                    사진 삭제
                  </button>
                </div>
              </div>
            ) : (
              <div className="makeup-detail-actions">
                <button
                  className="makeup-primary"
                  type="button"
                  aria-pressed={detail.picked}
                  disabled={blocked}
                  onClick={() => toggle(detail)}
                >
                  {detail.picked ? <Check size={17} /> : <Bookmark size={17} />}{" "}
                  {weekName} {detail.picked ? "목록에서 빼기" : "목록에 담기"}
                </button>
                <button
                  type="button"
                  className="makeup-delete"
                  disabled={busy}
                  aria-label="보관함에서 사진 삭제"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 size={18} />
                </button>
              </div>
            )}
          </div>
        </OpsDialog>
      )}
    </div>
  );
}

export function MakeupBoard({ onSessionExpired }: SessionProps) {
  const [week, setWeek] = useState(() => yogaWeek(seoulDate())![0]);
  const [filter, setFilter] = useState<CategoryFilter>("all");
  const [busy, setBusy] = useState(false);
  return (
    <>
      <div
        role="group"
        aria-label="메이크업 분류 필터"
        className="makeup-filter"
      >
        {(["all", ...categories] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            disabled={busy}
            onClick={() => setFilter(value)}
          >
            {categoryLabels[value]}
          </button>
        ))}
      </div>
      <WeekBoard
        key={`${week}:${filter}`}
        week={week}
        filter={filter}
        busy={busy}
        setBusy={setBusy}
        onWeek={setWeek}
        onSessionExpired={onSessionExpired}
      />
    </>
  );
}
