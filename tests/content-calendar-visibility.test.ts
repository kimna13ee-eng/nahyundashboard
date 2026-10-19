import { test } from "node:test";
import assert from "node:assert/strict";
import {
  contentCalendar,
  parsePersonalContent,
} from "../src/lib/personal-content.ts";
import { needsPersonalContentType } from "../src/lib/personal-content-form.ts";

const details = {
  type: "reel",
  step: "results",
  review: "approved",
  checklist: "원고 작성\n발행 기록 보존",
  review_notes: "승인 맥락 보존",
  shoot_at: "2026-10-10T09:00:00+09:00",
  edit_at: "2026-10-11T09:00:00+09:00",
  published_at: "2026-10-12T09:00:00+09:00",
  performance_checks: [24, 72, 168],
};

test("콘텐츠 캘린더 표시 설정은 기존값 기본 false, boolean만 허용", () => {
  assert.equal(parsePersonalContent(details).calendar_hidden, false);
  assert.equal(
    parsePersonalContent({ ...details, calendar_hidden: false })
      .calendar_hidden,
    false,
  );
  assert.equal(
    parsePersonalContent({ ...details, calendar_hidden: true }).calendar_hidden,
    true,
  );
  for (const value of ["true", "false", 0, 1, null, [], {}]) {
    assert.throws(
      () => parsePersonalContent({ ...details, calendar_hidden: value }),
      /캘린더 표시 여부/,
    );
  }
});

test("콘텐츠 캘린더 보관은 모든 파생 일정만 숨기고 원고·발행·성과 기록을 보존", () => {
  const content = {
    id: "content",
    title: "원본 콘텐츠",
    notes: "원고 원문",
    publish_at: "2026-10-12T09:00:00+09:00",
    personal_details: parsePersonalContent(details),
  };
  const before = structuredClone(content);
  const visible = contentCalendar([content]);
  assert.equal(visible.length, 7);
  const hidden = {
    ...content,
    personal_details: parsePersonalContent({
      ...content.personal_details,
      calendar_hidden: true,
    }),
  };
  assert.equal(contentCalendar([hidden]).length, 0);
  assert.deepEqual(content, before);
  assert.deepEqual(hidden, {
    ...before,
    personal_details: { ...before.personal_details, calendar_hidden: true },
  });
  const restored = {
    ...hidden,
    personal_details: parsePersonalContent({
      ...hidden.personal_details,
      calendar_hidden: false,
    }),
  };
  assert.deepEqual(contentCalendar([restored]), visible);
  assert.deepEqual(
    contentCalendar([
      hidden,
      { id: "legacy", title: "기존 콘텐츠", publish_at: content.publish_at },
    ]).map((row) => row.content_id),
    ["legacy"],
  );
});

test("기본 캘린더 표시 체크는 기존 콘텐츠 유형 검증에 개인 입력으로 오인되지 않음", () => {
  const form = new FormData();
  form.set("personal:type", "");
  form.set("personal:step", "idea");
  form.set("personal:review", "none");
  form.set("content:calendar_visible", "on");
  assert.equal(needsPersonalContentType(form), false);
});
