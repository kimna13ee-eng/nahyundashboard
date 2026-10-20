import { parseScheduleVideoUrl } from "./schedule-category.ts";

export const yogaVideoResponseLimit = 64 * 1024;
export const yogaVideoTimeout = 8000;
const videoIdPattern = /^[A-Za-z0-9_-]{11}$/;

export class YogaVideoError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "YogaVideoError";
    this.status = status;
  }
}

/** Extract only a video ID. No caller-controlled URL is ever fetched. */
export function youtubeVideoId(raw: unknown) {
  let input: string;
  try {
    input = parseScheduleVideoUrl(raw);
    if (!input) throw new Error();
  } catch {
    throw new YogaVideoError("HTTPS 영상 URL을 확인해 주세요.", 400);
  }
  const url = new URL(input);
  const youtube = ["youtube.com", "www.youtube.com", "m.youtube.com"];
  let id: string | null = null;
  if (!url.port && url.hostname === "youtu.be")
    id = /^\/([A-Za-z0-9_-]{11})\/?$/.exec(url.pathname)?.[1] ?? null;
  else if (!url.port && youtube.includes(url.hostname)) {
    if (url.pathname === "/watch" && url.searchParams.getAll("v").length === 1)
      id = url.searchParams.get("v");
    else
      id =
        /^\/(?:shorts|embed)\/([A-Za-z0-9_-]{11})\/?$/.exec(
          url.pathname,
        )?.[1] ?? null;
  }
  if (!id || !videoIdPattern.test(id))
    throw new YogaVideoError(
      "제목 불러오기는 YouTube 영상 링크만 지원합니다. 제목과 운동 시간은 직접 입력할 수 있어요.",
      422,
    );
  return id;
}

export function youtubeOembedUrl(raw: unknown) {
  const id = youtubeVideoId(raw);
  const url = new URL("https://www.youtube.com/oembed");
  url.searchParams.set("url", `https://www.youtube.com/watch?v=${id}`);
  url.searchParams.set("format", "json");
  return url;
}

async function readResponse(response: Response) {
  if (
    !response.body ||
    Number(response.headers.get("content-length")) > yogaVideoResponseLimit
  ) {
    await response.body?.cancel();
    throw new YogaVideoError("영상 제목 응답을 확인하지 못했습니다.", 502);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let text = "";
  let bytes = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      bytes += result.value.byteLength;
      if (bytes > yogaVideoResponseLimit)
        throw new YogaVideoError("영상 제목 응답을 확인하지 못했습니다.", 502);
      text += decoder.decode(result.value, { stream: true });
    }
    return text + decoder.decode();
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}

export function parseYoutubeVideoTitle(raw: unknown) {
  if (
    !raw ||
    typeof raw !== "object" ||
    Array.isArray(raw) ||
    (raw as Record<string, unknown>).type !== "video" ||
    typeof (raw as Record<string, unknown>).title !== "string"
  )
    throw new YogaVideoError("영상 제목 응답을 확인하지 못했습니다.", 502);
  // oEmbed's title is text. Ignore HTML, thumbnails, author data, and all other
  // fields. The caller renders this string as text, never as markup.
  const text = (raw as { title: string }).title
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text)
    throw new YogaVideoError("영상 제목 응답을 확인하지 못했습니다.", 502);
  // Match the existing title validator/input's 120 UTF-16 code unit limit,
  // without splitting an emoji surrogate pair.
  const title = text.slice(0, 120).replace(/[\uD800-\uDBFF]$/, "");
  return { title, titleTruncated: title.length < text.length };
}

export async function fetchYogaVideoTitle(
  raw: unknown,
  fetcher: typeof fetch = fetch,
) {
  const url = youtubeOembedUrl(raw);
  try {
    const response = await fetcher(url, {
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer",
      signal: AbortSignal.timeout(yogaVideoTimeout),
      headers: { Accept: "application/json" },
    });
    if (
      !response.ok ||
      !/^application\/(?:json|json\+oembed)(?:\s*;|$)/i.test(
        response.headers.get("content-type") || "",
      )
    ) {
      await response.body?.cancel();
      throw new YogaVideoError(
        "영상 제목을 불러오지 못했습니다. 공개 영상인지 확인하거나 제목을 직접 입력해 주세요.",
        502,
      );
    }
    return parseYoutubeVideoTitle(JSON.parse(await readResponse(response)));
  } catch (error) {
    if (error instanceof YogaVideoError) throw error;
    if (
      error instanceof Error &&
      ["AbortError", "TimeoutError"].includes(error.name)
    )
      throw new YogaVideoError(
        "영상 제목 조회가 지연되고 있습니다. 잠시 후 다시 시도해 주세요.",
        504,
      );
    // Provider errors may contain the full fetch URL. Never return them.
    throw new YogaVideoError(
      "영상 제목을 불러오지 못했습니다. 제목을 직접 입력해 주세요.",
      502,
    );
  }
}
