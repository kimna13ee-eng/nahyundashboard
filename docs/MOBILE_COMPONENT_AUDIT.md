# 모바일 컴포넌트 감사

| 파일 | 변경/역할 | 남은 확인 |
|---|---|---|
| src/components/app-recovery-controls.tsx | 헤더 재조회 잠금·상태·재시작 확인 | 실제 오프라인 복구 |
| src/components/ops-dialog.tsx | 입력 비교·닫기 보호·포커스 복원·busy | OS 종료, 모든 개별 모달 배경 클릭 |
| src/components/ops-shell.tsx | 인증 상태·Calendar 상세·메모 저장·콘텐츠 선택 초기화 | 다중 탭/늦은 pause 경합 |
| src/components/phase2-panel.tsx | 데이터 재조회 대기·연결 콘텐츠 편집 | 모든 리소스 CRUD 실기기 |
| src/components/workflow-inbox.tsx | 중단 맥락 입력 안내 | 실기기 입력 |
| src/lib/personal-content.ts | Calendar 투영에 원문·연결·QA 메타데이터 유지 | DB 구조 변경 없음 |
| src/lib/mobile-calendar.ts | 표시용 유형·문자 단위 축약 | 단위 테스트 PASS |
| src/app/editorial.css | 모바일 버튼·줄바꿈·모달·원문 표시 분기 | iOS 안전 영역/키보드 |
| tests/mobile-calendar.test.ts | 원문 보존·QA 분류·연결 메타데이터 | PASS |

공통 OpsDialog를 재사용했다. 새 SQL·외부 서비스·회사 접근·토큰 저장소를 추가하지 않았다. 기존 SQL011 API/권한 코드 및 디자인 시스템을 유지한다.
