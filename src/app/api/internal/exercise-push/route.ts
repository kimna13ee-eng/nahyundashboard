import { NextRequest } from "next/server";
import { json } from "@/lib/http";
import { exercisePushPayload, pushFailure } from "@/lib/personal-push";
import { dispatchAuthorized } from "@/lib/push-dispatch-auth";
import {
  pushAdmin,
  pushConfiguration,
  sendPersonalPush,
} from "@/lib/personal-push-server";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(req: NextRequest) {
  const config = pushConfiguration();
  if (!config) return json({ error: "Push not configured" }, 503);
  if (
    !dispatchAuthorized(
      req.headers.get("x-ops-push-timestamp"),
      req.headers.get("x-ops-push-signature"),
      config.dispatchSecret,
    )
  )
    return json({ error: "Unauthorized" }, 401);
  const client = pushAdmin(config);
  const { data, error } = await client.rpc("ops_claim_exercise_push", {
    p_limit: 20,
  });
  if (error) return json({ error: "Push claim failed" }, 503);
  const counts = { claimed: data?.length || 0, sent: 0, failed: 0, stale: 0 };
  // Bounded concurrency keeps a cold Render start and provider timeouts inside pg_net's timeout.
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(5, data?.length || 0) }, async () => {
      while (cursor < data.length) {
        const item = data[cursor++];
        let outcome: "sent" | "retry" | "failed" | "gone" = "failed";
        let status: number | null = null;
        try {
          // Recheck after claiming: a trashed/rescheduled exercise or disabled device must not send.
          const [schedule, subscription] = await Promise.all([
            client
              .from("ops_schedules")
              .select("id,starts_at")
              .eq("id", item.schedule_id)
              .eq("owner_id", item.owner_id)
              .eq("category", "exercise")
              .neq("video_url", "")
              .is("deleted_at", null)
              .maybeSingle(),
            client
              .from("ops_push_subscriptions")
              .select("id")
              .eq("id", item.subscription_id)
              .eq("owner_id", item.owner_id)
              .eq("enabled", true)
              .maybeSingle(),
          ]);
          if (schedule.error || subscription.error) outcome = "retry";
          else if (
            schedule.data &&
            subscription.data &&
            new Date(schedule.data.starts_at).toLocaleDateString("en-CA", {
              timeZone: "Asia/Seoul",
            }) === item.exercise_day
          ) {
            await sendPersonalPush(
              item,
              exercisePushPayload(item.schedule_id, item.exercise_day),
              config,
            );
            outcome = "sent";
            status = 201;
          }
        } catch (error) {
          ({ outcome, status } = pushFailure(error));
        }
        const complete = await client.rpc("ops_complete_exercise_push", {
          p_delivery_id: item.delivery_id,
          p_claim_token: item.claim_token,
          p_outcome: outcome,
          p_status: status,
          p_error: outcome === "sent" ? "" : "provider_or_schedule_unavailable",
        });
        if (complete.error) counts.failed++;
        else if (complete.data === "stale") counts.stale++;
        else if (outcome === "sent") counts.sent++;
        else counts.failed++;
      }
    }),
  );
  return json(counts);
}
