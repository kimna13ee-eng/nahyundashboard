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
Live OAuth approved on 2026-10-15. ChatGPT plugin ID:
`asdk_app_6ad0697215788191b2d3751936e2cf5e`; approved company OAuth client:
`ace2ae15-b3f7-46d8-8db6-39decccdc585`.
Live company list 0 → save → list 1 and `/frengle` receipt body verified.
Test receipt: `f6cbf547-9279-4480-af77-2c47562414de`,
run key `frengle-connection-test-2026-10-15-01`; test content, not research.
Verification chat: https://chatgpt.com/c/6ad082f0-85b8-83e8-849c-dcffab55fa04

The active `프렌글 밈·칼럼·블로그 소재` task
(`6acc99961e748191a18523321a3f0c59`) now includes company save instructions;
its original weekday 09:00 KST cadence and research prompt were preserved.
Scheduled tool execution is still unverified.
The keyword-search conversation contains a research prompt but no scheduled
task card. User selected weekdays 09:00 Asia/Seoul. Creation requested in the
original keyword conversation, but ChatGPT rejected it due to the account's
5-active-task limit. User explicitly chose integration into the existing
weekday 09:00 content briefing. Added a keyword patrol section to that same
task, preserving the original research and cadence. The sections save separate
receipts with sources `frengle_keywords` and `frengle_site_recommendations`,
distinct stable per-run keys, and explicit independent failure reporting.
No additional schedule or paused unrelated task was used. Scheduled browser
and MCP availability remains unverified until a real scheduled execution.

## Work check connection — 2026-10-19

User requested connecting the `내일 출근 업무` conversation, preserving the
separate content/keyword automation. Existing task `출근 업무 체크`
(`6ac6f54c7b28819187701a6890614735`) uses conversation
https://chatgpt.com/c/6ac6f4a0-23d4-83ec-9d21-e0271acd012c .
Its original prompt and weekday schedule are preserved; added result delivery
instructions with source `frengle_work_check`. This only stores a checklist;
it does not send marketing messages or execute/complete the listed work.

Apply `supabase/frengle/002_work_check_results.sql` only to FRENGLE, deploy
the matching application, and refresh the ChatGPT plugin's tools schema.
The source schema and UI label now accept work checks. Migration preserves
the existing receipts and membership/owner RLS. Local DB/MCP tests passed.
Live work-check delivery is pending those deployment steps and a real test.
