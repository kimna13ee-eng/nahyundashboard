# Compact UI 로컬 릴리스 후보

상태: LOCAL_QA_COMPLETE / 사용자 배포 승인 대기. 신규 commit/push/Render 배포 없음.

기준 SHA: 81872e07d57ac65cd9b1c2c7068aab48018165c9 (기준 clean checkout 확인 및 사용자 마지막 배포 정보). 이번 작업에서 GitHub/Render LIVE 최신 상태를 원격 재확인하지 않았으므로 실제 배포 직전에 별도 재확인이 필요하다.

## 범위

코드 8파일 + docs4파일 = 12파일. 정확한 SHA256/바이트/기준 해시는 outputs/COMPACT_UI_RELEASE_MANIFEST.json. 환경파일/비밀키/SQL/API/lib/node_modules/.next/work/스크린샷/기타 산출물은 후보 제외. 원본 root는 Git repo가 아니므로 현재 전체 폴더를 push하지 않고 승인된 manifest 파일만 기준 checkout에 옮겨야 한다. CRLF/LF 차이는 표시하되 코드 의미 비교는 정규화한다.

### 후보 파일

- src/app/layout.tsx
- src/app/compact.css
- src/components/ops-form-actions.tsx
- src/components/recurring-schedule-row.tsx
- src/components/phase2-panel.tsx
- src/components/ops-shell.tsx
- src/components/workflow-inbox.tsx
- src/components/ops-dialog.tsx
- docs/COMPACT_UI_AUDIT.md
- docs/COMPACT_BUTTON_SYSTEM.md
- docs/RECURRING_SCHEDULE_LAYOUT_QA.md
- docs/COMPACT_UI_RELEASE_PLAN.md

## 실행한 검사

- TypeScript --noEmit: PASS (초기 dead recurrence branch 타입 오류 제거 후 재검사).
- ESLint src 및 기존 unit tests: PASS.
- Production build: PASS, Next16.4.0, 기존 API routes 유지.
- 기존 unit tests: 36/36 PASS.
- SQL010/011 PGlite 회귀: 13/13 PASS.
- 기존 추가 격리 DB: 6/6 PASS.
- 브라우저: PC10화면, 모바일 주요5화면4폭, 반복 합성6크기, 콘텐츠 modal6크기, 미저장/키보드/상세/Context Resume PASS.
- 실제 DB write timer/CRUD/recurrence 저장 실행: 미검증. 이번 범위에서는 실제 데이터 변경 없이 격리 회귀와 기존 callback 유지 확인.
- 실제 iOS/Android 및 다른 브라우저: UNVERIFIED.

격리 DB는 기존 테스트 실행이며 실제 Supabase SQL/권한 변경 없음. SQL011 설계/함수/RLS/앱 RPC 계약의 의미상 변경 없음. 사용자 실제 행 불변은 쓰기 동작을 하지 않은 범위의 보존이며 새 원격 DB exact snapshot 검증을 주장하지 않는다.

## 승인 이후 절차

1. GitHub main/Render LIVE 기준 SHA 재확인. 달라지면 중단.
2. clean checkout에 정확한12파일 적용, SHA256 및 allowlist diff 확인. 예상 외 파일/비밀값/SQL 발견 시 중단.
3. 배포 checkout에서 typecheck/lint/build/unit/DB 회귀 재실행.
4. 사용자 승인 범위 내 별도 commit/push/수동 Preview 배포.
5. 원격 로그인·조회·guarded readiness, QuickCapture/Timer/Journal/Calendar/Content/Library 및 모바일 CSS 확인.
6. 실기기 홈화면/노치/키보드/모달하단/반복 행 탭 확인.

## 남은 개선

P1: 실기기 iOS/Android Safari/Chrome 실제 터치·키보드·safe-area 검증.
P2: 실제 반복 행의 저장/원장 UX는 사용자가 지정한 QA 규칙으로 후속 검증. 추가 서비스/마이그레이션 없음.
P2: 키보드 전수 및 스크린리더/다른 브라우저 확인. 이번에는 대표 modal native key 동작만 실측.
P3: 프로젝트 선택처럼 정보가 많은 기존 버튼은 높이 자동 유지; 일괄 한 줄 축약으로 가독성을 해치지 않았다.

앱 롤백 필요 없음(배포하지 않음). 향후 UI 배포 장애 시 앱 이전 commit으로만 복구, DB 권한은 변경하지 않는다.
