# Overview and calendar refresh

The Overview lists today's unfinished tasks (created today or due today), then
tasks completed today, then a Monday–Sunday schedule table with weekday, item,
and time in Asia/Seoul. The weekly table combines ordinary schedules, recurrence,
content dates, and task due dates. My Attention is removed. Task titles open the
edit dialog; explicit completion buttons and a separate work-history action are
available in every task list.

SQL017 records `completed_at` on server-side status transitions. Later edits
preserve that timestamp; reopening clears it and completing again records a new
timestamp. Existing completed tasks use their pre-migration `updated_at` as a
historical estimate because earlier completion events were not recorded.

Automation cards show the latest received data, receipt time, and an always
visible link to its ChatGPT conversation. The Overview shows three recent
PERSONAL Metricool receipts. FRENGLE receipts retain separate authentication,
storage, and source filtering in the company portal. A stored conversation link
is never generated or inferred when absent. Receipt polling remains 30 seconds
while the relevant view is visible; absent receipts do not prove a failed run.

Content's `personal_details.calendar_hidden` controls all its derived calendar
items without clearing original shooting, editing, publishing, or metric dates.
The content editor's “캘린더에 표시” checkbox restores them. Normal content version
history also preserves the previous setting.

On 2026-10-19 the PERSONAL owner's three explicitly named QA content records
were hidden from the calendar (11 derived items). SQL confirmed all three and
their recoverable history. No matching ordinary schedules or recurrence rules
remained, and the remaining QA task had no calendar due date. Original content
and work records were retained. The UI change requires the corresponding Render
deployment; this is separate from the completed database update.

Validation: 81 unit tests, six relevant database tests, lint, TypeScript, and a
production build passed. Browser checks used an isolated local fixture at desktop
and 390px widths: completion moved an item into today's completed list, title
selection opened its editor, header refresh included weekly data, journal preview
worked, and automation content and its original conversation link were visible.
The legacy completion backfill's one affected edit timestamp was restored to the
value preserved in `completed_at`; the production stamp trigger was confirmed
enabled. SQL017 now tests and preserves that trigger and edit history during
initial backfill, including its alternate enable modes.
