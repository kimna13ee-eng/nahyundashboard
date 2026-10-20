import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createECDH } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("최초 설정은 일치하는 VAPID/Vault 값을 비공개 파일에만 저장하고 재실행 시 회전하지 않음", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "myops-push-config-"));
  const script = resolve("scripts/create-exercise-push-config.mjs");
  try {
    const output = execFileSync(
      process.execPath,
      [script, "https://my-ops.example"],
      { cwd, encoding: "utf8" },
    );
    const file = join(cwd, "outputs/personal-exercise-push.private.env");
    const envText = await readFile(file, "utf8");
    const values = Object.fromEntries(
      envText
        .split("\n")
        .filter((line) => line && !line.startsWith("#"))
        .map((line) => {
          const at = line.indexOf("=");
          return [line.slice(0, at), line.slice(at + 1)];
        }),
    );
    const pair = createECDH("prime256v1");
    pair.setPrivateKey(
      Buffer.from(values.PERSONAL_PUSH_VAPID_PRIVATE_KEY, "base64url"),
    );
    assert.equal(
      pair.getPublicKey().toString("base64url"),
      values.PERSONAL_PUSH_VAPID_PUBLIC_KEY,
    );
    assert.equal(values.PERSONAL_PUSH_DISPATCH_SECRET.length, 43);
    for (const secret of [
      values.PERSONAL_PUSH_VAPID_PRIVATE_KEY,
      values.PERSONAL_PUSH_DISPATCH_SECRET,
    ])
      assert.equal(output.includes(secret), false);
    const vault = await readFile(
      join(cwd, "outputs/personal-exercise-push-vault.private.sql"),
      "utf8",
    );
    const cron = await readFile(
      "supabase/personal/setup_exercise_push_cron.sql",
      "utf8",
    );
    for (const name of [
      "ops_exercise_push_app_url",
      "ops_exercise_push_dispatch_secret",
    ]) {
      assert.ok(vault.includes(name));
      assert.ok(cron.includes(name));
    }
    assert.ok(
      vault.includes(
        `'${values.PERSONAL_PUSH_DISPATCH_SECRET}','ops_exercise_push_dispatch_secret'`,
      ),
    );
    assert.ok(
      vault.includes("'https://my-ops.example','ops_exercise_push_app_url'"),
    );
    assert.throws(() =>
      execFileSync(process.execPath, [script, "https://my-ops.example"], {
        cwd,
        stdio: "pipe",
      }),
    );
    assert.equal(await readFile(file, "utf8"), envText);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
