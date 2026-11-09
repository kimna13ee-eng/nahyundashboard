# PERSONAL: daily home and records

The PERSONAL home brings together today's calendar items, today's yoga video,
a quick note/todo composer, the existing three content sheets, and the weekly
calendar. PERSONAL menu labels are 오늘, 나의 기록, 캘린더, 콘텐츠, 요가 플래너,
설정. FRENGLE's menus and project workflow remain unchanged.

## Records

- `note`, `idea`, and `todo` share one small record editor (body and date).
- Ideas appear in the content page's 소재 노트; this is the same record, not a copy.
- Todos can be completed directly. Record titles open the edit dialog.
- Archive is reversible from 나의 기록; no permanent-delete endpoint is provided.
- Reads show the latest 300 active and 100 archived records. A limit notice is
  shown when older records fall outside this range.
- No Grok, Pickle, AI generation, or external record sharing is implemented.
- Existing content sheets remain read-only. Existing yoga push registration,
  dispatch, calendar links and annual-leave records are preserved.

## Storage and deployment

Apply `supabase/personal/024_personal_records.sql` only to the PERSONAL project.
It is independent of the separate, untracked diary implementation and SQL022.
The migration was applied on 2026-11-09 to `rimtvotfmtupguslpzts`; the SQL editor
returned `personal_records_installed = true`. No user records were created for QA.
Application changes still require the corresponding Render deployment.

`/api/personal-records` forces the PERSONAL session and rejects other workspace
parameters. Owner RLS and restricted column grants protect the table. Mutations
require same-origin requests; PATCH compares the original microsecond-precision
`updated_at`. Stable client IDs let a lost POST response be retried without
duplicating the record. Validation errors leave the draft editable; conflicting
edits require explicitly reviewing the latest version.

## Validation

`node --experimental-strip-types --test tests/personal-records.test.ts`

`node --test tests/personal-records-db.test.mjs`

The database suite covers owner isolation, write grants, schema reapplication,
date/body constraints, optimistic concurrency, archive and restore. Browser QA
uses isolated in-memory records, not production data.
