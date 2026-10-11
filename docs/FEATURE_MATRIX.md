## SQL010 적용·연동 최신 결과 — 2026-10-11

사용자 승인 후 PERSONAL SQL Editor 실행 완료(설치 확인값 모두 true). 로컬 API는 ops_timer_guarded만 사용, pause/finish에 expected_session_id 필수, 미설치 시503/경합409, 기존 RPC 우회 없음. 종료·중단 창은 선택 세션을 고정하고 같은 요청의 재시도 ID를 유지한다.

실제 두 로컬 탭에서 이전 세션 종료→같은 Task 새 세션 시작→이전 종료 창 제출 후 새 ACTIVE 유지 통과. 같은 세션 동시 종료 양쪽 성공, finish/일지1개. PARKED 맥락 복원·재개·새로고침·종료 통과. 새 QA 세션3개(23초·32초·23초/마지막2구간) ENDED 보존, 기존 업무5개/ACTIVE·PARKED 없음, 삭제 없음.

TypeScript·ESLint·Production build 통과, 단위31/31·격리DB7/7. 입력 파서→가드 RPC 계약·재실행 보존 검사 포함. RLS·same-origin·서버 인증 유지. 실제 다른 계정 RLS·오프라인·고속 UI 전환·재개 구간 경합·전체 기기/키보드는 미검증.

상태 갱신: 세션 가드는 IMPLEMENTED(로컬+실제DB 검증), Preview 연결은 배포 승인 대기. is_test·반복 archived_at 필드는 실제 적용되어 PARTIAL이며 분류 입력·전파·규칙 보관 UI는 미구현. 이전 초안 미적용/P1 실제 미수정 문구는 이 시점 이전 기록이다.

GitHub/Render는 기존 d3ce2cddc3191df5403ff3b4402de75e1c2e8362 유지. push·배포 없음. Preview는 구 API를 사용하므로 SQL010 적용만으로 이번 보호가 Preview에 연결되는 것은 아니다. P1은 승인 후25개 검증 파일 배포·원격 재검증, P2는 위 미검증/분류·보관 UI. 정식SQL은 supabase/personal/010_stabilization.sql, 실행본 outputs/personal-stabilization-setup.sql. 이미 실행한 SQL010 재실행 불필요.

상세: outputs/SQL010_INTEGRATION_REPORT.md. 이전 초안/기존 QA 결과 보존. 이번 배포 후보에는 초안 대신 정식 SQL010을 포함한다. 배포는 별도 승인 대기.

---
## 최신 검증 — POST QA STABILIZATION · 2026-10-11

이 단락은 아래의 이전 단계/배포 전 기록보다 최신이다. SQL007~009 실제 적용 및 기존 검증을 유지한다. GitHub main/Render Preview는 d3ce2cddc3191df5403ff3b4402de75e1c2e8362로 동일하다. 이번 변경은 로컬만 있으며 push·배포·실제 DB 마이그레이션은 하지 않았다.

| 기능 | 상태 / 새 검증 | 코드 / DB |
|---|---|---|
| QA 집계 제외 | 로컬 수정·회귀 통과. 실제 일지 제외 확인. Preview 미반영 | content-analytics.ts, journal-report.ts, analytics-panel.tsx, content-analytics-panel.tsx / tasks·ops_work_sessions·ops_content |
| Quick Start | 저장된 다음 액션·메모·중단 시각·사유·링크 및 ACTIVE 상세 이동 실제 통과. 최근 특이사항은 단위 검증 | quick-start.ts, ops-shell.tsx / ops_parked_context·ops_task_notes·ops_session_events |
| Inbox 보관/복원 | converted 보관→복원→기존 Task 이동 실제 통과. 미변환 복원 UI는 미검증 | workflow-inbox.tsx, api/workflow/route.ts / ops_inbox (SQL007 재사용) |
| 반복 원장 | 완료 포함 조회 보강. 보관/복원은 초안 단계 | phase2-panel.tsx / ops_recurrence_runs·ops_recurrence |
| Calendar | 예정/실제 별도 라벨·ID, 실제 발행 기준24/72/168시간 단위 통과. 새 실콘텐츠 재검증 미실행 | personal-content.ts / ops_content.publish_at·personal_details.published_at |
| 타이머 | 실제 두 탭 시작·종료 경합/새로고침/PARKED 재개 통과. 빠른12회 전환·시간 겹침0은 격리 검사 | SQL002/007·ops_work_sessions·ops_session_intervals·ops_work_journal |
| 늦은 종료 경합 | PARTIAL: 같은 Task 새 세션이 지연 종료될 수 있음, 격리 재현. SQL010 가드는 초안만 검증 | ops_timer task_id 확인 → expected_session_id 가드 및 API/클라이언트 연동 승인 필요 |
| 테스트 분류 | PARTIAL: 명시적 is_test 우선 판별 준비. 실제 필드/입력/변환 전파 미구현, 제목 폴백 위험 유지 | outputs/010_stabilization_DRAFT.sql (미적용) |
| 반복 보관 | BLOCKED: nullable archived_at 초안, 원장 보존 격리 검사. 런타임 UI/API 미연동 | SQL010 초안 승인 필요 |

