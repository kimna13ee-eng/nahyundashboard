# PERSONAL / FRENGLE workspaces

The root dashboard uses PERSONAL. `/frengle` uses FRENGLE. Each page mounts a
separate dashboard and keeps its own Supabase session cookie. The workspace
selector changes routes. `/all` is a read-only combined overview, fetching each
workspace through its own authenticated API. It offers no cross-workspace write
or transfer actions. Missing access clears only the affected workspace's rows.

Shared ops, workflow and recurrence APIs require an explicit workspace. Every
FRENGLE request checks the company session and current company membership before
opening company records. Missing company configuration or membership never falls
back to PERSONAL. Existing `ALL` API requests remain a PERSONAL compatibility
alias. The selector's ALL choice opens `/all`, which sends explicit PERSONAL and
FRENGLE requests instead of using the legacy ALL API alias. ALL summarizes saved
schedules, task deadlines and automation receipts; recurrence and linked-sheet
publication schedules remain in their individual workspaces.

The company database requires `supabase/frengle/001_automation_results.sql`,
`002_work_check_results.sql`, and `003_core_workspace.sql`. Apply these only to
FRENGLE. The core migration provides company projects, tasks, notes, schedules,
timers, journal, library and recurrence. All company core tables enforce owner
and company membership RLS; callable functions use invoker rights.

Content Studio sheets, legacy personal content, inspiration, annual leave and
Yoga Planner and exercise notifications stay in PERSONAL. PERSONAL navigation
omits Work Journal and Analytics; FRENGLE retains them. Company automation receipts come from
the company endpoint; PERSONAL receipts keep the personal endpoint. Logging out
or changing accounts clears loaded records and automation receipts.

`scripts/company-task-transfer.mjs` prepares a reviewed, manual transfer without
connecting to either database. Its export/import/verify/finalize stages require
an exact ten-task manifest, independent source and target owners, full history
comparison, and a fresh successful verification receipt before source cleanup.
Source changes, new references, open timers, identifier collisions or expired
receipts stop the operation. The actual manifest, exported rows and generated SQL
belong in ignored `work/` and `outputs/`; never commit their contents.

Company schedule trash uses the same 12-hour restore deadline. The core
migration does not register a company purge cron job. Expired rows cannot be
restored and are omitted from the restorable trash list.
