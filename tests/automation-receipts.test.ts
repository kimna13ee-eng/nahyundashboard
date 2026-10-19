import { test } from "node:test";
import assert from "node:assert/strict";
import type { OpsRow } from "../src/lib/ops.ts";
import {
  automationReceiptIso,
  automationReceiptRows,
  automationReceiptTime,
  automationSourceLabel,
  chatGptSourceUrl,
} from "../src/lib/automation-receipts.ts";
import { parseAutomationResult } from "../src/lib/automation-result.ts";

test("자동화 원본 링크는 실제 ChatGPT HTTPS 대화·예약 화면만 허용", () => {
  for (const url of [
    "https://chatgpt.com/c/example",
    "https://chatgpt.com/c/6ac6f4a0-23d4-83ec-9d21-e0271acd012c",
    "https://chatgpt.com/scheduled",
    "https://chatgpt.com/scheduled?task=example",
  ])
    assert.equal(chatGptSourceUrl(url), url);
  for (const invalid of [
    undefined,
    null,
    "",
    "javascript:alert(1)",
    "data:text/html,hello",
    "http://chatgpt.com/c/example",
    "https://chatgpt.com.evil.test/c/example",
    "https://evil.test/c/example",
    "https://user:password@chatgpt.com/c/example",
    "https://chatgpt.com:8443/c/example",
    "https://chatgpt.com/plugins",
    "https://chatgpt.com/c/example/extra",
    "https://chatgpt.com/c/ex\nample",
  ])
    assert.equal(chatGptSourceUrl(invalid), undefined);
});

test("저장 검증도 화면과 같은 링크 허용 규칙을 사용", () => {
  const valid = {
    source: "metricool_personal",
    run_key: "run-1",
    title: "개인 지표",
    body: "조회 0회",
    source_url: "https://chatgpt.com/c/example",
    reported_at: "2026-10-19T09:00:00+09:00",
  };
  assert.equal(parseAutomationResult(valid).source_url, valid.source_url);
  for (const source_url of [
    "https://chatgpt.com:8443/c/example",
    "https://user@chatgpt.com/c/example",
  ])
    assert.throws(() => parseAutomationResult({ ...valid, source_url }));
});

test("자동화 결과는 저장소별로 나누고 실제 수신 시각 기준 최신순이며 입력은 보존", () => {
  const rows: OpsRow[] = [
    {
      id: "old-personal",
      source: "metricool_personal",
      received_at: "2026-10-18T23:00:00Z",
    },
    {
      id: "company-keyword",
      source: "frengle_keywords",
      received_at: "2026-10-19T01:00:00Z",
    },
    {
      id: "new-personal",
      source: "metricool_personal",
      received_at: "2026-10-19T09:00:00+09:00",
    },
    {
      id: "company-work",
      source: "frengle_work_check",
      received_at: "2026-10-19T03:00:00Z",
    },
    {
      id: "company-site",
      source: "frengle_site_recommendations",
      received_at: "2026-10-19T02:00:00Z",
    },
    { id: "unknown", source: "untrusted", received_at: "2026-10-20T00:00:00Z" },
    {
      id: "invalid-time",
      source: "metricool_personal",
      received_at: "invalid",
    },
  ];
  const original = structuredClone(rows);
  assert.deepEqual(
    automationReceiptRows(rows, "PERSONAL").map((row) => row.id),
    ["new-personal", "old-personal", "invalid-time"],
  );
  assert.deepEqual(
    automationReceiptRows(rows, "PERSONAL", 1).map((row) => row.id),
    ["new-personal"],
  );
  assert.deepEqual(
    automationReceiptRows(rows, "FRENGLE").map((row) => row.id),
    ["company-work", "company-site", "company-keyword"],
  );
  assert.deepEqual(rows, original);
  assert.equal(
    automationSourceLabel("metricool_personal"),
    "Metricool 데이터 확인",
  );
  assert.equal(automationSourceLabel("frengle_work_check"), "출근 업무 체크");
});

test("수신 시각은 한국시간으로 표시하고 잘못된 날짜는 Invalid Date 대신 빈 상태 표시", () => {
  assert.equal(
    automationReceiptIso("2026-10-19T09:00:00+09:00"),
    "2026-10-19T00:00:00.000Z",
  );
  assert.match(
    automationReceiptTime("2026-10-19T00:00:00Z"),
    /2026.*10.*19.*09:00/,
  );
  assert.equal(automationReceiptTime("invalid"), "시각 기록 없음");
  assert.equal(automationReceiptIso(null), undefined);
});
