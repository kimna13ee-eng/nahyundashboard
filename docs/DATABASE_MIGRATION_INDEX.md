# PERSONAL database migration index

This file records repository identifiers and dependencies. It is not proof of
the live Supabase migration history. Before any production SQL execution,
compare the live schema, function definitions, owners, grants, and available
Supabase migration history with this list. Never replay an older script merely
because it appears here.

## Ordered identifiers

| ID | Repository file or record | Requires | Purpose | Production-history evidence |
| --- | --- | --- | --- | --- |
| 001 | `supabase/personal/001_tasks.sql` | New PERSONAL project | Base `tasks` table and owner RLS | Baseline dependency; live confirmation still required |
| 002 | `supabase/personal/002_mvp.sql` | 001 | Projects, schedules, work sessions, journal, library, core RPCs | Baseline dependency; live confirmation still required |
| 003 | `supabase/personal/003_phase2.sql` | 001-002 | Content, inspiration, leave, recurrence | Historical project baseline; live confirmation still required |
| 004 | `supabase/personal/004_calendar_recurrence.sql` | 003 | Monthly/yearly recurrence and recurrence mutation RPCs | Historical project baseline; live confirmation still required |
| 005 | `supabase/personal/005_task_classification.sql` | 001-004 | Task work classification | Historical project baseline; live confirmation still required |
| 006 | `supabase/personal/006_personal_content.sql` | 003 | Personal content details | Project reports record a live capability check; do not replay without live comparison |
| 007 | `supabase/personal/007_workflow.sql` | 001-006 | Inbox, parked context, recurrence runs, workflow RPCs | Later project reports record live verification; do not replay without live comparison |
| 008 | `supabase/personal/008_content_history.sql` | 007 and content tables | Content versions, task links, analytics | Later project reports record live verification; do not replay without live comparison |
| 009 | `supabase/personal/009_prompt_metadata.sql` | 002 and 008-era schema | Prompt metadata and approved versions | Later project reports record live verification; do not replay without live comparison |
| 010 | `supabase/personal/010_stabilization.sql` | 001-009 | Timer guard/readiness and stabilization fields | Project reports explicitly say it was applied and must not be rerun |
| 011 | Legacy operational identifier `SQL011 PRIVATE_UID`; no tracked SQL file | Existing production schema | Historical reports describe privileges/RLS/capture/preservation and readiness DB checks | Exact DDL and execution record are absent from Git; reserve this ID and verify live state before any related change |
| 012 | `supabase/personal/012_schedule_trash.sql` | 002 schedule table and the verified 001-011 production state | Schedule soft delete, 12-hour restore, privileged purge function | Local/isolated only; not approved or applied to Supabase; Cron intentionally excluded |
| 013 | `supabase/personal/013_automation_results.sql` | auth.users and authenticated/anon roles | PERSONAL Metricool result receipt table, owner RLS, immutable receipts and rate guard | Local/isolated only; production apply and OAuth setup pending |
| 014 | `supabase/personal/014_task_process.sql` | Existing PERSONAL tasks and owner policies | Four task categories and durable process checklist, preserving old columns and timers | PERSONAL SQL and live task controls verified 2026-10-19 |
| 015 | `supabase/personal/015_leave_accrual.sql` | Existing 002/003 and owner auth | Personal hire date and historical usage settings for calculated accrual | PERSONAL applied and confirmed 2026-10-19; matching UI deployment pending |

The apparent 011 record predates the schedule-trash work. It first appears in
the 2026-10-11 release reports, while no corresponding SQL file exists in the
repository history or retained backup checkpoint. Those reports are historical
evidence, not an executable migration. Keep their wording unchanged and do not
attempt to reconstruct or rerun 011 from the short description.

## Application rule for 012

Do not rerun 001-010 or the untracked legacy 011. Before applying 012, perform a
read-only production preflight for the expected `public.ops_schedules` columns,
constraints, RLS state, table grants, related function signatures, owners, and
function grants. Apply only 012 after a separate approval and backup. Deploy the
012-compatible API immediately after the migration; leave Cron unregistered
until its own approval and verification.

## Standard migration directory proposal

Do not create or backfill `supabase/migrations/` yet. First export or otherwise
verify the live migration ledger and schema, reconcile it with 001-010 and the
legacy 011 record, and record immutable checksums. Then establish one audited
baseline entry without executing historical DDL, and place only future changes
in timestamped migration files. This avoids falsely marking unknown historical
scripts as applied or accidentally replaying them.
