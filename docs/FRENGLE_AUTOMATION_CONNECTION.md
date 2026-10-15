# FRENGLE automation connection — 2026-10-15

Project: `https://tlclbraledbncndhemsr.supabase.co`.
The user reports applying `supabase/frengle/001_automation_results.sql` and
adding user `8a24b08d-4f07-4ac3-b68a-06db73e9f662` to `ops_company_members`.
These reports are not an independently verified production schema export.

Implementation uses a separate Supabase client, `my-ops-frengle-auth` cookie,
company membership check, OAuth client allowlist and company database RLS.
PERSONAL endpoints and sessions remain separate. Company task/project CRUD
is outside this change; the company portal only handles automation results.

## Deployment steps

1. Deploy the new application revision with `FRENGLE_SUPABASE_URL` set to the
   project above and `FRENGLE_SUPABASE_PUBLISHABLE_KEY` copied from that project.
   Never use a service role or secret key. Keep the PERSONAL settings.
2. Sign into `/frengle` with the separately created company-project account.
3. In the FRENGLE project configure Auth Site URL as the dashboard origin and
   OAuth authorization path `/frengle/oauth/consent`; enable its OAuth server.
4. In ChatGPT add a custom OAuth MCP connection to
   `https://my-ops-personal-preview.onrender.com/mcp/frengle`.
   Inspect its exact callback URL. Register a Public OAuth client in the
   FRENGLE project with that callback; configure the resulting ID in both
   ChatGPT and Render `FRENGLE_MCP_CLIENT_ID`. Leave DCR disabled.
5. The user reviews and approves the FRENGLE OAuth request. Test company
   save/list and confirm the company portal receives the same receipt.
6. Attach to keyword search first, then site recommendations. Preserve the
   existing prompts and schedules. Use `save_frengle_result` with source
   `frengle_keywords` or `frengle_site_recommendations`, stable per-run run_key,
   final plaintext body, actual ChatGPT conversation URL and ISO reported_at.
   Only report saved after receiving a successful receipt. Never route company
   outputs through the PERSONAL tool. Test scheduled tool availability.

Discovery: `/.well-known/oauth-protected-resource/mcp/frengle`.
Company results UI: `/frengle`, linked from Automations.
Missing config returns unavailable; no fallback to the personal database.

Local checks: company membership grant/revocation, owner isolation,
source exclusion, duplicate protection, immutable rows, anonymous denial,
and MCP source schema/owner injection/input validation passed.
Live OAuth and scheduled execution are pending.
