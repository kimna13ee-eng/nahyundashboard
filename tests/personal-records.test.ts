import test from "node:test";
import assert from "node:assert/strict";
import {
  parsePersonalRecordBody,
  parsePersonalRecordCreate,
  parsePersonalRecordPatch,
  personalRecordCreateMatches,
  personalRecordQueryAllowed,
  personalRecordFailure,
  type PersonalRecord,
} from "../src/lib/personal-records.ts";

const id = "11111111-1111-4111-8111-111111111111";
const stamp = "2026-11-09T09:12:34.123456+09:00";
const create = {
  id,
  body: "오늘의 작은 기록",
  kind: "note",
  entry_date: "2026-11-09",
};
const identity = { id, expectedUpdatedAt: stamp };

test("personal records preserve multiline Unicode text and reject empty/oversized inputs", () => {
  assert.equal(
    parsePersonalRecordBody(" \n기록\n두 번째 줄\t "),
    "기록\n두 번째 줄",
  );
  assert.equal(
    Array.from(parsePersonalRecordBody("😀".repeat(6000))).length,
    6000,
  );
  for (const body of [
    "",
    "\u00a0\u2003",
    "a\0b",
    "😀".repeat(6001),
    null,
    5,
    [],
  ])
    assert.throws(() => parsePersonalRecordBody(body));
});

test("create validates real dates, todo-only completion, and rejects field injection", () => {
  assert.deepEqual(parsePersonalRecordCreate(create), {
    ...create,
    done: false,
  });
  assert.equal(
    parsePersonalRecordCreate({ ...create, entry_date: "2028-02-29" })
      .entry_date,
    "2028-02-29",
  );
  assert.equal(
    parsePersonalRecordCreate({ ...create, kind: "todo", done: true }).done,
    true,
  );
  for (const entry_date of [
    "2026-02-29",
    "2026-11-31",
    "0000-01-01",
    "2026-1-01",
    "infinity",
    null,
  ])
    assert.throws(() => parsePersonalRecordCreate({ ...create, entry_date }));
  for (const field of [
    "owner_id",
    "created_at",
    "updated_at",
    "archived_at",
    "workspace",
    "title",
  ])
    assert.throws(() =>
      parsePersonalRecordCreate({ ...create, [field]: "injected" }),
    );
  for (const raw of [
    null,
    [],
    Object.create(create),
    { ...create, id: "bad" },
    { ...create, kind: "diary" },
    { ...create, done: true },
    { ...create, done: "false" },
  ])
    assert.throws(() => parsePersonalRecordCreate(raw));
});

test("patch keeps raw CAS precision and clears completion when changing away from todo", () => {
  assert.deepEqual(parsePersonalRecordPatch({ ...identity, body: " 修正 " }), {
    ...identity,
    body: "修正",
  });
  assert.deepEqual(parsePersonalRecordPatch({ ...identity, kind: "idea" }), {
    ...identity,
    kind: "idea",
    done: false,
  });
  assert.deepEqual(parsePersonalRecordPatch({ ...identity, done: false }), {
    ...identity,
    done: false,
  });
  assert.deepEqual(
    parsePersonalRecordPatch({ ...identity, action: "restore" }),
    { ...identity, action: "restore" },
  );
  for (const raw of [
    identity,
    { ...identity, done: "false" },
    { ...identity, kind: "note", done: true },
    { ...identity, action: "delete" },
    { ...identity, action: "archive", body: "overwritten" },
    { ...identity, action: "restore", done: false },
    { ...identity, body: "memo", owner_id: id },
    ...[
      "2026-11-09T09:12:34",
      "2026-02-30T09:12:34Z",
      "2026-11-09T24:00:00Z",
      "2026-11-09T09:00:00.1234567Z",
      "2026-11-09T09:00:00+16:00",
      "now",
      null,
    ].map((expectedUpdatedAt) => ({
      ...identity,
      expectedUpdatedAt,
      done: true,
    })),
  ])
    assert.throws(() => parsePersonalRecordPatch(raw));
});

test("lost create responses can be retried without overwriting edited or archived records", () => {
  const value = parsePersonalRecordCreate(create);
  const row: PersonalRecord = {
    ...value,
    archived_at: null,
    created_at: stamp,
    updated_at: stamp,
  };
  assert.equal(personalRecordCreateMatches(row, value), true);
  for (const changed of [
    { ...row, body: "later edit" },
    { ...row, kind: "idea" as const },
    { ...row, entry_date: "2026-11-10" },
    { ...row, archived_at: stamp },
    { ...row, done: true },
  ])
    assert.equal(personalRecordCreateMatches(changed, value), false);
});

test("records endpoint cannot override PERSONAL scope and exposes setup failures safely", () => {
  for (const query of ["", "workspace=PERSONAL"])
    assert.equal(personalRecordQueryAllowed(new URLSearchParams(query)), true);
  for (const query of [
    "workspace=FRENGLE",
    "workspace=ALL",
    "workspace=PERSONAL&workspace=PERSONAL",
    "owner_id=x",
    "workspace=PERSONAL&limit=9000",
  ])
    assert.equal(personalRecordQueryAllowed(new URLSearchParams(query)), false);
  for (const code of ["42P01", "42703", "PGRST204", "PGRST205"]) {
    const failure = personalRecordFailure({ code });
    assert.equal(failure.status, 503);
    assert.equal(
      "setupRequired" in failure.body && failure.body.setupRequired,
      true,
    );
  }
  assert.equal(personalRecordFailure({ code: "23514" }).status, 400);
  assert.equal(personalRecordFailure({ code: "42501" }).status, 503);
});
