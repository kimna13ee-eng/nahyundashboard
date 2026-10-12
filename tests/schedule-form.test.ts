import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addSeoulMinutes,
  scheduleDefaults,
  scheduleRangeError,
} from "../src/lib/schedule-form.ts";

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
