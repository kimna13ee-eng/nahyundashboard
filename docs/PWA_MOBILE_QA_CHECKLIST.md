# PWA MOBILE QA CHECKLIST

검증 기준일 2026-10-11. 기기별 결과를 각각 작성. 브라우저 화면 크기 검증은 설치 실기기 결과와 분리한다.

| 시나리오 | 합격 조건 | 로컬 IAB | iPhone 홈 화면 | Android 홈 화면 |
|---|---|---|---|---|
| 홈 화면 실행 | MY OPS 아이콘·standalone, 로그인/로딩 상태 명확 | 브라우저만 확인 | UNVERIFIED | UNVERIFIED |
| 기존 로그인 복원 | 새로 실행 후 개인 계정 및 데이터, 만료 시 재로그인 안내 | 기존 로그인 조회 PASS; 만료 미검증 | UNVERIFIED | UNVERIFIED |
| 데이터 새로고침 | 현재 화면/선택 유지, 새 데이터 조회, 중복 저장 없음 | Library/Content Studio 유지 PASS | UNVERIFIED | UNVERIFIED |
| 전체 재시작 | 별도 확인, 취소 가능, 열린 입력창 중 재시작 차단 | 확인/취소 PASS; 실제 재시작 이번 미검증 | UNVERIFIED | UNVERIFIED |
| 콘텐츠 작성 보존 | 유형 누락 저장 차단, 입력 유지, 템플릿 유형 지정, 이탈 경고 | 미저장 폼 PASS | UNVERIFIED | UNVERIFIED |
| 앱 백그라운드/복귀 | 현재 초안 유지·서버 타이머 조회; 자동 쓰기 없음 | 코드 검토, 실제 복귀 미검증 | UNVERIFIED | UNVERIFIED |
| 네트워크 재연결 | 오프라인 안내, online 조회, 자동 쓰기 재전송 없음 | 코드 검토만 | UNVERIFIED | UNVERIFIED |
| 화면 전환 | 메뉴별 목적 화면, 미저장 폼 닫기 경고 | 주요 메뉴/취소 PASS | UNVERIFIED | UNVERIFIED |
| 긴 프롬프트 | 입력·스크롤, 취소 후 원문 불변, 키보드 조작 | 3,400자/201줄 계속 작성 유지 PASS | UNVERIFIED | UNVERIFIED |
| 타이머 상태 재조회 | 단일 서버 ACTIVE 기준, 종료/중단은 guarded, 시계 임의 저장 없음 | 업무 선택/맥락 패널 조회 PASS; 쓰기 미실행 | UNVERIFIED | UNVERIFIED |
| 아이콘/설치 | manifest·PNG 제공, 설치 아이콘 및 앱 모드 실제 확인 | manifest HTTP200; 실제 설치 미검증 | UNVERIFIED | UNVERIFIED |
| 강제 종료/재실행 | 저장된 DB 자료 유지, 미저장 복구 한계 안내 | 미검증; 영구 초안 복구 미지원 | UNVERIFIED | UNVERIFIED |

## 실기기 실행 순서
1. 기기 모델·OS·브라우저 버전·네트워크·앱 설치 방식을 기록. PERSONAL 프로젝트 식별. 실제 비밀값 기록 금지.
2. 승인된 Preview 배포 이후 홈 화면 설치. 기존 단순 바로가기와 standalone 구분. 과거 SW가 있다면 등록 상태만 확인하고 임의 캐시 삭제 금지.
3. 로그인/데이터 조회→새로고침→전체 재시작 취소/확인. 기존 사용자 데이터는 읽기만.
4. 비민감 QA 제목으로 콘텐츠 폼 입력→유형 누락 차단→긴 메모/체크리스트/촬영·편집·발행 datetime→미저장 닫기/계속 작성. 실제 저장 테스트는 별도 QA 기록만, 삭제 금지.
5. 백그라운드30초·복귀·잠금/절전·가상 키보드·화면 회전. 미저장 입력이 OS에 의해 소멸할 수 있고 현재 영구 복구는 미지원.
6. 네트워크 차단→조회/저장 실패→복구. 저장 응답 유실이면 목록에서 존재 여부 확인 후 행동; 임의 재전송 금지. 생성 서버 멱등성 미구현.
7. 테스트 업무에 한해 guarded start/park/resume/finish, PC 교차 조회. 동일 세션 늦은 pause/다중 탭/오프라인 경합은 별도 P1 검증.
8. 결과/증거/결함/재시험을 기기별 기록. 실측 로그인·조회 완료·전환 시간과 스크롤 입력 반응성 수집.

PC Chrome/Edge 및 Windows 설치 PWA도 별도 기기/설치 환경 결과 필요. IAB는 해당 브라우저 자체의 실기기 PASS로 간주하지 않음.
