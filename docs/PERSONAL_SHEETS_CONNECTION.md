# PERSONAL SNS studio — 2026-10-20

The top-level 내 SNS 스튜디오 menu replaces 콘텐츠 시트 after Content Studio and is visible only in the
PERSONAL workspace, including mobile More. Leaving PERSONAL returns to Overview
and unmounts the panel. Login/user/tab changes abort pending reads and clear the
previous sheet's state.

The authenticated, read-only `/api/personal-sheets` route accepts only
`workspace=PERSONAL` and a fixed tab key from `personal-sheet-tabs.ts`. It loads the source
from the current user's `ops_personal_sheet_sources` row. Other users cannot
select that row, insert a source or change it through the client. The reusable
SQL016 contains no spreadsheet IDs or user seed data. The confirmed source was
bound separately to the intended PERSONAL owner in the SQL editor; the
connection check returned true on 2026-10-19.

The verified workbook now has 17 allowed tabs, grouped as follows:

- 콘텐츠 운영: 기획, 원고, 검수, 발행·성과.
- 리서치·아이디어: 레퍼런스, 리서치, Grok 인박스.
- 캐릭터·가이드: 캐릭터 바이블, 셀카·비주얼 DNA, 통합 캐해,
  레퍼런스 해석, 콘텐츠 캘리브레이션.
- 운영 관리: 시트 대시보드, 인계 로그, 직원 규칙, 에이전트 실행지침,
  운영 설정.

The catalog pins each key to its observed sheet ID. Only the selected tab is
fetched; callers cannot supply a workbook ID, arbitrary sheet ID, or URL. The
Grok inbox and agent instructions are sheet text, never an external integration
or executable instructions. CSV export preserves formatted values,
mixed text/numbers, quoted commas and multiline drafts. Google sharing settings
remain unchanged. The current source can be read with its existing link access;
if access later becomes private, reads fail rather than exposing cached data or
changing the file's permissions.

The source ID is stored only in the owner's database configuration, not the
repository. Source requests use fixed Google HTTPS endpoints, at most three
validated Google redirects, no credentials, no-store, a 12-second timeout and a
3 MiB streaming limit. Tables request A1:Z1002: a header, a maximum of 1,000
displayed data rows and a truncation sentinel. Blank table rows are omitted.
The source dashboard requests A1:Z1001 without a header: its title and internal
blank rows are retained, synthetic A–Z column names and physical row numbers
preserve cell positions, and only trailing blank rows are omitted. A value
after physical row 1,000 triggers the truncation notice. Data
beyond that range or beyond column Z is outside this viewer's scope. No cell
content is evaluated as HTML, JavaScript or formulas.

The panel supports four groups with only their selected group's tabs visible,
search across displayed columns, horizontal
scrolling, a fixed header/first column and full-text row details. It reads again
every minute while the visible list is open, with manual and app-header refresh.
Opening a draft detail pauses background refresh. The timestamp is the fetch
time, not a claim about the original file's last edit.

Validation:
- CSV parser/input/network and settings RLS tests; forced owner isolation,
  anonymous and client-write denial, and idempotent migration.
- On 2026-10-20 all displayed source values matched the authenticated Google
  Sheets formatted read across all 17 tabs. Current planning has 18 items,
  drafts 1, performance 9; the dashboard retains all 36 physical rows.
- Local fixture UI: menu absent in ALL, present in PERSONAL, search across
  fields, tab switches, multiline full draft details, zero/percentage rendering,
  unsafe links rendered as text, errors clear stale rows, and leaving PERSONAL
  hides the menu/data and returns to Overview.
- Running API: eight invalid workspace/tab/parameter checks returned expected
  errors with no-store; POST returned 405 in the original release.
- Expansion validation: 87 unit tests, the existing source-owner RLS database
  test, lint, TypeScript, and production build passed. The running API passed
  27 checks including all 17 keys requiring authentication, rejected ALL and
  FRENGLE workspaces, duplicate/extra parameters, and GET-only responses.
- Desktop and 390px browser checks covered four groups, representative sheet
  switches, 18-item planning search, full multiline draft details, zeroes and
  percentage values, and original dashboard rows 1–6 including spacer rows.
  App-header refresh completed, and leaving PERSONAL unmounted the data and
  removed the menu in both ALL and FRENGLE. Mobile More exposes the new menu.

Revision ce9b21d's original three-tab integration was manually deployed and
verified 2026-10-19. The existing owner's source binding was verified again on
2026-10-20, so this expansion needs no database migration or source reseeding.
The 17-tab application expansion requires a new Render deployment.

PERSONAL Overview also reads the existing performance tab as its first content
panel, ahead of the work metrics and task lists. FRENGLE does not mount or fetch
this panel. It uses the same authenticated source binding and read-only route;
no additional database setup or source-sheet edits are required.

The Overview performance score and totals use published Reels only. Repeated observations of the same
content use the latest observation, and missing metrics remain missing rather
than becoming zero. Reactions are likes + comments + saves + shares, only where
all four values are present. A partial source response is labelled as partial.
The score gives views, likes, comments, saves and shares equal 20% weights.
Each value is divided by that metric's maximum among the current complete
observations, then the five ratios are summed on a 100-point scale. A metric
whose maximum is zero contributes zero points. Posts missing any of the five
counts are excluded from both the score baseline and average. The headline
score is the mean of the unrounded post scores, displayed to one decimal.
This compares the user's recorded Reels against their own metric records;
new records, changed observations or a partial response can change the baseline.

The graph defaults to each post's score on a fixed 0–100 axis and also offers
the six original count metrics. It shows the latest 12 posts in publication order with a selectable
metric; its detail view retains the post's real numbers and source link.
Sheet refresh time and metric observation date are separate. This view refreshes
the values recorded in the sheet; it does not claim to query live Instagram
statistics. The Content Studio shortcut opens the performance tab directly.
