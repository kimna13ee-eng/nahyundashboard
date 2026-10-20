import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseReelsMetric,
  reelsScoreWeights,
  summarizeReelsPerformance,
  type ReelsPerformanceSource,
} from "../src/lib/reels-performance.ts";

const columns = [
  "콘텐츠 ID",
  "발행 URL",
  "발행일",
  "발행상태",
  "형식",
  "조회수",
  "좋아요",
  "댓글",
  "저장",
  "공유",
  "관측일",
  "콘텐츠 요약",
];
const today = "2026-10-20";
function row(id: string, changes: Record<string, string> = {}) {
  const values: Record<string, string> = {
    "콘텐츠 ID": id,
    "발행 URL": `https://www.instagram.com/p/${id}/`,
    발행일: "2026-10-01",
    발행상태: "발행",
    형식: "릴스",
    조회수: "100",
    좋아요: "4",
    댓글: "2",
    저장: "0",
    공유: "1",
    관측일: "2026-10-02",
    "콘텐츠 요약": `${id} 콘텐츠`,
    ...changes,
  };
  return columns.map((column) => values[column] ?? "");
}
function summarize(rows: string[][], sourceColumns = columns) {
  return summarizeReelsPerformance({ columns: sourceColumns, rows }, { today });
}

test("최신 콘텐츠 관측만 선택하고 발행순으로 정렬하며 누락과 실제 0을 구분", () => {
  const result = summarize([
    row("b", {
      발행일: "2026-10-03",
      관측일: "2026-10-04",
      조회수: "0",
      좋아요: "0",
      댓글: "0",
      저장: "0",
      공유: "0",
    }),
    row("a"),
    row("a", {
      관측일: "2026-10-05",
      조회수: "1,200",
      좋아요: "10",
      댓글: "2",
      저장: "",
      공유: "3",
    }),
  ]);
  assert.deepEqual(
    result.entries.map((entry) => entry.id),
    ["a", "b"],
  );
  assert.equal(result.entries[0].views, 1200);
  assert.equal(result.entries[0].saves, null);
  assert.equal(result.entries[0].reactions, null);
  assert.equal(result.entries[1].views, 0);
  assert.equal(result.entries[1].reactions, 0);
  assert.deepEqual(result.totals, {
    views: 1200,
    likes: 10,
    comments: 2,
    saves: 0,
    shares: 3,
    reactions: 0,
  });
  assert.deepEqual(result.coverage.views, {
    observed: 2,
    total: 2,
    complete: true,
  });
  assert.deepEqual(result.coverage.saves, {
    observed: 1,
    total: 2,
    complete: false,
  });
  assert.deepEqual(result.coverage.reactions, {
    observed: 1,
    total: 2,
    complete: false,
  });
  assert.equal(result.postCount, 2);
  assert.equal(result.observationCount, 3);
  assert.equal(result.observedRowCount, 2);
});

test("총계행·대기·취소·캐러셀·잘못된 날짜·미래 관측은 합계에서 제외", () => {
  const result = summarize([
    row("valid"),
    row("합계"),
    row("Grand Total"),
    row("소계 (이번 달)"),
    row(""),
    row("waiting", { 발행상태: "대기" }),
    row("cancel", { 발행상태: "취소" }),
    row("carousel", { 형식: "캐러셀" }),
    row("invalid", { 발행일: "2026-02-30" }),
    row("future", { 발행일: "2026-10-21", 관측일: "2026-10-21" }),
    row("future-observation", { 관측일: "2026-10-21" }),
    row("invalid-observation", { 관측일: "2026-02-30" }),
    row("before-publication", { 관측일: "2026-09-30" }),
  ]);
  assert.equal(result.postCount, 1);
  assert.equal(result.observationCount, 1);
  assert.equal(result.rejectedRowCount, 12);
  assert.equal(result.totals.views, 100);
  assert.equal(result.totals.reactions, 7);
  assert.equal(result.coverage.reactions.complete, true);
});

test("지표 파서는 정확한 정수만 받고 unknown을 0이나 잘린 숫자로 바꾸지 않음", () => {
  for (const [value, expected] of [
    ["0", 0],
    [" 1,234 ", 1234],
    ["1,234.00", 1234],
    ["0012", 12],
    [0, 0],
    [12, 12],
  ] as const)
    assert.equal(parseReelsMetric(value), expected);
  for (const invalid of [
    "",
    " ",
    "미확인",
    "확인 중",
    "N/A",
    "—",
    "-1",
    "-0",
    "NaN",
    "Infinity",
    "1,23",
    "1,234,",
    "1, 234",
    "1.5",
    "1e3",
    "12%",
    "100회",
    "1천",
    null,
    undefined,
    true,
    -1,
    NaN,
    Infinity,
    1.5,
    "9007199254740992",
  ])
    assert.equal(parseReelsMetric(invalid), null, String(invalid));
});

