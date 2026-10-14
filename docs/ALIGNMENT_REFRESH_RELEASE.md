# 전체 정렬 및 Analytics 개편 — 2026-10-14

공통 카드 본문/안내/접힘 목록/푸터의 좌우 기준을 맞췄다. 헤더 버튼 높이와
정렬을 통일하고 연결 안내의 설정 버튼을 grid로 배치했다.
모바일 버튼 가상 배경이 부모 안내 전체를 덮던 문제를 제거했다.
Noto Sans KR을 next/font/google로 빌드 시 자체 호스팅하며 모든 앱 텍스트에
적용하고 자간을 -0.01em으로 통일했다.
Analytics는 요약 카드 및 분류/프로젝트/계획 대비 실제 표로 재구성했다.
Overview 오늘 일정에 Calendar와 같은 수정/휴지통 버튼을 연결했다.

검증: 단위 45/45, ESLint, production build/타입 검사 PASS.
격리 PGlite + Edge에서 Overview 삭제, Calendar 휴지통/복원,
업무 삭제 확인 유지, Analytics 표, Noto 적용, 390px 가로 넘침 없음 PASS.
1440px/390px 스크린샷 확인 및 모바일 연결 안내 배경 겹침 수정.
증거는 git 제외 work/layout-qa/에 보관한다.
실제 운영 계정 일정 정리는 사용자 승인된 계정만 대상으로 준비했으며
실행 증거는 아직 없음. 계정 이메일을 포함한 실행본은 git 제외 work/에만 둔다.
일반 일정은 soft delete로 12시간 복원 후 Cron 영구 삭제 대상이 된다.
반복 규칙은 보관하며 실행 원장/회차 예외는 유지한다.
