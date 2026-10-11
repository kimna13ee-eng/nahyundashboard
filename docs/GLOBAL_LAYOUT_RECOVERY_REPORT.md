# GLOBAL LAYOUT RECOVERY — 로컬 후보

기준 GitHub main / Render LIVE: c6b64321ac9c9c5016d35a8dee243c0471b985f1. 2026-10-12 읽기 전용 재확인. deploy dep-db5qbdg473hc73c279dg LIVE. push/배포 없음.

## 실제 원인
LIVE 768px에서 부모 헤더는 flex nowrap, 자식 shrink=1. Quick Capture 너비60.56px/높이107.02px, 계정 버튼50.14px/59.18px. compact.css의 overflow-wrap:anywhere 및 min-width32px가 한 글자 단위 줄바꿈을 허용했다. 1024px에서도 Quick Capture109.45px/43.23px로 압축. 헤더 고정76px 높이와 좁은 부모에 종속된 복구 팝업이 문제를 악화했다. viewport scale=1; 실제 OS 확대율은 측정하지 않았다. 기존 폭 검사만으로는 텍스트 압축을 검출하지 못했다.

## 수정
ops-shell: 워크스페이스/빠른 업무/앱 관리 그룹 분리, 줄바꿈 가능한 auto-height 헤더. AppRecoveryControls: 버튼 행과 status 행 분리. structured-layout: 해당 헤더만 shrink 방지·keep-all, 고정 최소 선택창112px, 중간화면 유틸리티 별도 행, 모바일 기본 두 행 및44px 클릭 영역, 안전영역 유지. 복구 도움말320px 독립 너비, 화면 경계 제한. 전역 nowrap/새 !important/overflow 숨김 없음.
Phase2: 새로고침+검색 toolbar 통합, 연차 수량은 별도 본문 유지. 빈 상태와 반복 도움말·미완료/전체 원장 disclosure 분리. Inbox 기존 필터·수집 동작 유지, 설명/액션 랩과 간격 보강. Footer 상단24px. 기존 모달 구조 재작성 없음.

## 검증 완료
TypeScript, ESLint, Production build PASS. 단위39/39. 격리SQL010/01113/13 및Desktop mock6/6 PASS (실제 네이티브 보안 검증 아님). final build log work/layout-build-final.log.
Overview/Inbox/Calendar/Projects/Automations/Content Studio/Work Journal/Library/Analytics/Settings × 360/375/390/430/768/1024/1280/1440 총80 DOM 렌더: 문서 가로 넘침0·압축된 헤더버튼0. 최종8폭 헤더 click rect 겹침0. 모바일 visible 버튼/선택창 최소44px. DOM/computed 결과 outputs/LAYOUT_HEADER_QA.json, LAYOUT_ALL_PAGES_QA.json.
실제 스크린샷: PC와 모바일 헤더/Inbox 가독성 확인, Calendar의 기존 QA 일정 조회 및 반복 빈 상태/도움말/원장 구분 확인, 연차 수량/검색 정렬 확인. Quick Capture 긴 입력→닫기 경고→Enter로 계속 작성→동일 값 확인→저장 없이 닫기. 데이터 새로고침은 현재 Inbox 유지, 완료 상태 안내 확인. 서버 데이터 쓰기 없음.

## 미검증 및 범위 제한
Windows 외부 브라우저 실제125%/150% 확대 및 최소 창, 설치 Desktop WebView, iOS/Android 실기기와 가상 키보드/safe-area 실측 UNVERIFIED. 반복 일정 populated 원장의 대량 렌더·모든 모달의 전체 키보드 순환·실제 타이머 시작/종료 쓰기는 이번에 수행하지 않음. 기존 조회 가능한 QA 일정/프로젝트만 읽음. LIVE 조사 중 일시 인증/연결 오류 안내가 보였으나 로컬 로그인/새로고침 성공; 원격 연결 오류 원인은 레이아웃 변경 범위 밖이며 배포 후 재확인 필요. 원문 비밀/사용자 데이터 수집 없음.

## 배포 후보
변경 소스4개 + 문서3개, WEB-LAYOUT-HOTFIX_MANIFEST.json 참조. 직전24파일 중 shell/phase2/structured-layout만 변경; AppRecoveryControls는 새 변경 대상. 나머지21파일 원본 해시 유지. API/Auth/SQL/Storage/EXE/환경/패키지 파일 제외. Desktop 원본 보존. 승인 후 clean checkout에서 최신main/LIVE 기준과 allowlist·hash 재검증→회귀→커밋/push→수동배포→원격8폭QA 순서. 이번에는 실행하지 않음.
