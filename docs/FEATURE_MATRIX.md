# MY OPS 기능 감사 · 2026-10-11

현재 폴더는 Git 저장소가 아니며 초기화하지 않았다. 기존 프로젝트·디자인·Supabase SQL001~006 유지. SQL006 실제 연결 확인 완료. SQL007~009는 로컬 구현·격리 DB 검사만 완료, 실제 적용 및 GitHub/Preview 변경 없음. IMPLEMENTED=기본 구현, PARTIAL=일부 구현, UI_ONLY=안내, MISSING=미구현, BLOCKED=승인/스키마 필요. 코드 경로는 src/components/, src/lib/, src/app/api/, supabase/personal/ 기준.

| 기능 | 분류 | 관련 코드 | 테이블 | 검증·미완료 |
|---|---|---|---|---|
| Overview / My Attention | PARTIAL | ops-shell.tsx, workflow-context.ts | tasks, ops_projects, ops_content | 오늘 마감·실패·승인·후속·14일 정체 정렬 테스트. 수동 우선순위 유지. 후속 필드는007 필요 |
| Quick Capture / Quick Inbox | PARTIAL / BLOCKED | workflow-inbox.tsx, api/workflow, workflow.ts | ops_inbox, tasks, ops_schedules | 제목만·메모/출처·나중 프로젝트/일정·변환·보관·3행동 구현. Inbox 타이머 유지·지금 처리 원자적 전환 격리 통과. 실제007 미검증 |
| Calendar / 반복 일정 | PARTIAL | ops-shell.tsx, phase2-panel.tsx, phase2.ts, personal-content.ts | ops_schedules, ops_recurrence, ops_recurrence_exceptions, ops_recurrence_runs, ops_content | 4보기와 개인 촬영/편집/발행 실제 검증. 선택 성과24/168시간 표시 확인. 미실행은 실행 미확인, 원장은007 필요. 휴무·충돌·미기록 회차 자동 영속화 없음 |
| Projects / Tasks | IMPLEMENTED 기본 / PARTIAL 확장 | ops-shell.tsx, api/ops, ops.ts | ops_projects, tasks | 기존 실제 CRUD/삭제 제한 유지. 후속 상태/날짜 로컬 추가007 필요 |
| Task Notes / 특이사항 | IMPLEMENTED 기본 | ops-shell.tsx, api/ops | ops_task_notes, ops_note_versions | 메모/이슈/다음 액션/버전 유지. 중단 스냅샷007 필요 |
| Time Tracker / 전환 | PARTIAL | ops-shell.tsx, workflow-inbox.tsx, api/ops | ops_work_sessions, ops_session_intervals, ops_session_events, ops_parked_context | 기존 실제 시작/PARKED/재개/종료/복원 통과. 중단 맥락 스냅샷·돌발 전환·중복 집계 방지 격리 통과. 실제007 미검증 |
| Work Journal | IMPLEMENTED 개인 일지 | ops-shell.tsx, journal-export.tsx, journal-report.ts | ops_work_journal, 세션/구간/메모 | 실제 종료 세션17초/구간2개 확인. 회사 공유와 별개 |
| Automations | UI_ONLY / BLOCKED | ops-shell.tsx, workspaces/company.ts | 없음 | 외부 실행기/전송 없음. 다중 도구 단계 파이프라인 MISSING |
| Content Studio / Trend Radar | PARTIAL | phase2-panel.tsx, personal-content.ts, phase2.ts, api/phase2 | ops_content, ops_content_versions, ops_content_tasks | 개인5종 편집 템플릿·협찬·일정·수동 성과 구현. 실제 저장/재조회/승인 전 발행 차단/성과 일정/삭제 확인. 이력·단계 Task 연결008 필요, 격리 통과. 외부 수집 없음 |
| Analytics | PARTIAL | analytics-panel.tsx, content-analytics-panel.tsx | tasks, 세션/구간, ops_content | 계획/실제·8개 수동 성과·기준시각 표. API 자동 수집·지표 시계열 미구현 |
| Library / Prompt / Skills / Inspiration | PARTIAL | ops-shell.tsx, phase2-panel.tsx, api/ops | ops_library_items, ops_prompt_versions, ops_inspiration | 기존 CRUD·복사 유지. 도구/프로젝트/변경 이유/사용·보관/승인 버전009 필요. 원문 공백 보존·복원 새 버전 격리 통과 |
| Leave Balance | IMPLEMENTED 수량 | phase2-panel.tsx, phase2.ts | ops_leave_entries | 기존0.5일 단위 유지. Calendar 제외 |
| Daily Report | UI_ONLY / BLOCKED | ops-shell.tsx | 회사 보고 테이블 없음 | 회사 공유 미리보기·민감정보 제외 E2E 미구현. 개인 내보내기는 회사 보고 아님 |
| Settings / Auth / RLS | PARTIAL | api/auth, api/session, api/ops, api/phase2, api/workflow, http.ts | auth.users, PERSONAL 전체 | 실제 로그인/복원 유지. owner RLS·복합 FK·same-origin 격리 통과. 실제 두 계정·다중 브라우저 미검증 |

PERSONAL 전용 서버 접근과 FRENGLE 차단 유지. ALL은 현재 권한 있는 PERSONAL만 표시. 회사 시스템 접근·원문/고객 DB 반입·외부 전송 없음. 승인 전 자동 발행 없음. 실제 사용자 데이터 삭제 없음. 이번 콘텐츠 테스트 정리, 기존 승인된 시간 테스트 기록 보존. MASTER 전체 완료를 의미하지 않는다.
