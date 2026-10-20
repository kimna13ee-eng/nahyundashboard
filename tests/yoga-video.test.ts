import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fetchYogaVideoTitle,
  parseYoutubeVideoTitle,
  youtubeOembedUrl,
  youtubeVideoId,
  YogaVideoError,
  yogaVideoResponseLimit,
  yogaVideoTimeout,
} from "../src/lib/yoga-video.ts";

const id = "M7lc1UVf-VE";
const video = `https://www.youtube.com/watch?v=${id}`;
const headers = { "Content-Type": "application/json; charset=utf-8" };
const metadata = { type: "video", title: "오늘의 요가" };

test("YouTube의 정확한 호스트·영상 경로만 ID로 읽고 upstream 주소는 고정", () => {
  for (const input of [
    video,
    `https://youtube.com/watch?v=${id}&t=120&feature=share`,
    `https://m.youtube.com/watch?v=${id}`,
    `https://www.youtube.com/shorts/${id}?feature=share`,
    `https://youtube.com/embed/${id}/`,
    `https://youtu.be/${id}?si=share-id#t=30`,
  ]) {
    assert.equal(youtubeVideoId(input), id);
    const upstream = youtubeOembedUrl(input);
    assert.equal(upstream.origin, "https://www.youtube.com");
    assert.equal(upstream.pathname, "/oembed");
    assert.deepEqual(
      [...upstream.searchParams],
      [
        ["url", video],
        ["format", "json"],
      ],
    );
  }
  for (const input of [
    "https://video.example/yoga",
    `https://www.youtube.com.evil.example/watch?v=${id}`,
    `https://notyoutube.com/watch?v=${id}`,
    `https://evil.youtube.com/watch?v=${id}`,
    `https://www.youtu.be/${id}`,
    `https://www.youtube.com:444/watch?v=${id}`,
    `https://www.youtube.com/redirect?q=${encodeURIComponent(video)}`,
    `https://www.youtube.com/watch?v=${id}&v=${id}`,
    `https://www.youtube.com/watch?v=${id}x`,
    "https://www.youtube.com/watch?v=short",
    `https://youtu.be/${id}/extra`,
    `https://youtube.com/embed/${id}extra`,
    "https://www.youtube.com/playlist?list=example",
  ])
    assert.throws(
      () => youtubeVideoId(input),
      (error) => error instanceof YogaVideoError && error.status === 422,
    );
});

test("불량·인증정보·비밀 쿼리를 포함한 영상 URL은 조회 전에 거절", async () => {
  let fetched = 0;
  const fetcher: typeof fetch = async () => {
    fetched++;
    throw new Error("Must not fetch");
  };
  for (const input of [
    null,
    undefined,
    {},
    "",
    "not a URL",
    `http://www.youtube.com/watch?v=${id}`,
    `//www.youtube.com/watch?v=${id}`,
    `https://user:password@www.youtube.com/watch?v=${id}`,
    `${video}&access_token=private`,
    `${video}#password=private`,
    "javascript:alert(1)",
  ])
    await assert.rejects(
      fetchYogaVideoTitle(input, fetcher),
      (error) => error instanceof YogaVideoError && error.status === 400,
    );
  await assert.rejects(
    fetchYogaVideoTitle("https://video.example/yoga", fetcher),
  );
  assert.equal(fetched, 0);
});

test("영상 제목 조회는 8초·리다이렉트 금지·쿠키 없이 고정 canonical URL만 요청", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async (input, init) => {
    calls++;
    assert.equal(String(input), youtubeOembedUrl(video).toString());
    assert.equal(init?.credentials, "omit");
    assert.equal(init?.redirect, "error");
    assert.equal(init?.cache, "no-store");
    assert.equal(init?.referrerPolicy, "no-referrer");
    assert.deepEqual(init?.headers, { Accept: "application/json" });
    assert.ok(init?.signal instanceof AbortSignal);
    assert.equal(yogaVideoTimeout, 8000);
    return new Response(
      JSON.stringify({
        ...metadata,
        html: '<iframe src="https://evil.example"></iframe>',
        thumbnail_url: "https://evil.example/image.png",
        author_name: "unused",
        duration: 999,
      }),
      { headers },
    );
  };
  assert.deepEqual(await fetchYogaVideoTitle(`${video}&t=50`, fetcher), {
    title: "오늘의 요가",
    titleTruncated: false,
  });
  assert.equal(calls, 1);
});

