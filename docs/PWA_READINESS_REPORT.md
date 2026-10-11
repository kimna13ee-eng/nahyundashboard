# PWA READINESS REPORT

로컬 후보: PARTIAL. 기존 배포: manifest 없는 웹 바로가기 상태이며 새 패치 미배포.

| 항목 | 상태 |
|---|---|
| Next metadata manifest 경로 | 로컬 HTTP 200, standalone/start_url/scope/icons 확인 |
| 아이콘 | 180/192/512 PNG 생성, 기기 설치 외관 미검증 |
| Apple 홈 화면 / viewport | 코드 구현, 실제 iOS 실행 미검증 |
| Service Worker | 도입하지 않음 |
| Cache API 업무 데이터 | 새 캐시 없음 |
| 설치 / standalone | Windows·Android·iPhone 실기기 UNVERIFIED |
| 앱 업데이트 | SW 오래된 코드 캐시 없음; 수동 재시작 동선. 자동 버전 비교/새 버전 알림 미구현 |
| 로그인 / 상태 | 기존 Supabase 서버·쿠키 경로 재사용. 이번 기기별 재실행 UNVERIFIED |

SW 필요성: 현재 요구는 홈 화면/독립창/재조회이며 민감한 데이터 오프라인 저장은 승인되지 않았다. 단순 manifest 방식을 우선한다. 오프라인에서는 저장을 성공으로 간주하지 않고 자동 타이머 요청/콘텐츠 저장 재전송을 하지 않는다. 기존 설치 기기의 과거 SW 유무는 실제 기기별로 확인 필요하며 무조건 캐시 삭제하지 않는다.

PC/Android 설치 메뉴는 브라우저 조건에 따라 다르므로 실제 설치 테스트 전 지원 완료로 보고하지 않는다. HTTPS 원격 배포 후 설치→재진입→업데이트→인증 만료를 별도 확인한다.
