import { seoulDate, type OpsRow } from "./ops.ts";

const DAY = 24 * 60 * 60 * 1000;

export function validYogaDay(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000-"))
    return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

export function moveYogaDay(value: string, offset: number) {
  if (!validYogaDay(value) || !Number.isInteger(offset)) return null;
  const timestamp = Date.parse(`${value}T00:00:00Z`) + offset * DAY;
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return null;
  const result = date.toISOString().slice(0, 10);
  return validYogaDay(result) ? result : null;
}

/** Calendar weeks run Monday through Sunday, independent of the host timezone. */
export function yogaWeek(value: string) {
  if (!validYogaDay(value)) return null;
  const weekday = new Date(`${value}T00:00:00Z`).getUTCDay();
  const monday = moveYogaDay(value, -((weekday + 6) % 7));
  if (!monday) return null;
  const dates = Array.from({ length: 7 }, (_, offset) =>
    moveYogaDay(monday, offset),
  );
  return dates.every((date): date is string => date !== null) ? dates : null;
}

export function yogaScheduleDay(row: OpsRow) {
  if (typeof row.starts_at !== "string") return null;
  const date = new Date(row.starts_at);
  return Number.isFinite(date.getTime()) ? seoulDate(date) : null;
}

/** A missing duration stays unknown; schedule start/end times are never used. */
export function yogaDurationMinutes(value: unknown) {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 1440
    ? value
    : null;
}

export function yogaWeekSummary(rows: OpsRow[], dates: string[]) {
  const entries = rows.filter(
    (row) =>
      row.category === "exercise" &&
      !row.deleted_at &&
      dates.includes(yogaScheduleDay(row) || ""),
  );
  const minutes = entries.map((row) =>
    yogaDurationMinutes(row.duration_minutes),
  );
  return {
    registeredDays: new Set(entries.map(yogaScheduleDay)).size,
    videoCount: entries.length,
    enteredMinutes: minutes.reduce<number>(
      (sum, value) => sum + (value ?? 0),
      0,
    ),
    missingDurations: minutes.filter((value) => value === null).length,
  };
}
