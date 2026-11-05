# GPT retirement and Overview project pins — 2026-11-05

Cloudflare migration is on hold. Keep the existing Render service and manual deployment.

## Dashboard

- Removed GPT result panels, Automations navigation, result counts, setup copy and polling from PERSONAL, FRENGLE and ALL. Legacy `view=automations` falls back to Overview.
- Removed the MCP SDK (61 installed dependency packages), unused result parsers/components/styles and their obsolete unit tests.
- Existing MCP, discovery, consent API and result routes return HTTP 410 `AUTOMATION_RETIRED` with `Cache-Control: no-store`. They do not authenticate or query/write Supabase. Old consent pages display a closed-connection notice.
- Supabase history and migration files are preserved. No SQL, environment changes, ordinary login changes or yoga push changes are required.

## Projects

- FRENGLE Overview pins every planning/active project until its own status becomes completed, including projects with no processes. This also includes existing unfinished projects.
- Project titles open the existing edit modal. A successful registration closes the modal and reloads persisted projects. The display survives refresh and is independent of creation/due dates.
- Remaining project process tasks stay below the pinned rows. Completing a parent removes its pending managed processes from Today without rewriting task/time history. Actual same-day task completions remain visible.
- Project totals and daily task totals are separate to avoid counting both a project and its processes as tasks.

## External ChatGPT state

- Explicit user answer: also stop ChatGPT scheduled tasks, preserving yoga push.
- Two active tasks found and paused: `프렌글 주간 우선순위`, `영어회화 시장 브리핑`. Both displayed `다시 시작` and `일시 중지됨` after reload.
- Older `출근 업무 체크`, `Metricool 데이터 확인` and other listed tasks were already paused and left paused. Tasks were not permanently deleted.
- Disconnected the existing accounts in `MY OPS · FRENGLE` and `MY OPS · PERSONAL Metricool`. Both plugin pages now display `연결`, with no connected account. App definitions are preserved; unrelated plugins are unchanged.
- Supabase OAuth app definitions were not deleted. After deployment the retired application endpoints reject old clients regardless of token state.

## Verification

- 26 targeted unit tests passed (Overview grouping/pins, project input, workspace isolation/API mapping, retired endpoint behavior).
- Production build passed; existing Next 16.4 security upgrade reminder remains. Build retried as instructed by the installed framework; no dependency upgrade beyond MCP removal.
- ESLint passed for tracked application/tests. Full lint encounters a pre-existing error at untracked `src/components/diary/diary-app.tsx:592`; diary work was not changed or staged.
- Live local-server HTTP checks passed for 12 retired-route/method combinations, including old bearer tokens and approval/tool-call bodies.
- Local mock UI: Overview creation with zero steps, automatic modal close, reload persistence, name-to-edit and completed-project removal passed. Mobile 390px iframe content width/scroll width both 375px; no horizontal overflow.
- PERSONAL retains five menus, reels/sheets/yoga; ALL no longer displays result cards. No production application rows were created or modified.

Proofs are stored in ignored `outputs/`: `project-pinned-overview-20261105.png`, `project-pinned-mobile-20261105.png`, `chatgpt-schedules-paused-20261105.png`, and both `chatgpt-*-disconnected-20261105.png` files.

Render manual deployment and production UI verification are still pending for this change. Keep the computer running.
