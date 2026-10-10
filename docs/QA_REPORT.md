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
