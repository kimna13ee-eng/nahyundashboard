# 일정 휴지통 릴리스 상태 — 2026-10-13

## 완료된 로컬 작업

- 일정 삭제를 soft delete로 처리하고 12시간 이내 복원하는 기존 구현을 검증했다.
- 기존 운영 기록의 SQL011과 충돌하지 않도록 새 마이그레이션을 SQL012로 정리했다.
- API 안내 및 DB/브라우저 테스트의 파일 참조를 SQL012로 맞췄다.
- 운영 적용 전 스키마·제약·RLS·테이블/열 권한·함수 정의/소유자/권한을 확인하는 읽기 전용 `supabase/personal/012_schedule_trash_preflight.sql`을 추가했다.
- 역사적 SQL 기록과 운영 적용 증거의 차이는 `DATABASE_MIGRATION_INDEX.md`에 기록했다.

## 검증

- 단위 테스트: 43/43 PASS.
- 격리 DB 회귀: 9/9 PASS. 휴지통 삭제, 중복 삭제 시 기한 유지, 12시간 만료, 소유자 경계, 직접 삭제/메타데이터 수정 및 purge 실행 권한 차단, 복원과 purge의 직렬 실행 결과 포함.
- Edge 브라우저 + 격리 PGlite: 일정 삭제 → 휴지통 → 복원 PASS. 제목·메모·프로젝트·시작/종료 시간 보존과 업무 삭제 확인 모달 유지 확인.
- TypeScript, ESLint, production build PASS.
- Windows 샌드박스에서 경로 접근 오류와 Supabase 타입 확인 오류가 발생했다. 제한 밖의 타입 검사와 빌드는 통과했고, 잠금 파일 기준 offline install은 이미 최신 상태였다. 의존성 버전 변경 없음.
- 브라우저 테스트는 API 요청을 격리 DB로 대체한다. 실제 Next API와 Supabase HTTP 인증·권한 검증을 대체하지 않는다. 복원/purge 동시 접속 경합 자체도 실환경 미검증이다.

## 운영 반영 전 남은 단계

사용자가 실행한 운영 preflight 결과: 휴지통 열 2개 및 RPC 3개 모두 미설치. 일정 테이블은 예상 열/제약과 일치하며 owner=postgres, RLS/FORCE RLS=true, authenticated 소유자 ALL 정책, anon/PUBLIC 테이블 권한 없음. migration ledger는 없음. information_schema.column_privileges 결과는 테이블 권한에서 파생된 항목을 포함하므로 독립적인 열 권한 존재 증거는 아니다. SQL012는 독립적인 열 UPDATE 권한이 존재하는 경우까지 회수하도록 보강했다. 격리 DB에서 과거의 독립적인 메타데이터 UPDATE 권한을 재현해 차단을 검증했다.

현재 작업 폴더에는 `.env.local` 및 실제 PERSONAL 연결 설정이 없다. 운영 DB 점검/SQL 실행, Git push 및 Render 배포는 이번 검증에서 수행하지 않았다.

사용자가 PERSONAL 프로젝트 `rimtvotfmtupguslpzts`를 확인했다. 해당 Supabase 대시보드를 열었지만 현재 인앱 브라우저는 로그인 화면이므로 운영 DB preflight는 아직 실행하지 못했다. GitHub 원격 HEAD 읽기 결과는 `f657f34ebe7780532b9323d85e2775439079f5c7`이며, 로컬 휴지통 구현 커밋 `ea9797f`보다 이전 상태다. 과거 문서의 배포 주소는 `https://my-ops-personal-preview.onrender.com/`이나 현재 LIVE 상태는 이번에 확인하지 못했다.

1. 현재 PERSONAL 프로젝트와 배포 서비스의 주소 및 접근 상태 확인.
2. 읽기 전용 preflight 실행 및 운영 migration ledger 확인. 기존 SQL001~010 또는 추적 파일이 없는 legacy SQL011을 재실행하지 않는다.
3. 백업을 확보하고 적용할 SQL012 및 배포 diff 확인 후 운영 변경 승인.
4. SQL012 적용 후 즉시 호환 API/앱 배포. SQL012 설치 전 새 API는 일정 조회 오류를 반환하므로 앱을 먼저 배포하지 않는다.
5. 로그인 상태에서 실제 삭제·복원·만료 안내·타이머 및 기존 기능 회귀 검증.
6. Cron은 별도 검토·승인 후 등록. 현재는 purge 함수만 있으며 자동 영구 삭제는 설정되지 않았다. 만료된 일정은 복원할 수 없지만 물리적 행은 purge 실행 전까지 남는다.

## 복구 주의

앱을 예전 버전으로 되돌리는 것만으로 호환성이 보장되지 않는다. SQL012는 authenticated 직접 DELETE를 회수하므로 예전 앱의 일정 삭제가 실패할 수 있다. 운영 권한을 임의로 복원하거나 휴지통 데이터를 삭제하지 말고, SQL012와 호환되는 앱 수정으로 복구한다.
