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

# QA 보고 · 2026-10-11

## 최종 로컬 검사

- TypeScript: node node_modules/typescript/bin/tsc --noEmit 통과.
- Lint: node node_modules/eslint/bin/eslint.js src tests/*.test.ts tests/*db.test.mjs 통과.
- Build: node node_modules/next/dist/bin/next build 통과. Next16.4, /api/workflow 포함 10페이지 생성.
- 도메인: node --experimental-strip-types --test tests/*.test.ts 24/24 통과.
- 격리 DB: database, phase2-db, personal-content-db, workflow-db, content-history-db, prompt-metadata-db 6/6 통과.
- 초기 TS row 타입 오류 및 render Date.now lint 오류는 수정 후 최종 재검사 통과. pnpm의 non-TTY 자동 install 확인은 강제하지 않았고 기존 node_modules CLI 사용.

## 실제 PERSONAL 확인

사용자가 로그인한 로컬 탭에서 기존 업무3개 조회, 승인된 타이머 테스트의 시작/PARKED/취소/새로고침/재개/종료 및 Work Journal17초/구간2개 확인. SQL006 capability 활성화 확인. 이전 테스트 릴스의 촬영/편집/발행 일정, 실제 발행·수동 성과, 새로고침 유지 및 삭제 통과.

이번 [QA 테스트] 개인 템플릿·성과 점검 콘텐츠에서 편집한 체크리스트 저장/서버 재조회, 실제 발행·성과 기준 시각/조회수10, 24/168시간 선택 보존 확인. Calendar에10/12 00:00과10/18 00:00 점검만 표시, 선택하지 않은72시간 없음. 검수 대기 상태의 발행은 구체적 오류로 거절되며 폼 유지, 승인 후 저장 성공. 실제 Instagram 발행은 하지 않은 가상 테스트 기록. 해당 콘텐츠만 삭제하고 DB 재조회 빈 목록 확인. 기존 실제 데이터 삭제 없음. 시간 테스트는 기존 승인대로 보존, 활성 타이머 남기지 않음.

증거: outputs/personal-content-checks-live.png, outputs/context-resume-live-check.png, outputs/personal-content-calendar-live.png, outputs/quick-inbox-pre-migration.png.

## 신규 SQL 격리 범위

새 PGlite에001~009를 적용해 테스트 후 폐기. 실제 Supabase에는007~009 미적용.
- Inbox 보관 타이머 유지, 지금 처리 원자적 전환·idempotency, 일정 중복 방지, 중단 시 메모/이슈/다음 액션 스냅샷, 이후 메모 수정에도 스냅샷 유지, 시간 겹침 없음.
- 반복 미완료 원장 다음 회차 이후 보존, 원장 있는 규칙 삭제 제한. 후속 상태/날짜 저장.
- 콘텐츠 수정/재검수/승인7버전, 승인 전 발행 거부, 단계 Task 중복 방지, 연결 Work Session, 이력 수정 거부.
- Prompt 원문/공백 보존, 새 버전/복원/즐겨찾기 중복 방지, 승인 버전 소유자·항목 FK, 이력 수정 거부, 기존 메모 trigger 유지.
- 다른 사용자 조회0건 및 소유자 위조/타 사용자 객체 접근 거부.

## 미검증·미지원

실제 두 계정 RLS는 미검증. 별도 개인 테스트 계정 B로 A의 테스트 프로젝트/업무/콘텐츠/Inbox/버전 ID 조회·수정·삽입 실패를 확인해야 한다. 회사 계정 사용 불필요.

SQL007~009 실제 CRUD/전체 시나리오 A~E/G, Preview 새 코드, iOS/Android/Safari/Firefox/Edge, 오프라인/다중탭 경합 UI 미검증. 기존 좁은 화면 메뉴 클릭은 수정 후 통과하지만 기기 호환 전체 통과는 아님. Daily Report 회사 공유 미리보기·휴무·충돌·외부 실행기는 미지원이다.

## 변경 파일

src/components/ops-shell.tsx, workflow-inbox.tsx, phase2-panel.tsx, content-analytics-panel.tsx; src/lib/workflow.ts, ops.ts, personal-content.ts; src/app/api/ops/route.ts, phase2/route.ts, workflow/route.ts; next.config.ts; supabase/personal/007_workflow.sql, 008_content_history.sql, 009_prompt_metadata.sql; tests/workflow.test.ts, workflow-db.test.mjs, content-history-db.test.mjs, prompt-metadata-db.test.mjs; package.json; docs/4개.

기존 디자인 컴포넌트·Dialog·label/fieldset 재사용. 승인 전 기능은 비활성/미연결 안내. owner 인증·same-origin 유지. 여러 TSX 변경의 구조/훅/접근성 자체 점검 완료. 전체 키보드·기기 검증은 별도다.

## 2026-10-11 Preview 배포 후 업데이트

사용자 배포 승인 후 기존 Render 개인 서비스에 커밋 d3ce2cddc3191df5403ff3b4402de75e1c2e8362 배포 완료(live, dep-db55ooks728c73bv0bfg). 주요 파일14개 로컬/원격 일치와 원격 빌드 성공. 실제 로그인 복원·업무3개 조회·계정/Quick Capture/모달 닫기/Calendar/개인 콘텐츠 확장 폼·FRENGLE 미연결 차단 확인. 새 실제 DB 데이터 변경 없음. SQL007~009 적용은 하지 않았고 Quick Inbox 저장은 안내·차단 유지. 자세한 배포 보고 outputs/workflow-render-release-report.md. 앞서 로컬만 변경했다고 적힌 내용은 배포 이전 시점의 기록이다.




