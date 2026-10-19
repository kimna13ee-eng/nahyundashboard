# Personal leave tracking — 2026-10-19

Settings in the PERSONAL workspace now shows automatic accrual, current balance,
usage dates and the next accrual date. Usage accepts positive 0.5 or 1 day; the
server stores a negative usage entry. Future usage remains visible as planned
and does not reduce the current balance. Failed saves retain the form contents.
Initial historical use is represented once in the owner's leave settings rather
than duplicated in the existing ledger.

Accrual is derived from the hire date and the current Seoul date, so no scheduled
job or repeated monthly inserts are needed. First-year monthly accrual assumes
perfect attendance, grants at most 11 days and expires at the first anniversary.
Later annual accrual assumes at least 80% attendance, starts at 15 days and adds
the statutory seniority increment up to 25 days. Usage consumes eligible credit
that expires first. Manual grants and adjustments are additional credits.
The interface identifies this as a personal estimate; it does not track actual
attendance or decide the employer's confirmed entitlement.

Official references:
- https://1350.moel.go.kr/rtmview.do?id=1000012468
- https://1350.moel.go.kr/rtmview.do?id=1000183606

`015_leave_accrual.sql` creates only the owner-scoped settings table with forced
RLS and no anonymous grants. It is idempotent and preserves the prior leave
ledger. It was applied to PERSONAL on 2026-10-19. The user's confirmed hire date
and dated historical usage were saved separately through the SQL editor;
the reusable migration does not contain personal seed data.

The same release removes Quick Inbox and Quick Capture navigation while
preserving existing Inbox rows. Resource forms explicitly close after a
successful save, retain inputs after failure and block concurrent submissions.

Validation: helper boundary and input tests; PGlite settings constraints, owner
isolation, anonymous denial and idempotence; lint and production build. The
local in-memory UI fixture verified successful task save closes the dialog,
failed save keeps its title, the confirmed initial balance and dated history,
and a 0.5-day usage immediately recalculates the balance and closes the form.
No production task or usage rows were created for UI testing.

Separately, the user approved permanent cleanup of exactly 14 task titles
containing the literal Korean word `테스트`. A guarded transaction removed
those tasks and 23 ended test sessions, retaining other tasks, the real active
timer, projects, content and schedules. Production result: 14 removed, zero
matching tasks remain. Related active/parked sessions, an unexpected FK or an
unexpected target count would abort the entire transaction. The one-off script
and its isolated verification are retained locally under ignored `work/`.

Application deployment remains a separate Render step after the commit is
pushed; Auto-Deploy is disabled.
