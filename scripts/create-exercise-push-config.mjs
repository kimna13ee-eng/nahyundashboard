// Run once locally. Secrets are written to ignored outputs/, never to stdout.
import { mkdir, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import webPush from "web-push";

const origin = new URL(process.argv[2] || "");
if (
  origin.protocol !== "https:" ||
  origin.username ||
  origin.password ||
  origin.port ||
  origin.pathname !== "/"
)
  throw new Error("Pass the application's HTTPS origin only.");
const keys = webPush.generateVAPIDKeys();
const dispatchSecret = randomBytes(32).toString("base64url");
await mkdir("outputs", { recursive: true });
const file = "outputs/personal-exercise-push.private.env";
await writeFile(
  file,
  [
    "# Server environment variables for Render. Never commit or paste in chat.",
    `APP_PUBLIC_URL=${origin.origin}`,
    `PERSONAL_PUSH_VAPID_PUBLIC_KEY=${keys.publicKey}`,
    `PERSONAL_PUSH_VAPID_PRIVATE_KEY=${keys.privateKey}`,
    `PERSONAL_PUSH_DISPATCH_SECRET=${dispatchSecret}`,
    "# Add a PERSONAL project's secret key directly in Render, not here or in chat:",
    "# PERSONAL_SUPABASE_SECRET_KEY=sb_secret_...",
    "",
  ].join("\n"),
  { flag: "wx", mode: 0o600 },
);
// Vault SQL contains the dispatch token only, never the database or VAPID key.
await writeFile(
  "outputs/personal-exercise-push-vault.private.sql",
  [
    "-- PERSONAL SQL Editor, run as postgres. Keep this local file private.",
    "do $$ begin",
    " if exists (select 1 from vault.secrets where name='ops_exercise_push_app_url') or",
    "    exists (select 1 from vault.secrets where name='ops_exercise_push_dispatch_secret') then",
    "   raise exception 'Exercise push Vault values already exist. Update them intentionally; do not rotate VAPID keys.';",
    " end if;",
    ` perform vault.create_secret('${origin.origin}','ops_exercise_push_app_url');`,
    ` perform vault.create_secret('${dispatchSecret}','ops_exercise_push_dispatch_secret');`,
    "end $$;",
    "",
  ].join("\n"),
  { flag: "wx", mode: 0o600 },
);
console.log(
  `Created ${file} and the matching private Vault setup SQL. Secret values were not printed.`,
);
