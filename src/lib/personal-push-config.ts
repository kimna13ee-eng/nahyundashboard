import { createECDH } from "node:crypto";

export type PushConfiguration = {
  publicKey: string;
  privateKey: string;
  dispatchSecret: string;
  secretKey: string;
  databaseUrl: string;
  origin: string;
};
export type PushConfigurationChecks = {
  appUrl: boolean;
  databaseUrl: boolean;
  serviceKey: boolean;
  vapidKeyPair: boolean;
  dispatchSecret: boolean;
};

/** Checks are safe to display. The config remains server-only and must never
 * be serialized into diagnostics or logs. No real environment is read here. */
export function inspectPushConfiguration(
  env: Record<string, string | undefined>,
): {
  checks: PushConfigurationChecks;
  config: PushConfiguration | null;
} {
  const publicKey = env.PERSONAL_PUSH_VAPID_PUBLIC_KEY || "";
  const privateKey = env.PERSONAL_PUSH_VAPID_PRIVATE_KEY || "";
  const dispatchSecret = env.PERSONAL_PUSH_DISPATCH_SECRET || "";
  const secretKey = env.PERSONAL_SUPABASE_SECRET_KEY || "";
  let app: URL | null = null;
  let database: URL | null = null;
  try {
    app = new URL(env.APP_PUBLIC_URL || "");
  } catch {
    /* Report a boolean only. */
  }
  try {
    database = new URL(env.PERSONAL_SUPABASE_URL || "");
  } catch {
    /* Report a boolean only. */
  }
  let serviceKey = /^sb_secret_[A-Za-z0-9_-]{20,}$/.test(secretKey);
  if (
    !serviceKey &&
    /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(secretKey)
  ) {
    try {
      serviceKey =
        JSON.parse(Buffer.from(secretKey.split(".")[1], "base64url").toString())
          .role === "service_role";
    } catch {
      /* A malformed JWT is not a server configuration. */
    }
  }
  let vapidKeyPair = false;
  try {
    const pair = createECDH("prime256v1");
    pair.setPrivateKey(Buffer.from(privateKey, "base64url"));
    vapidKeyPair = pair.getPublicKey().toString("base64url") === publicKey;
  } catch {
    /* Never include crypto errors or key material in diagnostics. */
  }
  const checks: PushConfigurationChecks = {
    appUrl: Boolean(
      app &&
        app.protocol === "https:" &&
        !app.username &&
        !app.password &&
        !app.port,
    ),
    databaseUrl: Boolean(
      database &&
        database.protocol === "https:" &&
        /^[a-z0-9]+\.supabase\.co$/.test(database.hostname),
    ),
    serviceKey,
    vapidKeyPair,
    dispatchSecret: /^[A-Za-z0-9_-]{43,128}$/.test(dispatchSecret),
  };
  return {
    checks,
    config: Object.values(checks).every(Boolean)
      ? {
          publicKey,
          privateKey,
          dispatchSecret,
          secretKey,
          databaseUrl: database!.origin,
          origin: app!.origin,
        }
      : null,
  };
}
