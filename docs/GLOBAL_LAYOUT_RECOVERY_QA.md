# 레이아웃 QA 범위


TypeScript, ESLint, Production build PASS. 단위39/39. 격리SQL010/01113/13 및Desktop mock6/6 PASS (실제 네이티브 보안 검증 아님). final build log work/layout-build-final.log.
Overview/Inbox/Calendar/Projects/Automations/Content Studio/Work Journal/Library/Analytics/Settings × 360/375/390/430/768/1024/1280/1440 총80 DOM 렌더: 문서 가로 넘침0·압축된 헤더버튼0. 최종8폭 헤더 click rect 겹침0. 모바일 visible 버튼/선택창 최소44px. DOM/computed 결과 outputs/LAYOUT_HEADER_QA.json, LAYOUT_ALL_PAGES_QA.json.
실제 스크린샷: PC와 모바일 헤더/Inbox 가독성 확인, Calendar의 기존 QA 일정 조회 및 반복 빈 상태/도움말/원장 구분 확인, 연차 수량/검색 정렬 확인. Quick Capture 긴 입력→닫기 경고→Enter로 계속 작성→동일 값 확인→저장 없이 닫기. 데이터 새로고침은 현재 Inbox 유지, 완료 상태 안내 확인. 서버 데이터 쓰기 없음.

## 미검증 및 범위 제한
Windows 외부 브라우저 실제125%/150% 확대 및 최소 창, 설치 Desktop WebView, iOS/Android 실기기와 가상 키보드/safe-area 실측 UNVERIFIED. 반복 일정 populated 원장의 대량 렌더·모든 모달의 전체 키보드 순환·실제 타이머 시작/종료 쓰기는 이번에 수행하지 않음. 기존 조회 가능한 QA 일정/프로젝트만 읽음. LIVE 조사 중 일시 인증/연결 오류 안내가 보였으나 로컬 로그인/새로고침 성공; 원격 연결 오류 원인은 레이아웃 변경 범위 밖이며 배포 후 재확인 필요. 원문 비밀/사용자 데이터 수집 없음.

