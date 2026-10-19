import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calculateLeave,
  parseLeaveProfile,
  parseLeaveUsage,
  seoulToday,
  type LeaveProfile,
} from "../src/lib/leave.ts";

const profile: LeaveProfile = {
  hire_date: "2026-08-03",
  prior_used: 1,
  prior_used_date: "2026-09-25",
};

test("입사일 기준 매월 개근 가정: 10월19일 발생2 사용1 잔여1", () => {
  const result = calculateLeave(profile, [], "2026-10-19");
  assert.equal(result.granted, 2);
  assert.equal(result.used, 1);
  assert.equal(result.balance, 1);
  assert.deepEqual(result.nextGrant, {
    date: "2026-11-03",
    amount: 1,
    kind: "monthly",
  });
  assert.equal(calculateLeave(profile, [], "2026-09-02").granted, 0);
  assert.equal(calculateLeave(profile, [], "2026-09-03").granted, 1);
  assert.equal(calculateLeave(profile, [], "2026-09-24").used, 0);
  assert.equal(calculateLeave(profile, [], "2026-09-25").balance, 0);
  assert.equal(calculateLeave(profile, [], "2026-10-02").granted, 1);
  assert.equal(calculateLeave(profile, [], "2026-10-03").granted, 2);
});

test("0.5일 사용·미래 사용 제외·기존 수동 원장 부호를 한 번씩 반영", () => {
  const result = calculateLeave(
    profile,
    [
      { id: "a", date: "2026-10-10", kind: "use", amount: "-0.5" },
      { id: "b", date: "2026-10-20", kind: "use", amount: -1 },
      { id: "c", date: "2026-10-11", kind: "grant", amount: 2 },
      { id: "d", date: "2026-10-12", kind: "adjust", amount: -0.5 },
      { id: "e", date: "2026-10-13", kind: "adjust", amount: 1 },
      { id: "f", date: "2026-12-01", kind: "grant", amount: 10 },
    ],
    "2026-10-19",
  );
  assert.equal(result.granted, 4);
  assert.equal(result.used, 1.5);
  assert.equal(result.adjustment, 0.5);
  assert.equal(result.balance, 3);
});

test("첫해 월차11개까지만 발생하고 1주년에 미사용분 만료 및 연15개 발생", () => {
  const before = calculateLeave(profile, [], "2027-08-02");
  assert.equal(before.granted, 11);
  assert.equal(before.balance, 10);
  assert.deepEqual(before.nextGrant, {
    date: "2027-08-03",
    amount: 15,
    kind: "annual",
  });
  const anniversary = calculateLeave(profile, [], "2027-08-03");
  assert.equal(anniversary.granted, 26);
  assert.equal(anniversary.expired, 10);
  assert.equal(anniversary.used, 1);
  assert.equal(anniversary.balance, 15);
  assert.equal(
    anniversary.lots.filter((lot) => lot.kind === "monthly").length,
    11,
  );
  assert.equal(calculateLeave(profile, [], "2027-09-03").granted, 26);
  const annualExpiry = calculateLeave(
    profile,
    [{ date: "2027-08-03", kind: "use", amount: -0.5 }],
    "2028-08-03",
  );
  assert.equal(annualExpiry.expired, 24.5);
  assert.equal(annualExpiry.balance, 15);
  assert.equal(calculateLeave(profile, [], "2029-08-03").balance, 16);
  assert.equal(calculateLeave(profile, [], "2047-08-03").balance, 25);
  assert.equal(calculateLeave(profile, [], "2050-08-03").balance, 25);
});

test("만료가 빠른 연차부터 사용하고 만료 없는 수동 추가 연차는 보존", () => {
  const result = calculateLeave(
    profile,
    [
      { date: "2027-07-01", kind: "grant", amount: 2 },
      { date: "2027-07-02", kind: "use", amount: -0.5 },
    ],
    "2027-08-03",
  );
  assert.equal(result.expired, 9.5);
  assert.equal(result.balance, 17);
  assert.equal(result.lots.find((lot) => lot.kind === "manual")?.remaining, 2);
});

