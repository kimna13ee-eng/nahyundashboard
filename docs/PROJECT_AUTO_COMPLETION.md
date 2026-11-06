# Project completion — 2026-11-06

A project with at least one active managed process step now completes when every active step is completed. The transition is stored in Supabase, so Overview pins, project filters and other clients read the same status.

- Last-step completion works through the project checklist and individual task completion, including finishing an active timer before marking its task completed.
- Undoing a step, adding an unfinished step or restoring one reopens an automatically completed project as active.
- Projects with no active steps are not automatically completed. Archived steps and ordinary linked tasks are excluded from the completion criterion.
- Manually completed projects retain their explicit state when unfinished steps remain.
- The existing owner advisory lock, RLS, optimistic editor timestamp and timer guards remain in place. A deferred trigger evaluates the final saved checklist, rather than intermediate rows during the save RPC.
- Installation reconciles existing all-done projects without changing task completion dates, notes or time history. Inconsistent legacy projects with a running timer are skipped.

The Projects view has Progress, Completed and All filters, with status badges and progress based on managed steps when present. A project created from the Completed filter is immediately visible after saving. Overview continues to use persisted project status, not possibly truncated client-side step data.

## Database deployment

- PERSONAL: `supabase/personal/023_project_auto_completion.sql` (requires SQL020; independent of the separate diary migration SQL022).
- FRENGLE: `supabase/frengle/006_project_auto_completion.sql` (requires SQL004).
- Both were applied through their respective Supabase SQL editors and returned `project_auto_completion_installed = true` on 2026-11-06.
- Before installation, FRENGLE already had `와디즈 전자책 만들기` at completed with 5/5 steps; its state was preserved. The zero-step development project remains active.

## Verification

- New completion and existing project-process database suites: 4/4 tests pass across PERSONAL and FRENGLE, including owner isolation, backfill/idempotence, timer guards, undo, archive/restore and manual completion preservation.
- Overview/project unit tests: 11/11 pass.
- Scoped ESLint and production build pass. The installed Next.js version's existing security-upgrade reminder is unchanged.
- Local fixture UI: last step moves project to Completed; undo restores Progress; creating a zero-step project from Completed switches to All and shows the new project. No production test rows were created.
- Render UI deployment is pending the commit associated with this document. No environment changes are required.
