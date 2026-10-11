# Windows Desktop final stabilization — 2026-10-11

## 판정
기본 실사용은 정상 확인. 장시간 안정성·보안 전체 통과 판정 및 외부 릴리스 승인은 아직 없음. 이번 작업에서 Desktop 소스와 설치 EXE는 수정하지 않았다. SQL 실행, 권한 변경, push, Render 배포, 사용자 데이터 삭제를 수행하지 않았다.

## 실제 확인과 증거 구분
- 사용자 Windows 실기기 확인 PASS: `QA DESKTOP FINAL 20261011` 업무 시작 → X 숨김/복귀 → PARKED와 메모·다음 액션 → 완전 종료/재실행 → 맥락 복원·재개 → 종료 및 Work Journal. 사용자 답변: 정상.
- 직접 화면 관찰: 설치 앱 PERSONAL 로그인·조회, 로컬 서버 화면 QA ACTIVE 표시와 최종 진행 중 업무 없음. 전체 시간 합계·구간 원장 대조는 독립적으로 하지 않았으므로 exact 중복 시간 검증은 UNVERIFIED.
- 이전 사용자 확인 유지: 로그인 유지, 로그아웃/재로그인, 트레이 메뉴, 단일 인스턴스, 창 위치, 설치·제거·재설치.
- Windows UI 읽기는 가능했으나 자동 입력 반영이 불안정해 네이티브 실행 검증 일부는 사용자 확인에 의존했다.

## 회귀
이번 실행: TypeScript PASS, ESLint(src 및 단위 테스트) PASS, Production build PASS, 단위 36/36 PASS, SQL010/011 격리 회귀 13/13 PASS. 격리 결과는 실제 Supabase HTTP/인증 권한 검증을 대체하지 않는다.

## 리소스 실측
2026-10-11 20:26:55 KST, 앱 및 자식 WebView2 7개 프로세스 합계, 20.06초 관찰: Working Set 404.27MB, Private Memory 269.36MB, CPU 7.531초, 1코어 환산 37.54%, 전체 PC 환산 6.26%. 사용자 조작 중 표본이며 유휴·트레이 숨김·장시간 기준값이 아니다. 첫 실행/로그인 복원/네트워크 복귀 지연은 UNVERIFIED.

## 보안 및 호환성
소스 점검: invoke_handler 없음, remote capabilities 및 filesystem/shell/http/SQL plugin 없음. navigation allowlist, permission Deny, download false, new_window Deny 유지. 실제 악성 remote invoke·파일 접근·외부 탐색 HTTP 실행 결과는 UNVERIFIED이며 PASS로 표시하지 않는다. 쿠키/토큰 내용을 출력하지 않았다. 평문 노출의 런타임 포렌식 검증은 수행하지 않았다.
외부 링크/새 창/파일 다운로드는 차단 정책으로 일부 Library 레퍼런스와 Journal 내보내기가 앱 안에서 제한될 수 있다. 현재 트레이의 ‘브라우저에서 열기’로 웹앱을 열고 해당 화면에서 작업하는 것이 지원 경로다. 긴 Prompt 클립보드와 Content Studio 미저장 보존의 이번 네이티브 재검증은 UNVERIFIED.

## 절전·네트워크
실제 절전, 네트워크 단절, 저장 도중 절전은 UNVERIFIED. 현재 focus 복귀에서 같은 origin·온라인·visible·열린 dialog 없음·refresh disabled/busy 아님 조건으로 고정 refresh 스크립트가 실행된다. 저장 재전송이나 타이머 임의 종료는 하지 않는다. Windows 전용 power-resume 핸들러는 없음.
최소 후속안: OS 복귀를 읽기 재조회 필요 플래그로만 기록하고 창 visible/online 및 저장·모달 해제 후 한 번 재조회한다. 중단된 쓰기는 자동 재전송하지 않고 서버 상태 확인 후 사용자 재시도를 안내한다. 설치 앱의 실제 절전 재현과 입력 보존 검증 후 별도 Desktop 후보로 구현한다.

## 변경/릴리스
Desktop manifest 19개 모두 기존 해시 일치. 기존 Compact WEB manifest 12개 중 phase2-panel만 명시적으로 승인된 연차 overlay가 추가되었고 나머지 11개 해시 일치. 이전 panel 원본 및 원 manifest를 work/leave-layout-baseline에 보존했다.
이번 코드: src/components/phase2-panel.tsx, src/components/leave-record.css. DB/인증/타이머 처리 변경 없음. 연차 patch는 로컬에만 존재한다. 원격 앱을 쓰는 설치판에 반영하려면 별도 WEB 배포 승인이 필요하다. Desktop EXE 재빌드는 필요하지 않다.
후속 우선순위: 실제 절전·단절 복구 → 네이티브 보안 거부 응답 → 다운로드 차단 안내/현재 화면 브라우저 fallback → 장시간 숨김 리소스 측정.
