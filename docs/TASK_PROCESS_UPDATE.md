# Task categories and process checklist — 2026-10-19

Task create/edit and detail hide contact follow-up state/date, linked tool,
assignee, and estimated minutes. Existing columns remain intact for timer
compatibility and historical data. Editors omit hidden values rather than
clearing them. Legacy `work_kind` is retained; new task categories are
content/sales/design/other with labels 콘텐츠/영업/디자인/기타.

Task create/edit, start/resume and task detail can edit a process one line per
step and check completed steps. Same titles retain IDs and completion when
reordered or cut/pasted within the editor. Maximum 30 steps, 120 characters
per title. Current step is the first unchecked step; all checked displays
전체 단계 완료. Completing a step does not complete the task automatically.
Overview rows show current step and completed/total count.

The start dialog no longer shows the old resume-context report or the quoted
empty-state and note-before-timer explanations. It retains an optional work
memo. Checklist write must succeed before timer start. Existing note retry
protection and parked-session timer mechanics remain intact.
Analytics uses the same four new categories and no longer shows planned time.

## Rollout

Run only `supabase/personal/014_task_process.sql` in PERSONAL project
`rimtvotfmtupguslpzts`, then deploy the matching application revision.
Do not run the PERSONAL migration in FRENGLE. Before installation, existing
task operations remain available; new category/checklist controls report the
missing setup. Existing tasks start with category 기타 and no steps.

## Validation

Pure helper/API tests cover categories, invalid steps, count/title limits,
stable IDs, reorder completion, and omitted hidden values.
PGlite migration tests cover RLS, invalid DB writes, restricted column grants,
idempotent reapplication and preservation of active timers/notes/tasks.
Local in-memory UI fixture (`tests/task-process-preview.mjs`) verified:
Overview first incomplete step; removed form fields and context report;
stage-write failure prevents timer start; retry saves stage before timer;
category change and cut/paste reorder preserve checks/IDs/hidden old fields.
No real user data was used for UI testing. PERSONAL SQL014 and the matching
production editor/start dialog were verified on 2026-10-19.
