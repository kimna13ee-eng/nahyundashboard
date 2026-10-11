export const desktopArtifact = {
  version: "2.1.0",
  filename: "MY OPS_2.1.0_x64-setup.exe",
  bytes: 2127839,
  sha256: "d240ca270772f6cd3b91cf0c28d45bd7075bae51570efd1920011159152c12e7",
  bucket: "myops-desktop-private",
  object: "releases/2.1.0/MY OPS_2.1.0_x64-setup.exe",
} as const;

export function desktopAccess(
  userId: string | null,
  allowedId?: string,
  enabled?: string,
) {
  if (!userId) return 401;
  if (!allowedId || enabled !== "true") return 503;
  if (userId !== allowedId) return 403;
  return 200;
}
