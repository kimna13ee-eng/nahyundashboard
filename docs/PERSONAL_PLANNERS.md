# PERSONAL planners

The main app now has two views: 콘텐츠 플래너 and 요가 플래너.
Company/ALL/demo entry points redirect to `/`. Old `view` parameters open content,
except Calendar/Yoga links, which retain their yoga date and schedule ID.
Existing business, journal, leave, calendar and record data is preserved; this
change removes those surfaces from the main app, without database deletion.
The separately untracked diary app is not part of this release.

## Mobile layout

- Two fixed bottom tabs with safe-area spacing; a small account dialog replaces
  the old Settings page. Existing PERSONAL credentials continue to work.
- Content uses the same three read-only Google sheets (planning, drafts,
  publication/performance). Cards expose useful fields and an all-field detail
  dialog. Search covers every cell. Lists show 24 items at a time.
- Yoga uses a seven-day selector and the selected day's video cards. Add/edit
  collects date, URL, title and optional minutes. Existing video-title lookup and
  iPhone push subscription remain available. Alerts still fire at 21:00 Seoul.
- Existing iPhone `?view=calendar&date=...&schedule=...` notification URLs resolve
  to yoga. No push re-registration or service-worker change is required.

## Loading and storage

The new shell does not import OpsShell or its project/timer/workflow modules.
Each planner is loaded on demand. Content reads its selected sheet only; yoga
reads owned active exercise schedules for the selected week through
`/api/planner-schedules`. There are no full `/api/ops`, workflow or phase2 reads.
Legacy editorial styles are removed from the global layout.

The narrow endpoint forces PERSONAL, validates origin on writes and limits reads
to at most 31 days. Updates preserve hidden notes and project links. Client UUIDs
deduplicate create retries; deletion/undo uses the existing owner-scoped soft
delete/restore RPCs and their 12-hour expiry. No SQL or environment changes.

Transient background session checks preserve an already open draft. Account
changes and explicit expiry remount/clear account-scoped components. Logout also
disconnects this device's push subscription, matching the previous app behavior.

## Checks

`node --experimental-strip-types --test tests/planner-navigation.test.ts tests/planner-schedules.test.ts`

Ten tests cover legacy deep links, invalid dates, ownership/workspace/origin
checks, bounded reads, mutation validation, idempotency, hidden metadata
preservation, and delete/restore. Browser checks use isolated fixtures and do not
write test records to production. Deployment continues through existing Render
manual deploy; hosting is unchanged.