test("최신 행의 빈값을 오래된 지표로 메우지 않으며 관측일 없는 행은 후순위", () => {
  const result = summarize([
    row("a"),
    row("a", {
      관측일: "2026-10-05",
      조회수: "",
      좋아요: "미확인",
      댓글: "",
      저장: "",
      공유: "",
    }),
    row("a", { 관측일: "", 조회수: "9999" }),
    row("b", { 관측일: "", 조회수: "0" }),
  ]);
  assert.equal(result.entries[0].observedAt, "2026-10-05");
  assert.equal(result.entries[0].views, null);
  assert.equal(result.entries[0].likes, null);
  assert.equal(result.entries[1].observedAt, null);
  assert.equal(result.totals.views, 0);
  assert.deepEqual(result.coverage.views, {
    observed: 1,
    total: 2,
    complete: false,
  });
  assert.equal(result.observedRowCount, 1);
  const empty = summarize([
    row("a", { 조회수: "", 좋아요: "", 댓글: "", 저장: "", 공유: "" }),
  ]);
  assert.ok(Object.values(empty.totals).every((value) => value === null));
  assert.equal(empty.observedRowCount, 0);
});

test("같은 관측일 중복은 마지막 원본행을 사용하고 순서를 바꿔도 날짜 우선순위는 유지", () => {
  const first = row("a", { 관측일: "2026-10-04", 조회수: "101" });
  const last = row("a", { 관측일: "2026-10-04", 조회수: "202" });
  const old = row("a", { 관측일: "2026-10-03", 조회수: "999" });
  assert.equal(summarize([first, last, old]).totals.views, 202);
  assert.equal(summarize([old, first, last]).totals.views, 202);
});

test("헤더 순서·공백은 유연하게 읽되 누락·중복 헤더는 잘못 합산하지 않음", () => {
  const reverseColumns = [...columns]
    .reverse()
    .map((column) => ` ${column.replaceAll(" ", "\n")} `);
  const result = summarize([row("a").reverse()], reverseColumns);
  assert.equal(result.totals.views, 100);
  assert.deepEqual(result.missingColumns, []);
  const withoutViews = columns.filter((column) => column !== "조회수");
  const missing = summarize(
    [row("a").filter((_, index) => columns[index] !== "조회수")],
    withoutViews,
  );
  assert.deepEqual(missing.missingColumns, ["조회수"]);
  assert.equal(missing.totals.views, null);
  assert.equal(missing.entries[0].reactions, 7);
  const ambiguous = summarize([[...row("a"), "10000"]], [...columns, "조회수"]);
  assert.equal(ambiguous.totals.views, null);
  assert.ok(ambiguous.missingColumns.includes("조회수"));
});

test("URL은 웹 링크만 노출하고 입력 rows는 수정하지 않음", () => {
  const input: ReelsPerformanceSource = Object.freeze({
    columns: Object.freeze([...columns]),
    rows: Object.freeze([
      Object.freeze(
        row("a", { "발행 URL": "javascript:alert(1)", "콘텐츠 요약": "" }),
      ),
      Object.freeze(
        row("b", { "발행 URL": "https://user:secret@example.com/" }),
      ),
      Object.freeze(row("c", { "발행 URL": "https://example.com/post?x=1" })),
    ]),
  });
  const before = JSON.stringify(input);
  const result = summarizeReelsPerformance(input, { today });
  assert.equal(result.entries[0].title, "a");
  assert.equal(result.entries[0].url, undefined);
  assert.equal(result.entries[1].url, undefined);
  assert.equal(result.entries[2].url, "https://example.com/post?x=1");
  assert.equal(JSON.stringify(input), before);
});

test("빈 시트와 정확한 숫자 범위를 넘는 합계를 0으로 표시하지 않음", () => {
  const empty = summarize([]);
  assert.equal(empty.postCount, 0);
  assert.ok(Object.values(empty.totals).every((value) => value === null));
  assert.equal(empty.coverage.views.complete, false);
  const large = summarize([
    row("a", { 조회수: String(Number.MAX_SAFE_INTEGER) }),
    row("b", { 조회수: "1" }),
  ]);
  assert.equal(large.totals.views, null);
  assert.ok(large.overflowMetrics.includes("views"));
  assert.equal(large.coverage.views.complete, false);
  assert.throws(() =>
    summarizeReelsPerformance({ columns, rows: [] }, { today: "2026-02-30" }),
  );
});

