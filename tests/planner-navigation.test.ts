import assert from "node:assert/strict";
import test from "node:test";
import { plannerLocation } from "../src/lib/planner-navigation.ts";

test("existing iPhone calendar notification opens the same yoga date and video", () => {
  assert.deepEqual(
    plannerLocation(
      new URLSearchParams(
        "view=calendar&date=2026-11-12&schedule=13567098-1275-4f68-9b12-471ab1dd0001",
      ),
    ),
    {
      view: "yoga",
      day: "2026-11-12",
      schedule: "13567098-1275-4f68-9b12-471ab1dd0001",
    },
  );
});
test("retired workspace views resolve to content without retaining record IDs", () => {
  for (const view of [
    "overview",
    "personal-records",
    "projects",
    "settings",
    "personal-sheets",
    "",
  ]) {
    assert.deepEqual(
      plannerLocation(
        new URLSearchParams(
          `view=${view}&date=2026-11-12&schedule=13567098-1275-4f68-9b12-471ab1dd0001`,
        ),
      ),
      { view: "content" },
    );
  }
});
test("yoga deep links discard invalid dates and schedule IDs", () => {
  assert.deepEqual(
    plannerLocation(
      new URLSearchParams("view=yoga-planner&date=2026-02-30&schedule=invalid"),
    ),
    { view: "yoga" },
  );
});
