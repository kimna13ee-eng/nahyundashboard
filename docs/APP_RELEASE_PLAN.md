# APP RELEASE PLAN

배포 승인 전 push/Render/실제 SQL/desktop 외부 배포 없음. 웹과 desktop 별도 릴리스.

## 웹 후보 파일
기존 콘텐츠 단위:
- src/components/phase2-panel.tsx (v2 재조회·제출 보호도 함께 포함)
- src/lib/personal-content-form.ts
- tests/personal-content-form.test.ts
v2 웹:
- src/app/layout.tsx
- src/app/manifest.ts
- src/app/editorial.css
- src/components/ops-shell.tsx
- src/components/ops-dialog.tsx
- src/components/app-recovery-controls.tsx
- public/icons/my-ops-180.png
- public/icons/my-ops-192.png
- public/icons/my-ops-512.png
문서: APP_EXPERIENCE_MASTER, PWA_READINESS_REPORT, MOBILE_UX_AUDIT, PERFORMANCE_BASELINE, DESKTOP_ARCHITECTURE, DESKTOP_SECURITY_REVIEW, DESKTOP_TEST_CHECKLIST, APP_RELEASE_PLAN。 기존 콘텐츠 QA 문서는 이전 승인 후보와 별도 diff 검토.

제외: .env.local/키/복구 원문/work/outputs/node_modules/.next/tsbuildinfo/임시산출물. 루트 Git 초기화 없음. 배포 전 clean checkout에 정확한 목록만 복사, diff/비밀정보 검사, 새 main SHA 재확인.

## 검사
TypeScript·ESLint·Production build, 기존 단위34개, 격리 SQL011/SQL010/콘텐츠15개. 브라우저 입력 경고·수동 재조회 검증 및 manifest HTTP 확인. 실제 Windows/Android/iPhone 설치·standalone·offline·강제종료는 UNVERIFIED. 응답 유실 서버 멱등성은 미완료.

## 순서 / 승인
1. Phase 0 보존 + Phase 1/2 로컬 검증 결과 검토.
2. 필요한 모바일 실기기 테스트 후 웹 후보 배포 별도 승인.
3. 승인 후 GitHub/Render 변경, Preview 원격 Auth/timer/capture/content/manifest 회귀.
4. 별도 승인 후 desktop Tauri POC 구현·필요 도구 설치. Auth/OS 권한 경계 통과 전 기술 확정 금지.
5. EXE 로컬 빌드/설치/통합 QA. 외부 배포 별도 승인.

롤백: 웹은 이전 6b330bb 앱으로 Render 배포 복원 가능, SQL011·readiness DB는 그대로 유지. 이번 새 SQL 없음. 새 Service Worker 캐시 없음. 이전 코드의 콘텐츠 유형 누락 위험이 돌아오므로 롤백 시 안내. desktop은 별도 배포/제거로 웹 복원에 영향 없어야 한다.

최종 로컬 회귀: TypeScript/ESLint/build PASS, 단위34/34, 격리15/15. 브라우저 모달 이탈 경고·입력 유지·명시적 버리기·현재 화면 재조회·390px 레이아웃 PASS. 실제 오프라인/응답 유실/설치 기기는 미검증. Phase 3 구현 승인은 웹 배포 승인과 별개다.

## 2026-10-11 PWA RELEASE GATE 갱신
최신 PWA 후보는 PWA_RELEASE_MANIFEST.json의19개 파일을 기준으로 한다. 이전20개 목록은 대체된다. Desktop 설계3개는 이번 웹 후보에서 제외하며 PWA_RELEASE_REPORT/PWA_MOBILE_QA_CHECKLIST 추가. 이번 전체 격리회귀19/19, 단위34/34 PASS. 하단 취소 경고 우회 보정 포함, 재검증 완료. 실제 모바일 설치/오프라인/강제 종료 미검증. 사용자 승인 전 push/배포 없음.
