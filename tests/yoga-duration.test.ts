import assert from "node:assert/strict";
import test from "node:test";
import {
  parsePersonalScheduleEdit,
  parseResource,
  parseYogaDurationMinutes,
} from "../src/lib/ops.ts";

const schedule = {
  title: "저녁 요가",
  starts_at: "2026-10-20T21:00:00+09:00",
  ends_at: "2026-10-20T22:00:00+09:00",
  category: "exercise",
  video_url: "https://video.example/yoga",
};

test("요가 소요 시간은 숫자 정수 1~1440 또는 명시적 null만 허용", () => {
  for (const duration of [null, 1, 20, 1440]) {
    assert.equal(parseYogaDurationMinutes(duration), duration);
    assert.equal(
      (
        parseResource("schedules", {
          ...schedule,
          duration_minutes: duration,
        }) as Record<string, unknown>
      ).duration_minutes,
      duration,
    );
    assert.equal(
      parsePersonalScheduleEdit({
        title: schedule.title,
        duration_minutes: duration,
      }).duration_minutes,
      duration,
    );
  }
  for (const duration of [
    undefined,
    0,
    -1,
    1441,
    1.5,
    "20",
    "",
    true,
    false,
    {},
    [],
    NaN,
    Infinity,
  ]) {
    assert.throws(() => parseYogaDurationMinutes(duration), /소요 시간/);
    assert.throws(
      () =>
        parseResource("schedules", { ...schedule, duration_minutes: duration }),
      /소요 시간/,
    );
    assert.throws(
      () =>
        parsePersonalScheduleEdit({
          title: schedule.title,
          duration_minutes: duration,
        }),
      /소요 시간/,
    );
  }
});

test("소요 시간 생략은 이전 저장값을 비우거나 숨긴 일정 시각을 재구성하지 않음", () => {
  const existing = {
    ...schedule,
    duration_minutes: 37,
    project_id: "11111111-1111-4111-8111-111111111111",
    notes: "기존 메모",
    owner_id: "소유자",
    deleted_at: null,
  };
  const before = structuredClone(existing);
  const edit = parsePersonalScheduleEdit({
    title: "제목만 수정",
    video_url: schedule.video_url,
  });
  assert.deepEqual(edit, {
    title: "제목만 수정",
    video_url: schedule.video_url,
  });
  assert.equal(
    Object.hasOwn(parseResource("schedules", schedule), "duration_minutes"),
    false,
  );
  assert.deepEqual(
    { ...existing, ...edit },
    { ...before, title: "제목만 수정" },
  );
  assert.deepEqual(existing, before);
  const cleared = parsePersonalScheduleEdit({
    title: schedule.title,
    duration_minutes: null,
  });
  assert.equal({ ...existing, ...cleared }.duration_minutes, null);
  for (const key of [
    "starts_at",
    "ends_at",
    "project_id",
    "notes",
    "owner_id",
    "category",
    "deleted_at",
    "purge_after",
  ])
    assert.throws(() =>
      parsePersonalScheduleEdit({
        title: schedule.title,
        duration_minutes: 20,
        [key]: existing[key as keyof typeof existing] ?? "hidden",
      }),
    );
});
