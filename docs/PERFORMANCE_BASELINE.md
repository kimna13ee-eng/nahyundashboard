# PERFORMANCE BASELINE

2026-10-11. 측정 가능한 값만 기록. 같은 조건의 전후 비교는 미완료.

- 로컬 dev HTTP GET /: 200, TTFB 0.799993초, 전체 0.805266초, HTML 25,865 bytes (한 번 측정, 개발 빌드/캐시 영향).
- Production .next/static/chunks JS 전체 합계: 720,587 bytes / 11개. 모든 경로 합계이며 첫 화면 전송량이나 gzip 크기가 아님.
- 원격 curl: HTTP000/SIZE0, 제한 환경 연결 실패. 응답 지연 측정으로 사용 금지.
- 브라우저 계측 API는 현재 read-only 도구에서 performance 미제공. 인증 복원·API waterfall·LCP·메모리·React commit 시간 수치 미확인.

코드상 관찰: OpsShell 초당 tick이 전체 shell을 갱신, 매30초 기본/워크플로 조회, focus 복귀 조회. Phase2 GET은 여러 테이블 및 capability를 조회한다. 원인 측정 없이 Render cold start나 PWA가 버벅임 원인이라고 결론 내리지 않는다.

보강: 숨김 화면 tick 생략, 숨김/오프라인/모달/쓰기 중 자동 조회 생략, focus/visibility/online 2초 중복 이벤트 억제. 수동 조회에서 같은 사용자 객체 교체로 발생하는 추가 초기 조회 억제. UI clock을 서버에 쓰지 않는다.

후속 측정: 같은 로그인 테스트 계정/동일 브라우저·기기로 warm 5회와 idle 후 1회, navigation TTFB/LCP, /session·ops·workflow·phase2 요청 수/시간, 전환 latency, 백그라운드30초 복귀, 100개 콘텐츠 긴 텍스트. Render 인스턴스 종류·서버 로그 확인 후 cold start 여부 판정. 개선율은 아직 산출 불가.
