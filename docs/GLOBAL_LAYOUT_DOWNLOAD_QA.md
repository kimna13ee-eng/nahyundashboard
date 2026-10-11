# Global layout + download 로컬 QA

## 범위와 감사
기존 WEB_BASE15파일 manifest와 snapshot은 원본 보존. source 중 layout.tsx,ops-shell.tsx,workflow-inbox.tsx에 이번 overlay가 추가된다. 기존 Compact CSS/연차 CSS 및 이벤트/타이머/API/SQL011 변경 없음. 서버 신규 경로는 다운로드 전용.

|화면|재사용 구조/이번 적용|
|---|---|
|Overview|기존 page header,section header,카드 제목 계층 유지; 공통 섹션 간격|
|Quick Inbox|기존 수집 액션을 header로 이동; Inbox 보기는 select 라벨, 별도 탭 아님; toolbar/empty-state 분리|
|Calendar|기존 보기 전환/상세/월주일목록 유지; 공통toolbar wrap|
|Projects/Tasks|기존 card header 및 toolbar 그룹 정렬|
|Quick Capture/Time Tracker|기존 OpsDialog/OpsFormActions, ACTIVE/PARKED 처리 유지|
|Work Journal/Analytics|기존 제목/설명/toolbar 계층, 내용 유지|
|Automations/Content Studio|기존 상세/form과 공통header typography|
|Library|원문/복사 동작 유지, toolbar 그룹화|
|Settings|PERSONAL Auth/FRENGLE 미연결 유지; 다운로드 섹션 추가|
|반복/연차|기존 RecurringScheduleRow/연차 전용 overlay 보존; 실제 기록 저장 안 함|
|모달|기존 미저장/저장중 닫기 제한 유지; footer component 재사용|

## 이번 실제 실행
10페이지 x1280/1440/360/375/390/430 DOM 실측: document 가로 넘침0; 모바일 표시된 버튼43px미만0. 원문 outputs/DOWNLOAD_LAYOUT_RESPONSIVE_QA.json. 화면 이동 PASS. 전체 화면의 모든 nested overflow/실기기 터치를 보장하는 검사는 아님.
Quick Inbox 필터 전환/빠른 수집 모달 진입 PASS. QA 제목+긴 한영 메모 입력 후 취소 시 경고·입력 표시, Enter 계속 작성 및 저장하지 않고 닫기 수행. DB 저장 안 함.
Settings 준비중/disabled 헤더와본문 버튼/다시확인 동작 확인. 로컬 익명 GET401 및 Origin없는 POST403 실제 HTTP 확인. allowlist 미설정 인증 계정 준비중503. 다른 사용자403은 단위policy 검증이며 실제 두 계정 검증 UNVERIFIED.
TypeScript/ESLint/build 및 신규 다운로드·무결성 단위, 기존 SQL010/011 격리/desktop mock 검사를 실행. 최종 수치는 build/unit 로그 확인 후 기록한다.

## 미검증
Storage private 설정/객체실업로드/RLS/실파일 authenticated download/회사PC/iOS/Android 실기기/실제 인증만료 UNVERIFIED. 다운로드 버튼 활성화 하지 않음. 모바일 버튼은 크기측정이며 설치가능성 감지 아님. 실제 반복/연차/업무 행 수정 안 함.
Before: 사용자 제공 Quick Inbox 이미지. After: Quick Inbox PC/mobile 및 Settings 준비중 캡처. 다른 화면의 별도 before 캡처는 새로 확보하지 않았으며 전 화면 Before/After 완료라고 주장하지 않는다.

React best-practices 검토: 기존 callbacks/submit 유지, semantic button/label/status, cleanup AbortController, primitive effect deps, inflight ref로 중복 클릭 차단, node crypto는 server helper에만 import. 별도 UI framework/기능 중복 구현 없음.
