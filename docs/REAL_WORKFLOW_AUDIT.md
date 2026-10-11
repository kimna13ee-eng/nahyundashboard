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

# 실제 업무 흐름 감사 · 2026-10-11

기존 Preview 버튼 결과는 outputs/button-flow-qa-report.md 유지. 우상단 계정→Settings와 모바일 로그아웃은 이전 수정 사항이다. AST 무연결 버튼 검사는 전체 E2E가 아니다. 이번 보강은 로컬만 변경.

## 문제와 수정

Capture가 업무 등록뿐인 문제는 별도 Inbox/제목만 수집/3행동/후속 정리로 보강했다. 변경된 최신 메모에 의존하던 중단 복원은 트리거 스냅샷으로 보강했다. 후속 날짜·정체 업무 Attention, 반복 수동 실행 원장, 콘텐츠 검수 버전과 단계 업무 연결, Prompt 도구/변경 이유/승인 버전도 구현했다. 모두 SQL007~009 적용 후 실제 검증이 필요하다.

PERSONAL 5종 수정 가능한 템플릿·협찬 필드·선택 성과 일정·수동8지표 비교를 기존006에 구현하고 실제 저장 확인. 저장과 재조회 실패를 구분하며 검수 대기 발행 거절 이유 표시. 좁은 로컬 화면에서 Next 개발 표시와 메뉴 클릭 겹침을 devIndicators:false로 수정. 기록 없는 맥락을 임의 생성하지 않는다.

| 시나리오 | 격리 검증 | 실제 검증 / 미완료 |
|---|---|---|
| A 돌발 전환·맥락·시간 | A ACTIVE→Inbox 저장 타이머 유지→B 지금 처리→A PARKED 스냅샷→B 종료→A 재개, 구간 겹침 없음 | 기본 타이머·복원 통과.007 전체 전환 미검증 |
| B 제작·수정·승인 | 제작→검수→수정→재제작→재검수→승인→성과 7버전, 승인 전 발행 거절 | 실제 검수 대기 발행 거부·승인 후 저장 통과.008 이력/단계 업무 미검증 |
| C 후속 | 상태/날짜 저장·Attention 계산 통과 | 007 실제 흐름 미검증. 연락 종료와 업무 완료 별개 |
| D 반복 실행 | 경과 미실행=미확인·수동 완료·이전 기록 보존·규칙 삭제 제한 | 007 실제 원장 미검증. 미기록 과거 회차 자동 영속화 없음 |
| E Prompt | 원문/공백 보존·수정·즐겨찾기 중복 방지·복원 새 버전·승인 FK | 009 실제 저장/복사 미검증 |
| F 일지·회사 보고 | 기존 개인 일지 테스트 | 실제 개인 일지 확인. 회사 공유 미리보기 미구현 |
| G 새로고침 | 기존 타이머와 새 DB 계약 검사 | 실제 로그인/업무/PARKED/콘텐츠 상세 유지.007~009 전체 복원·다중탭 미검증 |

휴무 규칙·운영 반복 템플릿·도구별 프로젝트 단계·충돌 경고·순환 추천은 미구현. 외부 자동화는 미연결이며 회사 데이터 접근 없음.

## 2026-10-11 Preview 배포 후 업데이트

사용자 배포 승인 후 기존 Render 개인 서비스에 커밋 d3ce2cddc3191df5403ff3b4402de75e1c2e8362 배포 완료(live, dep-db55ooks728c73bv0bfg). 주요 파일14개 로컬/원격 일치와 원격 빌드 성공. 실제 로그인 복원·업무3개 조회·계정/Quick Capture/모달 닫기/Calendar/개인 콘텐츠 확장 폼·FRENGLE 미연결 차단 확인. 새 실제 DB 데이터 변경 없음. SQL007~009 적용은 하지 않았고 Quick Inbox 저장은 안내·차단 유지. 자세한 배포 보고 outputs/workflow-render-release-report.md. 앞서 로컬만 변경했다고 적힌 내용은 배포 이전 시점의 기록이다.




