import test from "node:test";
import assert from "node:assert/strict";
import {
  moveYogaDay,
  validYogaDay,
  yogaDurationMinutes,
  yogaScheduleDay,
  yogaWeek,
  yogaWeekSummary,
} from "../src/lib/yoga-week.ts";

test("yoga weeks always show Monday through Sunday around the selected date", () => {
  assert.deepEqual(yogaWeek("2026-10-20"), [
    "2026-10-19",
    "2026-10-20",
    "2026-10-21",
    "2026-10-22",
    "2026-10-23",
    "2026-10-24",
    "2026-10-25",
  ]);
  assert.deepEqual(yogaWeek("2026-10-25"), yogaWeek("2026-10-19"));
  assert.equal(moveYogaDay("2026-10-20", -7), "2026-10-13");
  assert.equal(moveYogaDay("2026-10-20", 7), "2026-10-27");
});

test("week navigation handles year and leap-day boundaries without host timezone arithmetic", () => {
  assert.deepEqual(yogaWeek("2027-01-01"), [
    "2026-12-28",
    "2026-12-29",
    "2026-12-30",
    "2026-12-31",
    "2027-01-01",
    "2027-01-02",
    "2027-01-03",
  ]);
  assert.equal(moveYogaDay("2028-02-28", 1), "2028-02-29");
  assert.equal(moveYogaDay("2028-02-29", 1), "2028-03-01");
  assert.equal(yogaWeek("2026-02-29"), null);
  assert.equal(validYogaDay("2026-2-03"), false);
  assert.equal(moveYogaDay("invalid", 7), null);
  assert.equal(moveYogaDay("2026-10-20", 0.5), null);
});

test("a video's scheduled day follows Seoul midnight boundaries", () => {
  assert.equal(
    yogaScheduleDay({ id: "a", starts_at: "2026-10-19T14:59:59Z" }),
    "2026-10-19",
  );
  assert.equal(
    yogaScheduleDay({ id: "b", starts_at: "2026-10-19T15:00:00Z" }),
    "2026-10-20",
  );
  assert.equal(yogaScheduleDay({ id: "c", starts_at: "invalid" }), null);
});

test("duration remains unknown unless it is an explicit integer from 1 through 1440", () => {
  for (const value of [null, undefined, "20", 0, -1, 1.5, NaN, Infinity, 1441])
    assert.equal(yogaDurationMinutes(value), null);
  assert.equal(yogaDurationMinutes(20), 20);
  assert.equal(yogaDurationMinutes(1440), 1440);
});

test("weekly summaries count entered minutes separately from missing durations and exclude other days or categories", () => {
  const rows = [
    {
      id: "a",
      category: "exercise",
      starts_at: "2026-10-20T12:00:00Z",
      duration_minutes: 25,
    },
    {
      id: "b",
      category: "exercise",
      starts_at: "2026-10-20T12:00:00Z",
      duration_minutes: null,
      ends_at: "2026-10-20T13:00:00Z",
    },
    {
      id: "c",
      category: "exercise",
      starts_at: "2026-10-22T12:00:00Z",
      duration_minutes: 30,
    },
    {
      id: "d",
      category: "work",
      starts_at: "2026-10-22T12:00:00Z",
      duration_minutes: 60,
    },
    {
      id: "e",
      category: "exercise",
      starts_at: "2026-10-26T12:00:00Z",
      duration_minutes: 60,
    },
    {
      id: "f",
      category: "exercise",
      starts_at: "2026-10-22T12:00:00Z",
      duration_minutes: 60,
      deleted_at: "2026-10-20T12:00:00Z",
    },
  ];
  const before = structuredClone(rows);
  assert.deepEqual(yogaWeekSummary(rows, yogaWeek("2026-10-20")!), {
    registeredDays: 2,
    videoCount: 3,
    enteredMinutes: 55,
    missingDurations: 1,
  });
  assert.deepEqual(rows, before);
});
