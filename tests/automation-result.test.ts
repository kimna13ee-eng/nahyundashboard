import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAutomationResult } from "../src/lib/automation-result.ts";
const valid = {
  source: "metricool_personal",
  run_key: "2026-10-14T09:00:00+09:00",
  title: "개인 인스타그램 집계",
  body: "게시물 조회 42회",
  source_url: "https://chatgpt.com/c/example",
  reported_at: "2026-10-14T09:00:00+09:00",
};
test("자동화 결과는 개인 Metricool·ChatGPT 원본·타임존·비밀정보를 검증", () => {
  assert.equal(
    parseAutomationResult(valid).reported_at,
    "2026-10-14T00:00:00.000Z",
  );
  for (const value of [
    { ...valid, source: "frengle_keywords" },
    { ...valid, source_url: "https://chatgpt.com.evil.test/c/example" },
    { ...valid, source_url: "javascript:alert(1)" },
    { ...valid, reported_at: "2026-10-14T09:00:00" },
    { ...valid, body: "password: abcdefghijklmnop" },
  ])
    assert.throws(() => parseAutomationResult(value));
});
