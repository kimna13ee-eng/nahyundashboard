import "server-only";
import { createECDH } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import webPush from "web-push";
import {
  parsePushSubscription,
  type StoredPushSubscription,
} from "./personal-push";

export function pushConfiguration() {
  const publicKey = process.env.PERSONAL_PUSH_VAPID_PUBLIC_KEY || "";
  const privateKey = process.env.PERSONAL_PUSH_VAPID_PRIVATE_KEY || "";
  const dispatchSecret = process.env.PERSONAL_PUSH_DISPATCH_SECRET || "";
  const secretKey = process.env.PERSONAL_SUPABASE_SECRET_KEY || "";
  try {
    const serviceKey =
      /^sb_secret_[A-Za-z0-9_-]{20,}$/.test(secretKey) ||
      (/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(secretKey) &&
        JSON.parse(Buffer.from(secretKey.split(".")[1], "base64url").toString())
          .role === "service_role");
    const origin = new URL(process.env.APP_PUBLIC_URL || "");
    const database = new URL(process.env.PERSONAL_SUPABASE_URL || "");
    if (
      origin.protocol !== "https:" ||
      origin.username ||
      origin.password ||
      origin.port ||
      database.protocol !== "https:" ||
      !/^[a-z0-9]+\.supabase\.co$/.test(database.hostname) ||
      !/^[A-Za-z0-9_-]{43,128}$/.test(dispatchSecret) ||
      !serviceKey
    )
      return null;
    const pair = createECDH("prime256v1");
    pair.setPrivateKey(Buffer.from(privateKey, "base64url"));
    if (pair.getPublicKey().toString("base64url") !== publicKey) return null;
    return {
      publicKey,
      privateKey,
      dispatchSecret,
      secretKey,
      databaseUrl: database.origin,
      origin: origin.origin,
    };
  } catch {
    return null;
  }
}

export function pushAdmin(
  config: NonNullable<ReturnType<typeof pushConfiguration>>,
) {
  return createClient(config.databaseUrl, config.secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export async function sendPersonalPush(
  subscription: StoredPushSubscription,
  payload: unknown,
  config: NonNullable<ReturnType<typeof pushConfiguration>>,
) {
  // Validate again at the network boundary, including records written outside this API.
  return webPush.sendNotification(
    parsePushSubscription(subscription),
    JSON.stringify(payload),
    {
      vapidDetails: {
        subject: config.origin,
        publicKey: config.publicKey,
        privateKey: config.privateKey,
      },
      TTL: 300,
      urgency: "high",
      timeout: 10000,
    },
  );
}
