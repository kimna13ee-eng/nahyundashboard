export const personalSheetTabs = {
  planning: { gid: "1103", title: "03_기획", lastColumn: "Z", width: 26 },
  drafts: { gid: "1104", title: "04_원고", lastColumn: "Z", width: 26 },
  performance: {
    gid: "1106",
    title: "06_발행성과",
    lastColumn: "Z",
    width: 26,
  },
} as const;

export type PersonalSheetTab = keyof typeof personalSheetTabs;
export const personalSheetRowLimit = 1000;
export const personalSheetResponseLimit = 3 * 1024 * 1024;

export type PersonalSheetData = {
  tab: PersonalSheetTab;
  sheetTitle: string;
  columns: string[];
  rows: string[][];
  fetchedAt: string;
  sourceUrl: string;
  truncated: boolean;
  rowLimit: number;
};

export function isPersonalSheetTab(value: unknown): value is PersonalSheetTab {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(personalSheetTabs, value)
  );
}

export function validPersonalSpreadsheetId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{20,200}$/.test(value);
}

export function personalSheetUrls(
  spreadsheetId: string,
  tab: PersonalSheetTab,
) {
  if (!validPersonalSpreadsheetId(spreadsheetId) || !isPersonalSheetTab(tab))
    throw new Error("연결된 시트 설정을 확인해 주세요.");
  const config = personalSheetTabs[tab];
  const source = new URL(
    `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
  );
  source.hash = `gid=${config.gid}`;
  const csv = new URL(
    `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export`,
  );
  csv.searchParams.set("format", "csv");
  csv.searchParams.set("gid", config.gid);
  // One header, 1,000 visible rows, and one row to detect truncation.
  csv.searchParams.set(
    "range",
    `A1:${config.lastColumn}${personalSheetRowLimit + 2}`,
  );
  return { sourceUrl: source.toString(), csvUrl: csv.toString() };
}

// CSV preserves mixed text/number columns that GViz can coerce to null. Every
// cell remains plain text, including formulas, URLs, zeroes, and percentages.
export function parseGoogleSheetCsv(body: string, tab: PersonalSheetTab) {
  if (!isPersonalSheetTab(tab))
    throw new Error("허용된 시트만 조회할 수 있습니다.");
  if (new TextEncoder().encode(body).byteLength > personalSheetResponseLimit)
    throw new Error("시트 응답이 너무 큽니다. 원본 시트에서 확인해 주세요.");
  const content = body.replace(/^\uFEFF/, "");
  let headers: string[] | null = null;
  const rows: string[][] = [];
  let dataRows = 0;
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let closedQuote = false;
  let startedField = false;
  const addCell = () => {
    row.push(cell);
    if (row.length > personalSheetTabs[tab].width)
      throw new Error("허용된 시트 범위를 확인하지 못했습니다.");
    cell = "";
    closedQuote = false;
    startedField = false;
  };
  const addRow = () => {
    addCell();
    if (headers === null) headers = row;
    else if (row.some((value) => value !== "")) {
      dataRows++;
      if (rows.length < personalSheetRowLimit) rows.push(row);
    }
    row = [];
  };
  for (let index = 0; index < content.length; index++) {
    const char = content[index];
    if (inQuotes) {
      if (char === '"') {
        if (content[index + 1] === '"') {
          cell += '"';
          index++;
        } else {
          inQuotes = false;
          closedQuote = true;
        }
      } else cell += char;
      continue;
    }
    if (char === ",") addCell();
    else if (char === "\r" || char === "\n") {
      addRow();
      if (char === "\r" && content[index + 1] === "\n") index++;
    } else if (char === '"' && !startedField && !closedQuote) {
      inQuotes = true;
      startedField = true;
    } else {
      if (closedQuote || char === '"')
        throw new Error("시트 응답 형식을 확인하지 못했습니다.");
      cell += char;
      startedField = true;
    }
  }
  if (inQuotes) throw new Error("시트 응답 형식을 확인하지 못했습니다.");
  if (startedField || closedQuote || row.length) addRow();
  const labels: string[] = headers ?? [];
  const width = Math.max(
    labels.length,
    ...rows.map((value) => value.length),
    0,
  );
  const columns = Array.from(
    { length: width },
    (_, index) => labels[index] ?? "",
  );
  for (const value of rows) while (value.length < width) value.push("");
  // Trim only trailing columns whose header and displayed cells are all blank.
  while (
    columns.length > 0 &&
    !columns[columns.length - 1].trim() &&
    rows.every((value) => value[columns.length - 1] === "")
  ) {
    columns.pop();
    for (const value of rows) value.pop();
  }
  if (!columns.length) rows.length = 0;
  return {
    columns: columns.map((label, index) =>
      label.trim() ? label : String.fromCharCode(65 + index),
    ),
    rows,
    truncated: dataRows > personalSheetRowLimit,
  };
}

function allowedGoogleSheetRedirect(url: URL) {
  return (
    url.protocol === "https:" &&
    (!url.port || url.port === "443") &&
    !url.username &&
    !url.password &&
    (url.hostname === "docs.google.com" ||
      url.hostname.endsWith(".googleusercontent.com"))
  );
}

export async function fetchPersonalSheetCsv(
  spreadsheetId: string,
  tab: PersonalSheetTab,
  fetcher: typeof fetch = fetch,
) {
  const { sourceUrl, csvUrl } = personalSheetUrls(spreadsheetId, tab);
  let url = new URL(csvUrl);
  const signal = AbortSignal.timeout(12_000);
  for (let redirects = 0; redirects <= 3; redirects++) {
    const response = await fetcher(url, {
      cache: "no-store",
      redirect: "manual",
      credentials: "omit",
      signal,
      headers: { Accept: "text/csv" },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location || redirects === 3)
        throw new Error("원본 시트 연결을 확인하지 못했습니다.");
      const next = new URL(location, url);
      if (!allowedGoogleSheetRedirect(next))
        throw new Error("원본 시트 연결을 확인하지 못했습니다.");
      url = next;
      continue;
    }
    if (
      !response.ok ||
      !/^text\/csv(?:\s*;|$)/i.test(response.headers.get("content-type") ?? "")
    ) {
      await response.body?.cancel();
      throw new Error("원본 시트 접근 권한을 확인해 주세요.");
    }
    return { sourceUrl, body: await readLimitedSheetBody(response) };
  }
  throw new Error("원본 시트 연결을 확인하지 못했습니다.");
}

export async function readLimitedSheetBody(response: Response) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (declaredLength > personalSheetResponseLimit) {
    await response.body?.cancel();
    throw new Error("시트 응답이 너무 큽니다. 원본 시트에서 확인해 주세요.");
  }
  if (!response.body) throw new Error("시트 응답을 받지 못했습니다.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let body = "";
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > personalSheetResponseLimit) {
        await reader.cancel();
        throw new Error(
          "시트 응답이 너무 큽니다. 원본 시트에서 확인해 주세요.",
        );
      }
      body += decoder.decode(next.value, { stream: true });
    }
    return body + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}
