import assert from "node:assert/strict";
import test from "node:test";
import {
  overviewMemoFailure,
  overviewMemoQueryAllowed,
  parseOverviewMemoBody,
  parseOverviewMemoCreate,
  parseOverviewMemoPatch,
} from "../src/lib/overview-memos.ts";

const identity = {
  id: "11111111-1111-4111-8111-111111111111",
  expected_updated_at: "2026-10-23T09:12:34.123456+09:00",
};

test("메모는 앞뒤 공백을 정리하며 내부 줄바꿈과 최대 1000 Unicode 문자를 보존", () => {
  assert.equal(
    parseOverviewMemoBody(" \t 첫 줄\n다음 줄 \r\n"),
    "첫 줄\n다음 줄",
  );
  assert.equal(parseOverviewMemoBody("😀".repeat(1000)), "😀".repeat(1000));
  assert.deepEqual(parseOverviewMemoCreate({ body: "  새 메모  " }), {
    body: "새 메모",
  });
  for (const body of [
    "",
    " \t\r\n\u00a0",
    "가".repeat(1001),
    "😀".repeat(1001),
    null,
    undefined,
    1,
    true,
    {},
    [],
  ])
    assert.throws(() => parseOverviewMemoBody(body));
});

test("메모 생성은 body만 허용하며 owner·상태·시간 대입을 차단", () => {
  for (const extra of [
    "owner_id",
    "id",
    "done",
    "created_at",
    "updated_at",
    "deleted_at",
    "workspace",
    "action",
  ])
    assert.throws(() =>
      parseOverviewMemoCreate({ body: "메모", [extra]: "injected" }),
    );
  for (const raw of [
    [],
    new Date(),
    null,
    "text",
    {},
    Object.create({ body: "상속" }),
    { body: "메모", [Symbol("extra")]: true },
  ])
    assert.throws(() => parseOverviewMemoCreate(raw));
});

test("메모 수정의 마이크로초 토큰은 원문 유지, 생략한 필드는 대입하지 않음", () => {
  assert.deepEqual(
    parseOverviewMemoPatch({ ...identity, body: "  문구 수정  " }),
    { ...identity, body: "문구 수정" },
  );
  assert.deepEqual(parseOverviewMemoPatch({ ...identity, done: false }), {
    ...identity,
    done: false,
  });
  assert.deepEqual(
    parseOverviewMemoPatch({ ...identity, body: "수정", done: true }),
    { ...identity, body: "수정", done: true },
  );
  for (const action of ["archive", "restore"])
    assert.deepEqual(parseOverviewMemoPatch({ ...identity, action }), {
      ...identity,
      action,
    });
  assert.equal(
    parseOverviewMemoPatch({ ...identity, done: true }).expected_updated_at,
    identity.expected_updated_at,
  );
});

test("수정·보관·복구는 엄격한 필드 계약과 체크 boolean·시각 토큰을 요구", () => {
  for (const value of [
    { ...identity },
    { ...identity, body: undefined },
    { ...identity, done: "false" },
    { ...identity, done: null },
    { ...identity, body: "수정", owner_id: "다른 계정" },
    { ...identity, body: "수정", deleted_at: null },
    { ...identity, action: "delete" },
    { ...identity, action: "archive", done: true },
    { ...identity, action: "restore", body: "덮어쓰기" },
    { ...identity, action: undefined },
    { ...identity, done: true, id: "wrong" },
    ...[
      undefined,
      null,
      "",
      "now",
      "2026-10-23T09:00:00",
      "2026-10-23T09:00:00.1234567Z",
      "infinity",
      "2026-02-30T09:00:00Z",
      "2026-10-23T24:00:00Z",
      "0000-01-01T00:00:00Z",
      "2026-10-23T09:00:00+16:00",
    ].map((expected_updated_at) => ({
      ...identity,
      expected_updated_at,
      done: true,
    })),
  ])
    assert.throws(() => parseOverviewMemoPatch(value));
});

test("메모 endpoint query는 생략 또는 단일 FRENGLE 외 범위 변경을 거절", () => {
  assert.equal(overviewMemoQueryAllowed(new URLSearchParams()), true);
  assert.equal(
    overviewMemoQueryAllowed(new URLSearchParams("workspace=FRENGLE")),
    true,
  );
  for (const query of [
    "workspace=PERSONAL",
    "workspace=ALL",
    "workspace=frengle",
    "workspace=",
    "workspace=FRENGLE&workspace=FRENGLE",
    "workspace=PERSONAL&workspace=FRENGLE",
    "owner_id=x",
    "workspace=FRENGLE&limit=1000",
  ])
    assert.equal(overviewMemoQueryAllowed(new URLSearchParams(query)), false);
});

test("스키마 누락은 설정 필요 503, DB 원문은 응답에 노출하지 않음", () => {
  for (const code of ["42P01", "42703", "PGRST204", "PGRST205"]) {
    const failure = overviewMemoFailure({ code });
    assert.equal(failure.status, 503);
    assert.equal(
      "setupRequired" in failure.body && failure.body.setupRequired,
      true,
    );
  }
  assert.equal(overviewMemoFailure({ code: "23514" }).status, 400);
  assert.equal(overviewMemoFailure({ code: "42501" }).status, 503);
  assert.equal(overviewMemoFailure(null).status, 503);
});
