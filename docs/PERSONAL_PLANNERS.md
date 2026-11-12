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
- The content screen shows the fixed reels schedule and a blog keyword inbox.
  The old planning/drafts/performance sheet viewer is no longer mounted or fetched.
  Existing sheet contents are unchanged.
- A fixed @ny.iro weekly reels schedule stays above the keyword inbox: Monday off,
  Tuesday–Friday at 17:30 and Saturday–Sunday at 21:30 (Asia/Seoul), with the
  user's recurring makeup themes. It is a display board, without scheduled posts
  or database writes.
- Add keywords with the plus button. Checking a keyword records it as used for a
  blog post. The same checked items can be deleted together and restored with undo.
  Keywords and used state are private to the signed-in PERSONAL account.
- Yoga uses a seven-day selector and the selected day's video cards. Add/edit
  collects date, URL, title and optional minutes. Existing video-title lookup and
  iPhone push subscription remain available. Alerts still fire at 21:00 Seoul.
- Yoga shows a fixed weekday routine: strength on Monday/Friday, lower-body stretch
  Tuesday, shoulder stretch Wednesday, full-body stretch Thursday, stretching
  Saturday, and stretching or a half-body bath Sunday. This guides video selection
  and does not change stored video categories or notification delivery.
- Existing iPhone `?view=calendar&date=...&schedule=...` notification URLs resolve
  to yoga. No push re-registration or service-worker change is required.

## Loading and storage

The new shell does not import OpsShell or its project/timer/workflow modules.
Each planner is loaded on demand. Content reads `/api/blog-keywords`; yoga
reads owned active exercise schedules for the selected week through
`/api/planner-schedules`. There are no full `/api/ops`, workflow or phase2 reads.
Legacy editorial styles are removed from the global layout.

The narrow endpoint forces PERSONAL, validates origin on writes and limits reads
to at most 31 days. Updates preserve hidden notes and project links. Client UUIDs
deduplicate create retries; deletion/undo uses the existing owner-scoped soft
delete/restore RPCs and their 12-hour expiry.

Apply `supabase/personal/025_blog_keywords.sql` to the PERSONAL database before
deploying the keyword inbox. It adds its own owner-scoped table and atomic batch
delete/restore RPC. There are no environment-variable changes. It does not repurpose
or delete old personal records, business data, or Google sheets.

Transient background session checks preserve an already open draft. Account
changes and explicit expiry remount/clear account-scoped components. Logout also
disconnects this device's push subscription, matching the previous app behavior.

## Checks

`node --experimental-strip-types --test tests/planner-navigation.test.ts tests/planner-schedules.test.ts`

Ten tests cover legacy deep links, invalid dates, ownership/workspace/origin
checks, bounded reads, mutation validation, idempotency, hidden metadata
preservation, and delete/restore.

`node --experimental-strip-types --test tests/blog-keywords.test.ts`

`node --test tests/blog-keywords-db.test.mjs`

Six route tests and two PGlite database tests cover keyword access isolation,
idempotent additions, used-state conflicts, atomic batch deletion/restore and
rollback when any selected item is stale, unchecked, missing or foreign-owned.
Browser checks use isolated fixtures and do not
write test records to production. Deployment continues through existing Render
manual deploy; hosting is unchanged.
