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
  type PersonalSheetTab,
} from "../src/lib/personal-sheets.ts";
import { personalSheetGroups } from "../src/lib/personal-sheet-tabs.ts";

const spreadsheetId = "fixture_SHEET_ID_1234567890";

test("개인 시트는 확인된 17개 탭·Google 호스트·제한된 조회 범위만 사용", () => {
  const expectedTabs = {
    planning: ["1103", "03_기획"],
    drafts: ["1104", "04_원고"],
    review: ["1105", "05_검수"],
    performance: ["1106", "06_발행성과"],
    references: ["1101", "01_레퍼런스"],
    research: ["1102", "02_리서치"],
    grokInbox: ["1110", "10_Grok_인박스"],
    characterBible: ["1111", "11_캐릭터_바이블"],
    visualDna: ["1113", "13_셀카_비주얼DNA"],
    characterInterpretation: ["1114", "14_통합_캐해"],
    referenceInterpretation: ["1115", "15_레퍼런스_해석"],
    calibration: ["1116", "16_콘텐츠_캘리브레이션"],
    dashboard: ["1828527468", "00_대시보드"],
    handoffs: ["1107", "07_인계로그"],
    rules: ["1108", "08_직원규칙"],
    agentGuide: ["1112", "12_에이전트_실행지침"],
    settings: ["1109", "09_설정"],
  } as const;
  assert.deepEqual(
    Object.keys(personalSheetTabs).sort(),
    Object.keys(expectedTabs).sort(),
  );
  assert.equal(
    new Set(Object.values(personalSheetTabs).map((tab) => tab.gid)).size,
    17,
  );
  assert.deepEqual(
    personalSheetGroups.map((group) => group.id),
    ["production", "research", "brand", "operations"],
  );
  for (const invalid of [
    "__proto__",
    "constructor",
    "unknown-tab",
    "1103",
    null,
  ])
    assert.equal(isPersonalSheetTab(invalid), false);
  for (const tab of Object.keys(expectedTabs) as PersonalSheetTab[]) {
    assert.equal(isPersonalSheetTab(tab), true);
    assert.equal(personalSheetTabs[tab].gid, expectedTabs[tab][0]);
    assert.equal(personalSheetTabs[tab].title, expectedTabs[tab][1]);
    assert.ok(
      personalSheetGroups.some(
        (group) => group.id === personalSheetTabs[tab].group,
      ),
    );
    assert.equal(
      personalSheetTabs[tab].layout,
      tab === "dashboard" ? "grid" : "table",
    );
    const urls = personalSheetUrls(spreadsheetId, tab);
    const csv = new URL(urls.csvUrl);
    assert.equal(csv.origin, "https://docs.google.com");
    assert.equal(csv.pathname, `/spreadsheets/d/${spreadsheetId}/export`);
    assert.equal(csv.searchParams.get("gid"), personalSheetTabs[tab].gid);
    assert.equal(
      csv.searchParams.get("range"),
      tab === "dashboard" ? "A1:Z1001" : "A1:Z1002",
    );
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

test("17개 탭 모두 CSV 문자열과 26열 상한을 지키며 대시보드만 첫 행을 데이터로 보존", () => {
  for (const tab of Object.keys(personalSheetTabs) as PersonalSheetTab[]) {
    const parsed = parseGoogleSheetCsv("열A,열B\r\n0,3.9%", tab);
    assert.deepEqual(
      parsed.columns,
      tab === "dashboard" ? ["A", "B"] : ["열A", "열B"],
    );
    assert.deepEqual(
      parsed.rows,
      tab === "dashboard"
        ? [
            ["열A", "열B"],
            ["0", "3.9%"],
          ]
        : [["0", "3.9%"]],
    );
    const columns = Array.from(
      { length: 26 },
      (_, index) => `필드${index + 1}`,
    ).join(",");
    assert.equal(
      parseGoogleSheetCsv(columns + "\n" + columns, tab).columns.length,
      26,
    );
    assert.throws(
      () => parseGoogleSheetCsv(columns + ",범위 밖", tab),
      /허용된 시트 범위/,
    );
  }
});

test("시트 대시보드의 제목·지표 행은 헤더로 소실되지 않고 알파벳 열과 문자열로 표시", () => {
  const result = parseGoogleSheetCsv(
    '\uFEFFSNS 스튜디오,,,,\r\n\r\n"발행, 완료",0,3.9%,FALSE,\r\n',
    "dashboard",
  );
  assert.deepEqual(result, {
    columns: ["A", "B", "C", "D"],
    rows: [
      ["SNS 스튜디오", "", "", ""],
      ["", "", "", ""],
      ["발행, 완료", "0", "3.9%", "FALSE"],
    ],
    truncated: false,
  });
  assert.deepEqual(parseGoogleSheetCsv("SNS 스튜디오", "dashboard").rows, [
    ["SNS 스튜디오"],
  ]);
  assert.deepEqual(parseGoogleSheetCsv("", "dashboard"), {
    columns: [],
    rows: [],
    truncated: false,
  });
});

test("대시보드는 원본 행 번호를 위해 중간·시작 빈 행을 유지하고 끝 빈 행만 제거", () => {
  assert.deepEqual(
    parseGoogleSheetCsv("SNS 제목\r\n\r\n지표,0\r\n,\r\n,\r\n", "dashboard"),
    {
      columns: ["A", "B"],
      rows: [
        ["SNS 제목", ""],
        ["", ""],
        ["지표", "0"],
      ],
      truncated: false,
    },
  );
  assert.deepEqual(
    parseGoogleSheetCsv("\r\n두 번째 행 제목\r\n", "dashboard").rows,
    [[""], ["두 번째 행 제목"]],
  );
  assert.deepEqual(
    parseGoogleSheetCsv("제목\r\n\r\n원고\r\n\r\n", "planning").rows,
    [["원고"]],
  );
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
  const gridRows = Array.from({ length: 1001 }, (_, index) => `항목 ${index}`);
  assert.deepEqual(
    parseGoogleSheetCsv(gridRows.slice(0, 1000).join("\n"), "dashboard")
      .rows[0],
    ["항목 0"],
  );
  assert.equal(
    parseGoogleSheetCsv(gridRows.slice(0, 1000).join("\n"), "dashboard")
      .truncated,
    false,
  );
  const truncatedGrid = parseGoogleSheetCsv(gridRows.join("\n"), "dashboard");
  assert.equal(truncatedGrid.rows.length, 1000);
  assert.deepEqual(truncatedGrid.rows.at(-1), ["항목 999"]);
  assert.equal(truncatedGrid.truncated, true);
});

test("대시보드의1000행 상한은 빈 행을 포함한 원본 물리행 기준", () => {
  const physicalRows = Array.from({ length: 1001 }, () => "");
  physicalRows[0] = "첫 번째 행";
  physicalRows[999] = "원본 1000행";
  physicalRows[1000] = "원본 1001행";
  const overflow = parseGoogleSheetCsv(physicalRows.join("\n"), "dashboard");
  assert.equal(overflow.rows.length, 1000);
  assert.deepEqual(overflow.rows[0], ["첫 번째 행"]);
  assert.deepEqual(overflow.rows[1], [""]);
  assert.deepEqual(overflow.rows[998], [""]);
  assert.deepEqual(overflow.rows[999], ["원본 1000행"]);
  assert.equal(overflow.truncated, true);
  physicalRows[1000] = '""';
  const blankSentinel = parseGoogleSheetCsv(
    physicalRows.join("\n"),
    "dashboard",
  );
  assert.equal(blankSentinel.rows.length, 1000);
  assert.deepEqual(blankSentinel.rows[999], ["원본 1000행"]);
  assert.equal(blankSentinel.truncated, false);
  physicalRows[999] = "";
  const trailingBlanks = parseGoogleSheetCsv(
    physicalRows.join("\n"),
    "dashboard",
  );
  assert.deepEqual(trailingBlanks.rows, [["첫 번째 행"]]);
  assert.equal(trailingBlanks.truncated, false);
});

test("깨진 따옴표·허용 열 범위 초과·과도한 응답은 거절", () => {
  for (const invalid of [
    '제목\n"닫히지 않은 원고',
    '제목\n잘못된"따옴표',
    '제목\n"완성된 원고"extra',
    Array.from({ length: 27 }, () => "열").join(","),
    " ".repeat(personalSheetResponseLimit + 1),
    "가".repeat(Math.floor(personalSheetResponseLimit / 3) + 1),
  ])
    assert.throws(() => parseGoogleSheetCsv(invalid, "planning"));
});

test("허용 목록 밖 탭이나 잘못된 시트 ID는 외부 요청 전에 차단", async () => {
  let requests = 0;
  const fetcher: typeof fetch = async () => {
    requests++;
    return new Response("제목\n원고", {
      headers: { "content-type": "text/csv" },
    });
  };
  for (const tab of [
    "__proto__",
    "constructor",
    "1103",
    "unknown-tab",
    "planning&gid=999",
    "../planning",
  ])
    await assert.rejects(
      fetchPersonalSheetCsv(spreadsheetId, tab as PersonalSheetTab, fetcher),
    );
  for (const id of [
    "",
    "https://evil.test/export",
    "allowed_looking_sheet_id/../secret",
  ])
    await assert.rejects(fetchPersonalSheetCsv(id, "planning", fetcher));
  assert.equal(requests, 0);
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

test("12초 타임아웃 신호는 CSV 본문 스트리밍까지 적용되고 오류를 숨기지 않음", async (context) => {
  const timeout = new AbortController();
  const reason = new DOMException("fixture sheet timed out", "TimeoutError");
  let requestedTimeout: number | undefined;
  context.mock.method(AbortSignal, "timeout", (milliseconds: number) => {
    requestedTimeout = milliseconds;
    return timeout.signal;
  });
  const pending = fetchPersonalSheetCsv(
    spreadsheetId,
    "planning",
    async (_url, init) => {
      assert.equal(init?.signal, timeout.signal);
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("제목\n"));
            init?.signal?.addEventListener(
              "abort",
              () => controller.error(timeout.signal.reason),
              { once: true },
            );
            queueMicrotask(() => timeout.abort(reason));
          },
        }),
        { headers: { "content-type": "text/csv" } },
      );
    },
  );
  await assert.rejects(pending, {
    name: "TimeoutError",
    message: reason.message,
  });
  assert.equal(requestedTimeout, 12_000);
});
