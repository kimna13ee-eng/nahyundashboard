# PERSONAL 운동 일정과 iPhone 알림

Content Studio는 PERSONAL의 연결된 SNS 시트를 보여 준다. 기존 수동 콘텐츠 화면은 메뉴에서 제외하며 데이터와 캘린더의 기존 콘텐츠 편집 연결은 유지한다.

캘린더의 일반 일정에 업무·운동·기타 분류를 저장한다. 기존 일정은 기타로 유지한다. 운동 일정마다 별도의 HTTPS 영상 URL을 입력할 수 있다. 일반 일정의 시작일을 한국 날짜로 계산하여 그날 21:00에 등록된 기기로 알린다. 운동 분류와 영상 URL이 모두 있는 일정만 대상이다. 반복 규칙·콘텐츠에서 파생된 일정은 이 발송 대상이 아니다. 같은 날 운동 일정이 여러 개면 각 일정이 알림 하나씩 생성된다.

알림에는 개인 제목이나 외부 영상 URL을 넣지 않는다. 알림을 누르면 PERSONAL 캘린더의 해당 날짜와 일정 상세를 열고, 로그인한 소유자가 영상 링크를 선택한다. 서비스워커는 요청을 캐시하지 않는다.

## 운영 적용 순서

1. PERSONAL 프로젝트에 `018_schedule_categories.sql`, `019_personal_exercise_push.sql`을 순서대로 적용한다. FRENGLE에는 적용하지 않는다.
2. 최초 1회 `node scripts/create-exercise-push-config.mjs https://my-ops-personal-preview.onrender.com`을 실행한다. 기존 파일이 있으면 덮어쓰지 않는다. `outputs/personal-exercise-push.private.env`의 값을 Render 환경변수에 저장한다. 이 파일은 Git에서 제외된다. 기존 VAPID 키를 다시 만들면 모든 기기를 재등록해야 한다.
3. PERSONAL Supabase의 Project Settings → API Keys에서 서버 전용 secret key를 Render의 `PERSONAL_SUPABASE_SECRET_KEY`에 직접 저장한다. 개인 DB의 publishable key, FRENGLE 키, OAuth client secret으로 대체하지 않는다. 비밀 키를 채팅에 붙여 넣거나 NEXT_PUBLIC 변수로 만들지 않는다. 기존 publishable/URL 설정은 유지한다.
4. Render에 최신 main을 배포한다. `GET /api/personal-push?workspace=PERSONAL`은 로그인 후 환경변수와 SQL 상태를 확인하며, 미설정이면 알림 활성화를 막는다.
5. PERSONAL에서 pg_cron, pg_net, Supabase Vault를 사용할 수 있는지 확인한다. 위 스크립트가 생성한 `outputs/personal-exercise-push-vault.private.sql`을 PERSONAL SQL Editor에서 실행한 후 `supabase/personal/setup_exercise_push_cron.sql`을 실행한다. 설치 직후 예약 호출은 비활성 상태다. URL·호출용 토큰만 Vault에 저장하며 DB 서버 키·VAPID 개인키는 Render에만 둔다.
6. iPhone iOS 16.4 이상에서 Safari로 대시보드를 열고 공유 → 홈 화면에 추가한다. 홈 화면 아이콘으로 열어 PERSONAL 로그인 → 캘린더 → 운동 알림 → 이 기기 알림 켜기를 누르고 알림을 허용한다. 테스트 알림을 보내 실제 수신을 확인한다. 일반 Safari 탭의 알림 권한만으로는 iPhone 웹 푸시를 켤 수 없다.
7. 수신을 확인한 뒤 PERSONAL SQL Editor에서 `select cron.alter_job(jobid,active:=true) from cron.job where jobname='ops-exercise-push-2100';`을 실행한다. 캘린더에서 설정 새로고침을 누르면 예약 발송 준비 상태가 표시된다. 설정 SQL을 다시 실행하면 기존 job도 비활성 상태로 돌아간다.

## 발송과 재시도

DB의 기본 UTC 기준 12:00~12:29(한국 21:00~21:29)에 매분 보호된 서버 API를 호출한다. 일정·날짜·구독 조합을 유일하게 저장하고 행 잠금/claim token으로 동시 발송을 제한한다. 임대 2분, 최대 3회 시도 후 종료한다. 만료 구독(404/410)은 비활성화한다. 삭제·분류 변경·날짜 변경·구독 해제된 항목은 발송 직전에 재확인한다.

Web Push 서비스의 접수는 기기의 수신 확인이 아니다. 네트워크·집중 모드·OS·Render 기동 지연에 따라 도착이 늦을 수 있다. TTL은 5분이며 당일 발송 창은 30분이다. 실패 직후 서버가 중단되어 접수 성공을 DB에 기록하지 못한 경우 재시도가 생길 수 있고, 같은 태그를 사용해 알림을 교체한다.

예약 HTTP 요청은 Vault의 비밀 문자열로 `exercise-push:<epoch seconds>`를 HMAC-SHA256 서명한다. 서버는 과거 5분·미래 30초 범위와 상수 시간 서명 비교를 통과한 POST만 처리한다. 요청의 body·query로 소유자나 날짜를 지정할 수 없다. pg_net 큐에는 짧은 유효기간의 서명만 남고 원본 비밀값은 남지 않는다.

호스팅 pg_net 객체는 supabase_admin 소유여서 postgres의 권한 회수가 적용되지 않을 수 있다. net을 Data API 노출 스키마에 추가하지 않는다. Vault의 복호화 값은 일반 역할에서 읽을 수 없어야 한다. 큐 변경 권한에 의한 발송 누락은 서명으로 막을 수 없으며 이 권한을 가진 관리자 계정을 신뢰해야 한다.

운영 확인은 `cron.job`의 활성 상태, `net._http_response`의 HTTP 성공 여부, `ops_exercise_push_deliveries`의 sent/failed 상태를 함께 확인한다. pg_net request_id만으로 발송 성공을 판단하지 않는다. 응답·로그에는 endpoint, 기기 인증키, 원본 발송 비밀값을 출력하지 않는다.

중지는 해당 cron job을 비활성화하거나 기기에서 알림을 해제한다. 개인정보 보관 정책에 따라 오래된 배송 원장은 관리자 작업으로 정리할 수 있다.

## 근거

- [WebKit의 iOS 홈 화면 웹 푸시 요건](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)
- [Supabase pg_cron·pg_net·Vault 패턴](https://supabase.com/docs/guides/functions/schedule-functions)
- [Supabase 서버 전용 API 키](https://supabase.com/docs/guides/getting-started/api-keys)
- [Render 무료 서비스 기동 특성](https://render.com/docs/free)

SQL019의 owner RLS, 권한, 서울 날짜 경계, 임대/재시도/중복 방지는 PGlite로 검증한다. 기기 키와 암호화 요청은 web-push로, 서비스워커의 외부 URL 거부·탭 이동은 VM 테스트로 검증한다. 실제 아이폰 수신은 운영 배포·권한 허용 이후 확인해야 한다.
