import { test } from "node:test";
import assert from "node:assert/strict";
import { validDesktopInstaller } from "../src/lib/desktop-integrity.ts";
import { desktopAccess, desktopArtifact } from "../src/lib/desktop-artifact.ts";
test("desktop download is fail closed without verified user and explicit setup", () => {
  assert.equal(desktopAccess(null, "owner", "true"), 401);
  assert.equal(desktopAccess("other", "owner", "true"), 403);
  assert.equal(desktopAccess("owner", undefined, "true"), 503);
  assert.equal(desktopAccess("owner", "owner", "false"), 503);
  assert.equal(desktopAccess("owner", "owner", "true"), 200);
});
test("truncated and same-size invalid installer bytes are rejected", () => {
  assert.equal(validDesktopInstaller(new Uint8Array(10)), false);
  assert.equal(
    validDesktopInstaller(new Uint8Array(desktopArtifact.bytes)),
    false,
  );
});
test("desktop release contract pins original installer version size and digest", () => {
  assert.equal(desktopArtifact.version, "2.1.0");
  assert.equal(desktopArtifact.bytes, 2127839);
  assert.match(desktopArtifact.sha256, /^[a-f0-9]{64}$/);
  assert.equal(
    desktopArtifact.object,
    "releases/2.1.0/MY OPS_2.1.0_x64-setup.exe",
  );
});