test("사용일 미확인 초기값은 날짜를 만들어 저장하지 않고 첫해 잔액에 반영", () => {
  const unknown = { ...profile, prior_used: 0.5, prior_used_date: null };
  const result = calculateLeave(unknown, [], "2026-10-19");
  assert.equal(result.unknownPriorUsedDate, true);
  assert.equal(result.used, 0.5);
  assert.equal(result.balance, 1.5);
  assert.equal(calculateLeave(unknown, [], "2027-08-03").balance, 15);
  assert.equal(calculateLeave(unknown, [], "2027-08-03").expired, 10.5);
  assert.equal(calculateLeave(unknown, [], "2026-08-02").used, 0);
});

test("월말·윤일 계산과 한국시간 날짜 경계를 일정하게 처리", () => {
  const endMonth = {
    hire_date: "2025-01-31",
    prior_used: 0,
    prior_used_date: null,
  };
  assert.equal(calculateLeave(endMonth, [], "2025-02-27").granted, 0);
  assert.deepEqual(calculateLeave(endMonth, [], "2025-02-28").nextGrant, {
    date: "2025-03-31",
    amount: 1,
    kind: "monthly",
  });
  assert.equal(calculateLeave(endMonth, [], "2025-03-30").granted, 1);
  assert.equal(calculateLeave(endMonth, [], "2025-03-31").granted, 2);
  assert.equal(
    calculateLeave({ ...endMonth, hire_date: "2024-02-29" }, [], "2025-02-28")
      .balance,
    15,
  );
  assert.equal(seoulToday(new Date("2026-10-18T14:59:59Z")), "2026-10-18");
  assert.equal(seoulToday(new Date("2026-10-18T15:00:00Z")), "2026-10-19");
});

test("프로필과 사용 입력은 실제 날짜·유한한 반일 단위만 허용", () => {
  assert.deepEqual(parseLeaveProfile(profile), profile);
  for (const date of ["2026-02-30", "2026-2-03", "", "1899-01-01"])
    assert.throws(() => parseLeaveProfile({ ...profile, hire_date: date }));
  for (const amount of [NaN, Infinity, -0.5, 0.1, 366, "1", null])
    assert.throws(() => parseLeaveProfile({ ...profile, prior_used: amount }));
  assert.throws(() =>
    parseLeaveProfile({ ...profile, prior_used_date: "2026-07-01" }),
  );
  assert.throws(() => parseLeaveProfile({ ...profile, prior_used: 0 }));
  assert.deepEqual(parseLeaveUsage({ date: "2026-10-19", amount: 0.5 }), {
    date: "2026-10-19",
    amount: -0.5,
    kind: "use",
    title: "반차",
  });
  assert.equal(
    parseLeaveUsage({ date: "2026-10-19", amount: 1, title: "  휴가  " }).title,
    "휴가",
  );
  for (const amount of [0, -0.5, 1.5, 0.1, Infinity, "0.5"])
    assert.throws(() => parseLeaveUsage({ date: "2026-10-19", amount }));
});

test("입사일을 확인한 사용 요청은 입사 전 날짜를 거절하고 당일·미래 날짜는 허용", () => {
  assert.throws(
    () => parseLeaveUsage({ date: "2026-08-02", amount: 0.5 }, "2026-08-03"),
    /입사일 이후/,
  );
  assert.equal(
    parseLeaveUsage({ date: "2026-08-03", amount: 0.5 }, "2026-08-03").date,
    "2026-08-03",
  );
  assert.equal(
    parseLeaveUsage({ date: "2026-12-01", amount: 1 }, "2026-08-03").date,
    "2026-12-01",
  );
  assert.throws(() =>
    parseLeaveUsage({ date: "2026-10-19", amount: 1 }, "2026-02-30"),
  );
});
