import { test } from "node:test";
import assert from "node:assert/strict";
import { needsPersonalContentType } from "../src/lib/personal-content-form.ts";

function form(extra: Record<string, string> = {}) {
  const f = new FormData();
  for (const [key, value] of Object.entries({
    type: "",
    step: "idea",
    review: "none",
    ...extra,
  }))
    f.set(`personal:${key}`, value);
  return f;
}
test("legacy content without personal inputs remains saveable", () => {
  assert.equal(needsPersonalContentType(form({ products: "  " })), false);
});
test("personal inputs cannot silently disappear without a type", () => {
  const cases: Record<string, string>[] = [
    { products: "product" },
    { checklist: "shoot" },
    { shoot_at: "2026-10-12T10:00" },
    { views: "0" },
    { step: "editing" },
    { review: "pending" },
    { "check:24": "on" },
    { sponsored: "on" },
  ];
  for (const extra of cases) {
    assert.equal(needsPersonalContentType(form(extra)), true);
    assert.equal(
      needsPersonalContentType(form({ ...extra, type: "reel" })),
      false,
    );
  }
});
test("clearing an existing personal type cannot discard stored details", () => {
  assert.equal(needsPersonalContentType(form(), "reel"), true);
});
