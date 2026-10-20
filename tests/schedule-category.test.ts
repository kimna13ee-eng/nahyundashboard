import { test } from "node:test";
import assert from "node:assert/strict";
import { parseResource, containsSecret } from "../src/lib/ops.ts";
import {
  parseScheduleCategory,
  parseScheduleVideoUrl,
  scheduleCategories,
  scheduleCategoryLabels,
} from "../src/lib/schedule-category.ts";

const base = {
  title: "운동 일정",
  starts_at: "2026-10-20T18:00:00+09:00",
  ends_at: "2026-10-20T18:30:00+09:00",
  notes: "기존 메모",
  project_id: null,
};

test("일정 분류는 업무·운동·기타, 예전 클라이언트 미전송 값은 보존", () => {
  assert.deepEqual(
    scheduleCategories.map((category) => scheduleCategoryLabels[category]),
    ["업무", "운동", "기타"],
  );
  assert.equal(parseScheduleCategory(undefined), "other");
  const legacy = parseResource("schedules", base);
  assert.equal(Object.hasOwn(legacy, "category"), false);
  assert.equal(Object.hasOwn(legacy, "video_url"), false);
  for (const category of scheduleCategories)
    assert.equal(
      (
        parseResource("schedules", { ...base, category }) as Record<
          string,
          unknown
        >
      ).category,
      category,
    );
  // Category changes deliberately omit the hidden video_url rather than
  // blanking the saved exercise link on unrelated edits.
  const changed = parseResource("schedules", { ...base, category: "work" });
  assert.equal(Object.hasOwn(changed, "video_url"), false);
  for (const category of ["", null, "running", 1, [], {}])
    assert.throws(() => parseResource("schedules", { ...base, category }));
});

test("영상 링크는 HTTPS URL만 저장하고 원문 한글 주소 길이를 유지", () => {
  const video = "https://www.youtube.com/watch?v=example&t=120";
  assert.equal(parseScheduleVideoUrl(video), video);
  assert.equal(parseScheduleVideoUrl(` ${video} `), video);
  assert.equal(parseScheduleVideoUrl(""), "");
  assert.equal(parseScheduleVideoUrl("   "), "");
  const unicode = `https://영상.example/운동/${"가".repeat(1900)}`;
  assert.equal(parseScheduleVideoUrl(unicode), unicode);
  assert.equal(
    (
      parseResource("schedules", {
        ...base,
        category: "exercise",
        video_url: unicode,
      }) as Record<string, unknown>
    ).video_url,
    unicode,
  );
  for (const value of [
    null,
    undefined,
    1,
    {},
    "https://example.com/" + "a".repeat(2000),
    "http://example.com/video",
    "javascript:alert(1)",
    "data:video/mp4;base64,x",
    "//youtube.com/video",
    "https:youtube.com/video",
    "https:///youtube.com/video",
    "https://example.com/a b",
    "https://example.com/a\nb",
    "https://example.com/%zz",
  ])
    assert.throws(() => parseScheduleVideoUrl(value));
});

test("영상 링크의 사용자 인증정보·민감 쿼리·인코딩된 비밀 키를 거절", () => {
  for (const value of [
    "https://user:password@example.com/video",
    "https://user@example.com/video",
    "https://@example.com/video",
    "https://example.com/video?password=x",
    "https://example.com/video?API_KEY=short",
    "https://example.com/video?access_token=abc",
    "https://example.com/video?refresh-token=short",
    "https://example.com/video?client_secret=abc",
    "https://example.com/video?authorization=bearer",
    "https://example.com/video?%70assword=abcdefgh",
    "https://example.com/sk-proj-abcdefghijklmnop1234",
    "https://example.com/video#password=abcdefgh",
    "https://example.com/video#password=x",
    "https://example.com/video#password%3Dx",
    "https://example.com/video?secret=abcdefgh",
  ])
    assert.throws(() => parseScheduleVideoUrl(value), /인증정보|비밀정보/);
  // Re-export preserves the existing secret detector's public API unchanged.
  assert.equal(containsSecret("password=abcdefgh"), true);
  assert.equal(containsSecret("운동 영상 링크"), false);
});
