import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fetchPersonalSheetCsv,
  isPersonalSheetTab,
  parseGoogleSheetCsv,
  personalSheetResponseLimit,
  personalSheetTabs,
  personalSheetUrls,
  readLimitedSheetBody,
  validPersonalSpreadsheetId,
} from "../src/lib/personal-sheets.ts";

const spreadsheetId = "fixture_SHEET_ID_1234567890";

test("개인 시트는 고정된 세 탭·Google 호스트·제한된 조회 범위만 사용", () => {
  assert.deepEqual(Object.keys(personalSheetTabs), [
    "planning",
    "drafts",
    "performance",
  ]);
  for (const invalid of ["__proto__", "settings", "1103", null])
    assert.equal(isPersonalSheetTab(invalid), false);
  for (const tab of ["planning", "drafts", "performance"] as const) {
    const urls = personalSheetUrls(spreadsheetId, tab);
    const csv = new URL(urls.csvUrl);
    assert.equal(csv.origin, "https://docs.google.com");
    assert.equal(csv.pathname, `/spreadsheets/d/${spreadsheetId}/export`);
    assert.equal(csv.searchParams.get("gid"), personalSheetTabs[tab].gid);
    assert.equal(csv.searchParams.get("range"), "A1:Z1002");
    assert.equal(csv.searchParams.get("format"), "csv");
    assert.equal(
      new URL(urls.sourceUrl).hash,
      `#gid=${personalSheetTabs[tab].gid}`,
    );
  }
  for (const invalid of [
    "",
    "short",
    "/../../other",
    "https://evil.test/a",
    "x".repeat(201),
    "valid_looking_sheet_id?gid=999",
  ])
    assert.equal(validPersonalSpreadsheetId(invalid), false);
  assert.throws(() => personalSheetUrls("https://evil.test", "planning"));
});

test("CSV 서식값·혼합 타입·쉼표·따옴표·줄바꿈·0을 보존하고 비어 있는 끝 열만 정리", () => {
  const result = parseGoogleSheetCsv(
    '\uFEFF제목,클릭률,조회,게시,날짜,빈 열,,\r\n"원고, ""검수""\r\n<script>literal</script>",3.9%,0,FALSE,2026. 10. 19.,,새 열 데이터,\r\n"한 열의 숫자와 텍스트",아직 집계 중,42,TRUE,2026. 10. 20.\r\n,,,,,,,\r\n',
    "performance",
  );
  assert.deepEqual(result.columns, [
    "제목",
    "클릭률",
    "조회",
    "게시",
    "날짜",
    "빈 열",
    "G",
  ]);
  assert.deepEqual(result.rows, [
    [
      '원고, "검수"\r\n<script>literal</script>',
      "3.9%",
      "0",
      "FALSE",
      "2026. 10. 19.",
      "",
      "새 열 데이터",
    ],
    [
      "한 열의 숫자와 텍스트",
      "아직 집계 중",
      "42",
      "TRUE",
      "2026. 10. 20.",
      "",
      "",
    ],
  ]);
  assert.equal(result.truncated, false);
  for (const blank of ["", "\uFEFF", ",,\r\n,,\r\n", '""'])
    assert.deepEqual(parseGoogleSheetCsv(blank, "planning"), {
      columns: [],
      rows: [],
      truncated: false,
    });
  assert.deepEqual(parseGoogleSheetCsv('"제목"\n""\n"a"\n', "planning").rows, [
    ["a"],
  ]);
});

test("행 상한은1000건이며 다음 비어 있지 않은 행이 있으면 잘림을 알림", () => {
  const result = parseGoogleSheetCsv(
    "기획\n" + Array.from({ length: 1001 }, (_, i) => `원고 ${i}`).join("\r\n"),
    "planning",
  );
  assert.equal(result.rows.length, 1000);
  assert.equal(result.rows.at(-1)?.[0], "원고 999");
  assert.equal(result.truncated, true);
  assert.equal(
    parseGoogleSheetCsv("제목\r\na\r\n\r\n", "planning").truncated,
    false,
  );
});

test("깨진 따옴표·허용 열 범위 초과·과도한 응답은 거절", () => {
  for (const invalid of [
    '제목\n"닫히지 않은 원고',
    '제목\n잘못된"따옴표',
    '제목\n"완성된 원고"extra',
    Array.from({ length: 27 }, () => "열").join(","),
    " ".repeat(personalSheetResponseLimit + 1),
  ])
    assert.throws(() => parseGoogleSheetCsv(invalid, "planning"));
});

test("CSV 요청은 제한된 Google HTTPS 이동만 따르고 인증정보·캐시는 전송하지 않음", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetcher: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return calls.length === 1
      ? new Response(null, {
          status: 302,
          headers: {
            location:
              "https://doc-01-sheets.googleusercontent.com/export/fixture",
          },
        })
      : new Response("제목\r\n원고", {
          headers: { "content-type": "text/csv; charset=utf-8" },
        });
  };
  const result = await fetchPersonalSheetCsv(spreadsheetId, "drafts", fetcher);
  assert.equal(result.body, "제목\r\n원고");
  assert.equal(calls.length, 2);
  for (const { init } of calls) {
    assert.equal(init?.credentials, "omit");
    assert.equal(init?.cache, "no-store");
    assert.equal(init?.redirect, "manual");
    assert.deepEqual(init?.headers, { Accept: "text/csv" });
    assert.equal(init?.signal, calls[0].init?.signal);
  }
  for (const location of [
    "http://docs.google.com/export",
    "https://evil.test/export",
    "https://docs.google.com.evil.test/export",
    "https://user:pass@docs.google.com/export",
    "https://sheets.googleusercontent.com.evil.test/export",
    "https://docs.google.com:444/export",
    "https://accounts.google.com/login",
  ]) {
    let count = 0;
    await assert.rejects(
      fetchPersonalSheetCsv(spreadsheetId, "planning", async () => {
        count++;
        return new Response(null, { status: 302, headers: { location } });
      }),
    );
    assert.equal(count, 1);
  }
  let loops = 0;
  await assert.rejects(
    fetchPersonalSheetCsv(spreadsheetId, "planning", async () => {
      loops++;
      return new Response(null, {
        status: 302,
        headers: { location: "https://docs.google.com/export" },
      });
    }),
  );
  assert.equal(loops, 4);
  await assert.rejects(
    fetchPersonalSheetCsv(
      spreadsheetId,
      "planning",
      async () =>
        new Response("<html>login</html>", {
          headers: { "content-type": "text/html" },
        }),
    ),
  );
});

test("스트림은 UTF-8 경계를 보존하고 선언 길이와 실제 바이트 상한 모두 검사", async () => {
  const bytes = new TextEncoder().encode("기획 원고 성과");
  let offset = 0;
  const response = new Response(
    new ReadableStream({
      pull(controller) {
        if (offset === bytes.length) return controller.close();
        controller.enqueue(bytes.slice(offset, ++offset));
      },
    }),
  );
  assert.equal(await readLimitedSheetBody(response), "기획 원고 성과");
  await assert.rejects(
    readLimitedSheetBody(
      new Response("tiny", {
        headers: { "content-length": String(personalSheetResponseLimit + 1) },
      }),
    ),
    /너무 큽니다/,
  );
  await assert.rejects(
    readLimitedSheetBody(
      new Response(new Uint8Array(personalSheetResponseLimit + 1)),
    ),
    /너무 큽니다/,
  );
});
