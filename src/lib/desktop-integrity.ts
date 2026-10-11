import { createHash } from "node:crypto";
import { desktopArtifact } from "./desktop-artifact.ts";
export function validDesktopInstaller(bytes: Uint8Array) {
  return (
    bytes.byteLength === desktopArtifact.bytes &&
    createHash("sha256").update(bytes).digest("hex") === desktopArtifact.sha256
  );
}
