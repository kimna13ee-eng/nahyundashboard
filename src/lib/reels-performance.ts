import type { PersonalSheetData } from "./personal-sheets.ts";

export const reelsMetricKeys = [
  "views",
  "likes",
  "comments",
  "saves",
  "shares",
  "reactions",
] as const;
export type ReelsMetricKey = (typeof reelsMetricKeys)[number];
export type ReelsMetrics = Record<ReelsMetricKey, number | null>;
export const reelsScoreMetricKeys = [
  "views",
  "likes",
  "comments",
  "saves",
  "shares",
] as const;
export type ReelsScoreMetricKey = (typeof reelsScoreMetricKeys)[number];
/** Equal weights; reactions are derived and must not be counted a second time. */
export const reelsScoreWeights: Readonly<Record<ReelsScoreMetricKey, number>> =
  Object.freeze({
    views: 0.2,
    likes: 0.2,
    comments: 0.2,
    saves: 0.2,
    shares: 0.2,
  });
export type ReelsPerformanceScore = {
  value: number | null;
  scored: number;
  total: number;
  maxima: Record<ReelsScoreMetricKey, number>;
};
export type ReelsPerformanceEntry = ReelsMetrics & {
  id: string;
  title: string;
  url?: string;
  publishedAt: string;
  observedAt: string | null;
  score: number | null;
};
export type ReelsMetricCoverage = {
  observed: number;
  total: number;
  complete: boolean;
};
export type ReelsPerformanceSummary = {
  entries: ReelsPerformanceEntry[];
  totals: ReelsMetrics;
  coverage: Record<ReelsMetricKey, ReelsMetricCoverage>;
  postCount: number;
  /** Eligible source observations, before selecting one observation per ID. */
  observationCount: number;
  /** Selected posts with at least one usable numeric metric. */
  observedRowCount: number;
  rejectedRowCount: number;
  missingColumns: string[];
  overflowMetrics: ReelsMetricKey[];
  performanceScore: ReelsPerformanceScore;
};
export type ReelsPerformanceSource = {
  readonly columns: Readonly<PersonalSheetData["columns"]>;
  readonly rows: readonly Readonly<PersonalSheetData["rows"][number]>[];
};

const columnNames = {
  id: "콘텐츠 ID",
  url: "발행 URL",
  publishedAt: "발행일",
  status: "발행상태",
  format: "형식",
  views: "조회수",
  likes: "좋아요",
  comments: "댓글",
  saves: "저장",
  shares: "공유",
  observedAt: "관측일",
  title: "콘텐츠 요약",
} as const;
type ColumnKey = keyof typeof columnNames;
const countedMetrics = reelsScoreMetricKeys;
const reactionMetrics = ["likes", "comments", "saves", "shares"] as const;

const normalized = (value: string) => value.normalize("NFKC").trim();
const headerKey = (value: string) => normalized(value).replace(/\s+/g, "");

/** Counts are whole, finite, nonnegative safe integers; missing is never zero. */
export function parseReelsMetric(raw: unknown): number | null {
  if (typeof raw === "number")
    return Number.isSafeInteger(raw) && raw >= 0 ? raw : null;
  if (typeof raw !== "string") return null;
  const value = normalized(raw);
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.0+)?$/.test(value)) return null;
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function validDay(raw: string): string | null {
  const value = normalized(raw);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
    ? value
    : null;
}

function seoulToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function publicLink(raw: string): string | undefined {
  const value = raw.trim();
  if (!value || /[\u0000-\u0020\u007f]/.test(value)) return undefined;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

function safeSum(values: readonly number[]): number | null {
  if (!values.length) return null;
  const sum = values.reduce((total, value) => total + BigInt(value), BigInt(0));
  return sum <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(sum) : null;
}

function totalRow(id: string) {
  return /^(?:합계|총계|총합|소계|누계|전체|total|grandtotal|subtotal)(?:\([^)]*\))?$/i.test(
    headerKey(id),
  );
}

function relativeScores(
  entries: ReelsPerformanceEntry[],
): ReelsPerformanceScore {
  const complete = entries.filter((entry) =>
    reelsScoreMetricKeys.every((key) => entry[key] !== null),
  );
  const maxima = Object.fromEntries(
    reelsScoreMetricKeys.map((key) => [
      key,
      complete.reduce((maximum, entry) => Math.max(maximum, entry[key]!), 0),
    ]),
  ) as Record<ReelsScoreMetricKey, number>;
  const unrounded: number[] = [];
  for (const entry of complete) {
    const value = reelsScoreMetricKeys.reduce(
      (score, key) =>
        score +
        (maxima[key] === 0
          ? 0
          : (entry[key]! / maxima[key]) * 100 * reelsScoreWeights[key]),
      0,
    );
    unrounded.push(value);
    entry.score = Math.round(value * 10) / 10;
  }
  return {
    value: unrounded.length
      ? Math.round(
          (unrounded.reduce((sum, value) => sum + value, 0) /
            unrounded.length) *
            10,
        ) / 10
      : null,
    scored: complete.length,
    total: entries.length,
    maxima,
  };
}

