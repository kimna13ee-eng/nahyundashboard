import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addSeoulMinutes,
  personalScheduleFields,
  scheduleDefaults,
  scheduleRangeError,
} from "../src/lib/schedule-form.ts";

test("개인 콘텐츠 신규 일정은 서울 선택 날짜의 종일 범위를 사용", () => {
  for (const [day, starts_at, ends_at] of [
    ["2026-10-31", "2026-10-30T15:00:00.000Z", "2026-10-31T15:00:00.000Z"],
    ["2026-12-31", "2026-12-30T15:00:00.000Z", "2026-12-31T15:00:00.000Z"],
    ["2028-02-29", "2028-02-28T15:00:00.000Z", "2028-02-29T15:00:00.000Z"],
  ]) {
    assert.deepEqual(personalScheduleFields(day), {
      starts_at,
      ends_at,
      project_id: null,
      notes: "",
    });
  }
});

test("개인 일정은 잘못된 날짜와 윤년이 아닌 2월 29일을 거부", () => {
  for (const day of [
    "2026-02-29",
    "2026-02-30",
    "2026-04-31",
    "2026-13-01",
    "2026-00-12",
    "2026-1-02",
    "2026-10-01 ",
    "0000-01-01",
    "",
    "날짜 없음",
  ])
    assert.throws(() => personalScheduleFields(day), /날짜를 확인/);
});

test("신규 운동 일정은 선택 날짜 서울 21시부터 22시", () => {
  assert.deepEqual(personalScheduleFields("2026-10-20", true), {
    starts_at: "2026-10-20T12:00:00.000Z",
    ends_at: "2026-10-20T13:00:00.000Z",
    project_id: null,
    notes: "",
  });
});

test("신규 일정은 선택 날짜의 09시부터 60분으로 초기화", () => {
  assert.deepEqual(scheduleDefaults("2026-10-12"), {
    startsAt: "2026-10-12T09:00",
    endsAt: "2026-10-12T10:00",
  });
});

test("서울 로컬 시간에서 60분을 더할 때 자정과 월 경계를 처리", () => {
  assert.equal(addSeoulMinutes("2026-10-12T23:30", 60), "2026-10-13T00:30");
  assert.equal(addSeoulMinutes("2026-10-31T23:30", 60), "2026-11-01T00:30");
});

test("수동 종료시간이 시작시간보다 늦지 않으면 검증 메시지를 반환", () => {
  assert.equal(
    scheduleRangeError("2026-10-12T23:30", "2026-10-12T22:30"),
    "종료시간은 시작시간보다 늦어야 합니다.",
  );
  assert.equal(scheduleRangeError("2026-10-12T23:30", "2026-10-13T00:30"), "");
});

test("존재하지 않는 서울 로컬 날짜는 거부", () => {
  assert.equal(addSeoulMinutes("2026-02-30T09:00", 60), "");
  assert.equal(
    scheduleRangeError("2026-02-30T09:00", "2026-02-30T10:00"),
    "시작시간과 종료시간을 확인해 주세요.",
  );
});
