import { createHmac, timingSafeEqual } from "node:crypto";

/** Queue/logs retain only a short-lived signature, never the Vault secret. */
export function dispatchAuthorized(
  timestamp: string | null,
  signature: string | null,
  secret: string,
  now = Date.now(),
) {
  if (
    !timestamp ||
    !/^\d{10}$/.test(timestamp) ||
    !signature ||
    !/^[0-9a-f]{64}$/.test(signature)
  )
    return false;
  const age = now / 1000 - Number(timestamp);
  if (age < -30 || age > 300) return false;
  const expected = createHmac("sha256", secret)
    .update(`exercise-push:${timestamp}`)
    .digest();
  return timingSafeEqual(Buffer.from(signature, "hex"), expected);
}
