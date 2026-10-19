# PERSONAL content sheets — 2026-10-19

The top-level 콘텐츠 시트 menu follows Content Studio and is visible only in the
PERSONAL workspace, including mobile More. Leaving PERSONAL returns to Overview
and unmounts the panel. Login/user/tab changes abort pending reads and clear the
previous sheet's state.

The authenticated, read-only `/api/personal-sheets` route accepts only
`workspace=PERSONAL` and `tab=planning|drafts|performance`. It loads the source
from the current user's `ops_personal_sheet_sources` row. Other users cannot
select that row, insert a source or change it through the client. The reusable
SQL016 contains no spreadsheet IDs or user seed data. The confirmed source was
bound separately to the intended PERSONAL owner in the SQL editor; the
connection check returned true on 2026-10-19.

Allowed tabs are fixed to 03_기획 (1103), 04_원고 (1104), and 06_발행성과 (1106).
No other workbook tabs are fetched. CSV export preserves formatted values,
mixed text/numbers, quoted commas and multiline drafts. Google sharing settings
remain unchanged. The current source can be read with its existing link access;
if access later becomes private, reads fail rather than exposing cached data or
changing the file's permissions.

The source ID is stored only in the owner's database configuration, not the
repository. Source requests use fixed Google HTTPS endpoints, at most three
validated Google redirects, no credentials, no-store, a 12-second timeout and a
3 MiB streaming limit. The bounded range is A1:Z1002: a header, a maximum of 1,000
displayed data rows and a truncation sentinel. Blank rows are omitted. Data
beyond that range or beyond column Z is outside this viewer's scope. No cell
content is evaluated as HTML, JavaScript or formulas.

The panel supports the three tabs, search across displayed columns, horizontal
scrolling, a fixed header/first column and full-text row details. It reads again
every minute while the visible list is open, with a manual refresh option.
Opening a draft detail pauses background refresh. The timestamp is the fetch
time, not a claim about the original file's last edit.

Validation:
- CSV parser/input/network and settings RLS tests; forced owner isolation,
  anonymous and client-write denial, and idempotent migration.
- All displayed source values matched the authenticated Google Sheets formatted
  read for all current records: planning 9, drafts 1, performance 9.
- Production build, 71 unit tests and lint passed.
- Local fixture UI: menu absent in ALL, present in PERSONAL, search across
  fields, tab switches, multiline full draft details, zero/percentage rendering,
  unsafe links rendered as text, errors clear stale rows, and leaving PERSONAL
  hides the menu/data and returns to Overview.
- Running API: eight invalid workspace/tab/parameter checks returned expected
  errors with no-store; POST returned 405.

Revision ce9b21d was manually deployed on Render. All three production tabs and
their current row counts were verified 2026-10-19. Auto-Deploy remains disabled.
