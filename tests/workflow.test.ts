import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseCapture,
  parseParkContext,
  recurrenceStatus,
  savedSnapshot,
} from "../src/lib/workflow.ts";
import { attentionTasks } from "../src/lib/workflow-context.ts";
import {
  parsePersonalContent,
  contentCalendar,
  personalTemplates,
} from "../src/lib/personal-content.ts";
import { parseResource } from "../src/lib/ops.ts";
test("Quick Capture 제목만 수집·출처 선택·회사 저장 거부·비밀정보 거부", () => {
  assert.equal(
    parseCapture({ workspace: "PERSONAL", title: "아이디어" }).notes,
    "",
  );
  assert.throws(() => parseCapture({ workspace: "FRENGLE", title: "회사" }));
  assert.throws(() =>
    parseCapture({ workspace: "PERSONAL", title: "password=abcdefghij" }),
  );
  assert.throws(() =>
    parseCapture({
      workspace: "PERSONAL",
      title: "일정",
      schedule_at: "2026-10-10T09:00",
    }),
  );
  assert.equal(parseParkContext({ reason: "돌발 요청" }).reason, "돌발 요청");
});
test("반복 예정 경과는 미확인, 완료 기록과 이전 미완료를 바꾸지 않음", () => {
  const occurrence = { id: "r", starts_at: "2026-10-10T00:00:00Z" },
    run = { id: "x", status: "held" };
  assert.equal(
    recurrenceStatus(occurrence, undefined, Date.parse("2026-10-10T01:00:00Z")),
    "unconfirmed",
  );
  assert.equal(
    recurrenceStatus(occurrence, { id: "x", status: "completed" }, Date.now()),
    "completed",
  );
  assert.equal(recurrenceStatus(occurrence, run, Date.now()), "held");
  assert.equal(run.status, "held");
});
test("중단 스냅샷 최신 선택·후속 서울 날짜·응답 종료 제외·수동 보통 우선순위", () => {
  const old = {
      id: "old",
      session_id: "s",
      created_at: "2026-10-10T00:00:00Z",
      payload: { reason: "전" },
    },
    latest = {
      id: "latest",
      session_id: "s",
      created_at: "2026-10-10T01:00:00Z",
      payload: { reason: "후" },
    };
  assert.equal(savedSnapshot([old, latest], "s")?.reason, "후");
  assert.equal(
    attentionTasks(
      [
        {
          id: "t",
          status: "pending",
          contact_status: "waiting",
          follow_up_at: "2026-10-10T15:30:00Z",
        },
      ],
      "2026-10-10",
    ).length,
    0,
  );
  assert.equal(
    attentionTasks(
      [
        {
          id: "t",
          status: "pending",
          contact_status: "waiting",
          follow_up_at: "2026-10-10T15:30:00Z",
        },
      ],
      "2026-10-11",
    ).length,
    1,
  );
  assert.equal(
    attentionTasks(
      [
        {
          id: "t",
          status: "pending",
          contact_status: "closed",
          follow_up_at: "2026-10-09T00:00:00Z",
        },
      ],
      "2026-10-10",
    ).length,
    0,
  );
  assert.deepEqual(
    attentionTasks(
      [
        { id: "low", status: "failed", priority: "low" },
        { id: "normal", status: "failed", priority: "normal" },
      ],
      "2026-10-10",
    ).map((t) => t.id),
    ["normal", "low"],
  );
});
test("개인 체크리스트·협찬·옵트인 성과 점검과 프롬프트 원문 메타데이터", () => {
  const p = parsePersonalContent({
    type: "reel",
    step: "results",
    review: "approved",
    published_at: "2026-10-10T10:00:00Z",
    performance_checks: [24, 72, 168],
    checklist: personalTemplates.reel,
    sponsored: true,
    sponsor_due_at: "2026-10-20T10:00:00Z",
  });
  assert.equal(p.sponsored, true);
  assert.ok(String(p.checklist).includes("BGM"));
  assert.equal(contentCalendar([{ id: "c", personal_details: p }]).length, 3);
  assert.equal(
    contentCalendar([
      { id: "c", personal_details: { ...p, performance_checks: [] } },
    ]).length,
    0,
  );
  assert.throws(() => parsePersonalContent({ ...p, performance_checks: [2] }));
  const text = "  원문\n\n${literal}\n";
  const prompt = parseResource("library_items", {
    title: "개인 프롬프트",
    kind: "prompt",
    category: "개발",
    body: text,
    tool: "Codex",
    change_reason: "원문 보존",
    status: "active",
  });
  assert.equal(prompt.body, text);
  assert.throws(() =>
    parseResource("library_items", {
      title: "개인",
      kind: "prompt",
      category: "개발",
      body: "",
      tool: "Codex",
      change_reason: "password=abcdefghij",
    }),
  );
});