test("100점 상대 성과는 각 최고 기록을 달성하면 100점이고 개별 평균을 표시", () => {
  const result = summarize([
    row("a", {
      조회수: "100",
      좋아요: "10",
      댓글: "10",
      저장: "10",
      공유: "10",
    }),
    row("b", { 조회수: "50", 좋아요: "5", 댓글: "5", 저장: "5", 공유: "5" }),
  ]);
  assert.deepEqual(
    result.entries.map((entry) => entry.score),
    [100, 50],
  );
  assert.deepEqual(result.performanceScore, {
    value: 75,
    scored: 2,
    total: 2,
    maxima: { views: 100, likes: 10, comments: 10, saves: 10, shares: 10 },
  });
  assert.deepEqual(Object.values(reelsScoreWeights), [0.2, 0.2, 0.2, 0.2, 0.2]);
  assert.equal(result.totals.reactions, 60); // Actual counts remain independent.
});

test("0은 완전 관측이며 기준 최대가 0인 항목은 보너스 없이 0점으로 기여", () => {
  const zero = { 조회수: "0", 좋아요: "0", 댓글: "0", 저장: "0", 공유: "0" };
  const result = summarize([row("a", zero), row("b", zero)]);
  assert.deepEqual(
    result.entries.map((entry) => entry.score),
    [0, 0],
  );
  assert.equal(result.performanceScore.value, 0);
  assert.equal(result.performanceScore.scored, 2);
  assert.deepEqual(result.performanceScore.maxima, {
    views: 0,
    likes: 0,
    comments: 0,
    saves: 0,
    shares: 0,
  });
  const missing = summarize([row("a", { ...zero, 저장: "" })]);
  assert.equal(missing.entries[0].score, null);
  assert.equal(missing.performanceScore.value, null);
  assert.equal(missing.performanceScore.scored, 0);
});

test("조회수가 커도 다섯 지표에 같은 20%를 적용하고 반응 합계를 중복 가중하지 않음", () => {
  const result = summarize([
    row("views", {
      조회수: "1000000",
      좋아요: "0",
      댓글: "0",
      저장: "0",
      공유: "0",
    }),
    row("engagement", {
      조회수: "0",
      좋아요: "10",
      댓글: "10",
      저장: "10",
      공유: "10",
    }),
  ]);
  assert.equal(result.entries.find((entry) => entry.id === "views")?.score, 20);
  assert.equal(
    result.entries.find((entry) => entry.id === "engagement")?.score,
    80,
  );
  assert.equal(result.performanceScore.value, 50);
});

test("불완전 관측의 큰 수치는 점수와 비교 기준에서 제외하고 실제 합계는 유지", () => {
  const result = summarize([
    row("a", {
      조회수: "100",
      좋아요: "10",
      댓글: "10",
      저장: "10",
      공유: "10",
    }),
    row("b", { 조회수: "50", 좋아요: "5", 댓글: "5", 저장: "5", 공유: "5" }),
    row("incomplete", {
      조회수: "999999",
      좋아요: "999999",
      댓글: "999999",
      저장: "999999",
      공유: "미확인",
    }),
  ]);
  assert.equal(
    result.entries.find((entry) => entry.id === "incomplete")?.score,
    null,
  );
  assert.equal(result.performanceScore.value, 75);
  assert.equal(result.performanceScore.scored, 2);
  assert.equal(result.performanceScore.total, 3);
  assert.equal(result.performanceScore.maxima.views, 100);
  assert.equal(result.totals.views, 1000149);
});

test("최신 관측 선택과 미래 관측 제외가 끝난 뒤 점수 최대 기준을 계산", () => {
  const result = summarize([
    row("a", {
      조회수: "10000",
      좋아요: "1000",
      댓글: "1000",
      저장: "1000",
      공유: "1000",
    }),
    row("a", {
      관측일: "2026-10-05",
      조회수: "100",
      좋아요: "10",
      댓글: "10",
      저장: "10",
      공유: "10",
    }),
    row("b", { 조회수: "50", 좋아요: "5", 댓글: "5", 저장: "5", 공유: "5" }),
    row("future", {
      관측일: "2026-10-21",
      조회수: "999999",
      좋아요: "999999",
      댓글: "999999",
      저장: "999999",
      공유: "999999",
    }),
  ]);
  assert.deepEqual(
    result.entries.map((entry) => entry.score),
    [100, 50],
  );
  assert.equal(result.performanceScore.maxima.views, 100);
  assert.equal(result.performanceScore.value, 75);
});

test("전체 성과 점수는 표시용으로 반올림한 개별 점수를 다시 평균내지 않음", () => {
  const zeroReactions = { 좋아요: "0", 댓글: "0", 저장: "0", 공유: "0" };
  const result = summarize([
    row("a", { ...zeroReactions, 조회수: "2" }),
    row("b", { ...zeroReactions, 조회수: "2" }),
    row("max", { ...zeroReactions, 조회수: "3" }),
  ]);
  assert.deepEqual(
    result.entries.map((entry) => entry.score),
    [13.3, 13.3, 20],
  );
  assert.equal(result.performanceScore.value, 15.6);
  assert.equal(Math.round(((13.3 + 13.3 + 20) / 3) * 10) / 10, 15.5);
});