/** Actual counts plus a relative score within complete, selected observations. */
export function summarizeReelsPerformance(
  source: ReelsPerformanceSource,
  options: { today?: string } = {},
): ReelsPerformanceSummary {
  const today = validDay(options.today ?? seoulToday());
  if (!today) throw new Error("성과 집계 기준 날짜를 확인해 주세요.");
  const positions = new Map<string, number[]>();
  source.columns.forEach((column, index) => {
    const key = headerKey(column);
    positions.set(key, [...(positions.get(key) ?? []), index]);
  });
  const indexes = Object.fromEntries(
    Object.entries(columnNames).map(([key, title]) => {
      const found = positions.get(headerKey(title));
      return [key, found?.length === 1 ? found[0] : undefined];
    }),
  ) as Record<ColumnKey, number | undefined>;
  const missingColumns = (Object.keys(columnNames) as ColumnKey[])
    .filter(
      (key) => !["url", "title"].includes(key) && indexes[key] === undefined,
    )
    .map((key) => columnNames[key]);
  const cell = (row: readonly string[], key: ColumnKey) => {
    const index = indexes[key];
    return index === undefined ? "" : (row[index] ?? "");
  };
  const selected = new Map<string, ReelsPerformanceEntry>();
  let observationCount = 0;
  for (const row of source.rows) {
    const id = normalized(cell(row, "id"));
    if (!id || totalRow(id)) continue;
    if (
      normalized(cell(row, "status")) !== "발행" ||
      normalized(cell(row, "format")) !== "릴스"
    )
      continue;
    const publishedAt = validDay(cell(row, "publishedAt"));
    if (!publishedAt || publishedAt > today) continue;
    const rawObservedAt = cell(row, "observedAt").trim();
    const observedAt = rawObservedAt ? validDay(rawObservedAt) : null;
    if (
      rawObservedAt &&
      (!observedAt || observedAt > today || observedAt < publishedAt)
    )
      continue;
    observationCount++;
    const metrics = Object.fromEntries(
      countedMetrics.map((key) => [key, parseReelsMetric(cell(row, key))]),
    ) as Omit<ReelsMetrics, "reactions">;
    const reactionValues = reactionMetrics.map((key) => metrics[key]);
    const reactions = reactionValues.every((value) => value !== null)
      ? safeSum(reactionValues as number[])
      : null;
    const entry: ReelsPerformanceEntry = {
      id,
      title: cell(row, "title").trim() || id,
      ...(publicLink(cell(row, "url"))
        ? { url: publicLink(cell(row, "url")) }
        : {}),
      publishedAt,
      observedAt,
      ...metrics,
      reactions,
      score: null,
    };
    const previous = selected.get(id);
    // An undated row cannot replace a dated observation. Same-day snapshots
    // use the last source row; no missing metric is carried from an older row.
    if (!previous || (observedAt ?? "") >= (previous.observedAt ?? ""))
      selected.set(id, entry);
  }
  const entries = [...selected.values()].sort(
    (left, right) =>
      left.publishedAt.localeCompare(right.publishedAt) ||
      left.id.localeCompare(right.id),
  );
  const coverage = {} as Record<ReelsMetricKey, ReelsMetricCoverage>;
  const performanceScore = relativeScores(entries);
  const totals = {} as ReelsMetrics;
  const overflowMetrics: ReelsMetricKey[] = [];
  for (const key of reelsMetricKeys) {
    const observed = entries
      .map((entry) => entry[key])
      .filter((value): value is number => value !== null);
    totals[key] = safeSum(observed);
    if (observed.length && totals[key] === null) overflowMetrics.push(key);
    coverage[key] = {
      observed: observed.length,
      total: entries.length,
      complete:
        entries.length > 0 &&
        observed.length === entries.length &&
        totals[key] !== null,
    };
  }
  return {
    entries,
    totals,
    coverage,
    postCount: entries.length,
    observationCount,
    observedRowCount: entries.filter((entry) =>
      countedMetrics.some((key) => entry[key] !== null),
    ).length,
    rejectedRowCount: source.rows.length - observationCount,
    missingColumns,
    overflowMetrics,
    performanceScore,
  };
}
