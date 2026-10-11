# Compact UI 감사

기준 앱: 81872e07d57ac65cd9b1c2c7068aab48018165c9. 이번 작업은 로컬 UI 변경이며 push/배포/실제 DB 쓰기 없음.

## 클릭 액션 조사

9개 관련 컴포넌트의 button / summary / action anchor JSX 템플릿 105개를 목록화했다. 반복 렌더링된 각 행의 개수와 다르다. 전체 목록은 outputs/COMPACT_CLICK_ACTION_INVENTORY.json. 제목·배지·설명은 비인터랙티브 텍스트로 유지한다.

|화면|기존 텍스트형/불일치 액션|적용 및 확인|
|---|---|---|
|Overview|설정, 업무/일정 등록, 중단 업무 이어하기|공통 테두리·primary·focus; 화면 이동 PASS|
|Calendar|월/주/일/목록, 날짜 이동/날짜 버튼, 일정 상세|동일 높이·간격; 상세 열기/닫기 PASS|
|반복 일정|수행 상태와 수정·삭제가 본문에 혼재, 원장 summary|정보/조작 영역 분리; 박스 액션; 합성 6크기 PASS|
|Projects/Tasks|프로젝트 선택, 업무 제목, 완료, 시작, 편집/삭제 아이콘|정보 계층 유지, icon/danger/그룹 정렬; 화면 조회 PASS|
|Quick Capture/Inbox|지금 처리/일정/보관/변환, 수정·복원|박스/공통 취소; Inbox 기존 기본 submit 순서 유지; 취소/입력 보존 PASS|
|Time Tracker|업무 선택, 메모, 중단, 종료, Context Resume submit|공통 아이콘/하단 액션; 모달 진입·취소 PASS; 실제 실행은 격리 DB PASS|
|Work Journal|날짜 이동, 보고 미리보기/다운로드|공통 테두리, 기존 내보내기 핸들러 유지; 조회 PASS|
|Automations|수정/삭제, 결과 링크|compact/danger, 외부 결과 anchor 유지; 화면 이동 PASS|
|Content Studio|등록, 템플릿, 버전 disclosure, 업무 연결, 수정/삭제|compact/summary/danger; 긴 입력·취소·계속 작성 PASS|
|Library|탭, 복사, 버전 복원, 좋아요/편집/삭제, 원본 링크|공통 스타일, 원문 및 callback 유지; 화면 이동 PASS|
|Analytics|필터/새로고침|공통 스타일; 조회 PASS|
|Settings|로그인/연결/로그아웃/복구|기존 인증 경로 유지, 공통 스타일; 세션 복원 PASS|
|모달|단독 submit·닫기, 취소 없는 form, 미저장 경고|취소/primary 그룹, dirty guard·busy 유지; Enter/Space/Tab PASS|

원본 URL은 a/target/rel을 유지한다. 링크 액션만 ops-link-action 박스로 표시한다. 클릭하지 않은 실행·삭제·외부 이동을 브라우저 PASS로 주장하지 않는다.

## 발견·수정

- 기본 버튼이 무테/투명이고 여러 화면의 높이가 달랐다: 공통 compact.css로 통일.
- 반복 회차의 정보/상태/버튼 기준선: 재사용 RecurringScheduleRow로 분리.
- 일부 모달 취소 부재/하단 액션 불일치: OpsFormActions 추가, 기존 data-dialog-close로 dirty guard 호출.
- 실제 모바일 Calendar 이벤트가 32~42px hit box였다: 명시 min-height 44px 보정 후 4폭 재검증.
- 삭제 아이콘/텍스트에 일관된 danger 표면 적용. 확인 모달 유지.

API/lib/기존 SQL은 기준 checkout과 CRLF/LF 정규화 비교 결과 의미상 차이 0개. 새 API·DB·auth·timer 계약 변경 없음.

## 한계

실제 반복 규칙 목록이 비어 있어 행 정렬은 실제 컴포넌트의 DB 미연결 합성 데이터로 확인했다. 실서비스 반복 상태 저장/원장 변경, CRUD 저장/삭제, 실제 타이머 수행은 이번 브라우저 검증에서 실행하지 않았다. iOS/Android 실기기, Safari/Firefox/Edge, 실제 safe-area/키보드 표시/스크린리더는 UNVERIFIED.