TypeScript·ESLint·Production build 통과, 단위29/29 및 격리 DB7/7 통과. 새 QA A90초/3구간, B105초/1구간 모두 ENDED·일지 보존; 종료 중복 없음. 기존 실제 데이터 삭제 없음. Inbox는 기존 converted2/archived1 상태로 복원. QA 제외 기본값 복원. 최근 실제 증거는 outputs/post-qa-*.png.

RLS FORCE/소유자정책/복합FK 및 서버 인증·same-origin 유지. 격리 계정B는 A Inbox 조회·수정/세션가드 종료 차단. 실제 두 계정 RLS·오프라인 복구·고속 UI 전환·전체 기기/키보드 호환은 미검증. 회사 시스템 접근/외부 전송 없음. 과거 콘텐츠 원본은 이미 정리되어 02:25 기준값을 재조회할 수 없으나 실제 발행02:25+24시간=다음날02:25 계산은 단위 검증했다.

P1: SQL010 세션 가드 승인 후 API/클라이언트 연결 및 실제 재검증; QA 제외/UI 변경 배포는 신규 승인 후. P2: 명시적 테스트 분류 입력·변환 전파, 반복 보관 복원, 실계정 RLS/오프라인/모바일·미변환 Inbox 복원, 1000개 이력 페이지네이션. P3: 승인된 공식 외부 연동/휴무·충돌 정책.

배포 후보22개와 제외 항목은 outputs/stabilization-release-files.txt에 기록한다. SQL010은 저장소에 포함하더라도 자동 실행하지 않는다. 타이머 지연 종료 문제는 아직 실제 환경에서 수정되지 않았다. 상세 결과/기록 보관 설계/배포 제한: outputs/POST_QA_STABILIZATION.md. 사용자 배포 승인 및 DB 초안 승인을 기다린다.

---
## 최신 실제 검증 · 2026-10-11 (이전 승인 대기 기록보다 우선)

SQL007~009 적용을 실제 Preview에서 확인했다. Quick Inbox 제목만 등록/타이머 유지/지금 처리 전환/보관, PARKED 맥락 복원 및 새로고침 후 재개/종료, 후속 Attention/종료, 콘텐츠 검수7버전/단계Task 연결/Calendar4종, Prompt3버전/승인/원문 복사를 실제 DB로 검증했다. 해당 기능의 SQL 선행 BLOCKED는 해소됐으나 전체 요청 범위는 PARTIAL이다.

반복 실행 미확인 표시는 실제 통과; 수동 완료/기존 원장 보존은 격리 검사만 통과. 실제 두 계정 RLS와 모바일 전체 호환은 미검증. 테스트 콘텐츠/Prompt/시간 없는 연결Task/반복 규칙 정리, A/B 시간 기록 및 Inbox 이력은 QA 표시로 보존. 활성 타이머 없음.

배포본의 [QA 테스트] 일지 제외 오류 발견. 로컬 공유 제목 판별 규칙 수정·회귀 테스트 추가, 실제 DB 일지에서 제외 확인. TypeScript/lint/build 및 기능26/26 통과. 이 수정은 아직 Preview 미반영, 배포 승인 필요. 기존 격리 DB6/6 결과 유지. 상세 outputs/sql007-009-live-verification.md.

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

## 2026-10-11 Preview 배포 후 업데이트

사용자 배포 승인 후 기존 Render 개인 서비스에 커밋 d3ce2cddc3191df5403ff3b4402de75e1c2e8362 배포 완료(live, dep-db55ooks728c73bv0bfg). 주요 파일14개 로컬/원격 일치와 원격 빌드 성공. 실제 로그인 복원·업무3개 조회·계정/Quick Capture/모달 닫기/Calendar/개인 콘텐츠 확장 폼·FRENGLE 미연결 차단 확인. 새 실제 DB 데이터 변경 없음. SQL007~009 적용은 하지 않았고 Quick Inbox 저장은 안내·차단 유지. 자세한 배포 보고 outputs/workflow-render-release-report.md. 앞서 로컬만 변경했다고 적힌 내용은 배포 이전 시점의 기록이다.




