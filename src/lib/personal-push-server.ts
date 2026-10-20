import "server-only";
import { createClient } from "@supabase/supabase-js";
import webPush from "web-push";
import {
  parsePushSubscription,
  type StoredPushSubscription,
} from "./personal-push";
import { inspectPushConfiguration } from "./personal-push-config";

export function pushConfigurationState() {
  return inspectPushConfiguration(process.env);
}

export function pushConfiguration() {
  return pushConfigurationState().config;
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