test("제목은 공백을 정리한 일반 텍스트이며 120자 제한에서 이모지를 자르지 않음", () => {
  assert.deepEqual(
    parseYoutubeVideoTitle({ type: "video", title: " \u0000오늘\n 요가\t🧘 " }),
    { title: "오늘 요가 🧘", titleTruncated: false },
  );
  const text = '<img src=x onerror="alert(1)">';
  assert.deepEqual(parseYoutubeVideoTitle({ type: "video", title: text }), {
    title: text,
    titleTruncated: false,
  });
  assert.deepEqual(
    parseYoutubeVideoTitle({ type: "video", title: "가".repeat(121) }),
    { title: "가".repeat(120), titleTruncated: true },
  );
  assert.deepEqual(
    parseYoutubeVideoTitle({ type: "video", title: "가".repeat(119) + "🧘" }),
    { title: "가".repeat(119), titleTruncated: true },
  );
  for (const raw of [
    null,
    [],
    {},
    { title: "제목" },
    { type: "video", title: 1 },
    { type: "video", title: " \n " },
  ])
    assert.throws(() => parseYoutubeVideoTitle(raw));
});

test("upstream 리다이렉트·비 JSON·불량 본문과 제한 초과 응답은 반환하지 않음", async () => {
  const responses = [
    () =>
      new Response("", {
        status: 302,
        headers: { Location: "https://evil.example" },
      }),
    () => new Response("private", { status: 404 }),
    () =>
      new Response("<html>secret</html>", {
        headers: { "Content-Type": "text/html" },
      }),
    () => new Response("invalid-json", { headers }),
    () => new Response("null", { headers }),
    () =>
      new Response(JSON.stringify({ type: "video", title: "" }), { headers }),
    () => new Response(new Uint8Array([0xff]), { headers }),
    () =>
      new Response("{}", {
        headers: {
          ...headers,
          "Content-Length": String(yogaVideoResponseLimit + 1),
        },
      }),
    () => new Response("x".repeat(yogaVideoResponseLimit + 1), { headers }),
  ];
  for (const response of responses) {
    let calls = 0;
    await assert.rejects(
      fetchYogaVideoTitle(video, async () => {
        calls++;
        return response();
      }),
      (error) => error instanceof YogaVideoError && error.status === 502,
    );
    assert.equal(calls, 1);
  }
  let cancelled = false;
  const streamed = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(yogaVideoResponseLimit));
      controller.enqueue(new Uint8Array(1));
    },
    cancel() {
      cancelled = true;
    },
  });
  await assert.rejects(
    fetchYogaVideoTitle(
      video,
      async () =>
        new Response(streamed, {
          headers: { ...headers, "Content-Length": "1" },
        }),
    ),
  );
  assert.equal(cancelled, true);
});

test("시간 초과는 504로 구분하고 외부 오류의 URL·응답은 노출하지 않음", async () => {
  for (const name of ["TimeoutError", "AbortError"]) {
    await assert.rejects(
      fetchYogaVideoTitle(video, async () => {
        throw new DOMException("private upstream details", name);
      }),
      (error) =>
        error instanceof YogaVideoError &&
        error.status === 504 &&
        !error.message.includes("private"),
    );
  }
  await assert.rejects(
    fetchYogaVideoTitle(video, async () => {
      throw new Error("https://private.example/secret");
    }),
    (error) =>
      error instanceof YogaVideoError &&
      error.status === 502 &&
      !error.message.includes("private"),
  );
});
