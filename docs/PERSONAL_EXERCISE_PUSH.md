# PERSONAL 운동 일정과 iPhone 알림

Content Studio는 PERSONAL의 연결된 SNS 시트를 보여 준다. 기존 수동 콘텐츠 화면은 메뉴에서 제외하며 데이터와 캘린더의 기존 콘텐츠 편집 연결은 유지한다.

PERSONAL의 일반 일정 등록은 콘텐츠명 한 칸만 입력한다. Overview에서는 오늘, Calendar에서는 선택한 날짜의 종일(서울 00:00~다음날 00:00) 콘텐츠 일정으로 저장한다. 시작·종료 시간, 프로젝트, 일정 분류와 메모 입력은 표시하지 않는다. 새 콘텐츠 일정은 기존 DB 기본 분류 `other`를 사용한다. 기존 일정의 제목 수정은 제목만 갱신해 숨긴 시간·프로젝트·메모·분류를 보존한다. FRENGLE의 일정 등록 폼은 유지한다.

PERSONAL의 Yoga Planner는 선택한 날짜가 속한 월요일~일요일 7칸 보드다. 이전·다음 주, 이번 주, 날짜 선택으로 원하는 주를 보고 각 요일의 ‘영상 등록’에서 HTTPS 영상 URL·영상 제목과 선택적인 운동 시간(분)을 저장한다. 영상 제목 전체와 입력한 시간을 카드에 표시한다. 시간 미입력은 별도로 표시하며 일정의 1시간 창을 영상 재생시간으로 추정하지 않는다. 주간 합계는 입력된 분 수만 더하고 미입력 영상 개수를 함께 보여 준다.

새 일정은 운동 분류와 선택 날짜의 21:00~22:00으로 저장한다. `duration_minutes`는 실제 영상에서 확인해 입력한 1~1440분의 정수 또는 null이며, 알림 시각·기존 일정 시간에 영향을 주지 않는다. 기존 운동 일정도 같은 보드에 표시하며 수정 시 제목·URL·분 수 외의 필드를 유지한다. 각 카드에서 링크 열기·수정·휴지통 이동이 가능하다. 운동 일정의 시작일을 한국 날짜로 계산하여 그날 21:00에 등록된 기기로 알린다. 운동 분류와 영상 URL이 모두 있는 일정만 대상이다. 반복 규칙·콘텐츠에서 파생된 일정은 이 발송 대상이 아니다. 같은 날 운동 일정이 여러 개면 각 일정이 알림 하나씩 생성된다.

YouTube 영상 URL은 ‘영상 제목 불러오기’로 제목을 가져오거나 직접 입력할 수 있다. 인증된 PERSONAL의 동일 출처 POST만 허용하며 11자 영상 ID로 고정 YouTube oEmbed 주소를 구성한다. 외부 리다이렉트·쿠키 전송을 막고 8초·64KiB 한도를 적용한다. 응답의 HTML·이미지·작성자·재생시간은 사용하지 않고 제목 텍스트만 최대120자로 반환한다. 다른 HTTPS 영상은 URL을 직접 요청하지 않고 제목과 분 수를 수동 입력한다. 제목 조회에 실패해도 직접 입력하여 저장할 수 있다. 근거: [공식 oEmbed 사양의 YouTube 제공자 예시](https://oembed.com/#section5.1).

알림에는 개인 제목이나 외부 영상 URL을 넣지 않는다. 기존 iPhone 서비스워커와 호환되도록 서버의 `/?view=calendar&date=...&schedule=...` 알림 URL을 유지한다. 앱은 로그인한 소유자의 일정이 운동인지 확인한 뒤 실제 저장된 서울 날짜가 속한 Yoga Planner 주간 보드의 카드로 연결한다. 일반 일정은 기존 캘린더 상세로 연결한다. 외부 영상은 소유자가 보드에서 직접 선택한다. 서비스워커는 요청을 캐시하지 않는다. 기존 기기의 알림 재등록이나 환경변수 변경은 필요 없다.

## 운영 적용 순서

1. PERSONAL 프로젝트에 `018_schedule_categories.sql`, `019_personal_exercise_push.sql`, `021_yoga_duration.sql`을 순서대로 적용한다. FRENGLE에는 적용하지 않는다. 기존 알림 설치 환경은 SQL021만 추가한다. 기존 행의 분 수는 null로 유지한다. SQL021 미적용 시 `yogaMetadataReady=false`로 시간 입력을 비활성화하며 제목·URL 저장은 유지한다.
2. 최초 1회 `node scripts/create-exercise-push-config.mjs https://my-ops-personal-preview.onrender.com`을 실행한다. 기존 파일이 있으면 덮어쓰지 않는다. `outputs/personal-exercise-push.private.env`의 값을 Render 환경변수에 저장한다. 이 파일은 Git에서 제외된다. 기존 VAPID 키를 다시 만들면 모든 기기를 재등록해야 한다.
3. PERSONAL Supabase의 Project Settings → API Keys에서 서버 전용 secret key를 Render의 `PERSONAL_SUPABASE_SECRET_KEY`에 직접 저장한다. 개인 DB의 publishable key, FRENGLE 키, OAuth client secret으로 대체하지 않는다. 비밀 키를 채팅에 붙여 넣거나 NEXT_PUBLIC 변수로 만들지 않는다. 기존 publishable/URL 설정은 유지한다.
4. Render에 최신 main을 배포한다. `GET /api/personal-push?workspace=PERSONAL`은 로그인 후 환경변수와 SQL 상태를 확인하며, 미설정이면 알림 활성화를 막는다.
5. PERSONAL에서 pg_cron, pg_net, Supabase Vault를 사용할 수 있는지 확인한다. 위 스크립트가 생성한 `outputs/personal-exercise-push-vault.private.sql`을 PERSONAL SQL Editor에서 실행한 후 `supabase/personal/setup_exercise_push_cron.sql`을 실행한다. 설치 직후 예약 호출은 비활성 상태다. URL·호출용 토큰만 Vault에 저장하며 DB 서버 키·VAPID 개인키는 Render에만 둔다.
6. iPhone iOS 16.4 이상에서 Safari로 대시보드를 열고 공유 → 홈 화면에 추가한다. 홈 화면 아이콘으로 열어 PERSONAL 로그인 → Yoga Planner → 운동 알림 → 이 기기 알림 켜기를 누르고 알림을 허용한다. 테스트 알림을 보내 실제 수신을 확인한다. 일반 Safari 탭의 알림 권한만으로는 iPhone 웹 푸시를 켤 수 없다.
7. 수신을 확인한 뒤 PERSONAL SQL Editor에서 `select cron.alter_job(jobid,active:=true) from cron.job where jobname='ops-exercise-push-2100';`을 실행한다. 요가 플래너에서 설정 새로고침을 누르면 예약 발송 준비 상태가 표시된다. 설정 SQL을 다시 실행하면 기존 job도 비활성 상태로 돌아간다.

서버 설정 준비 중으로 표시되면 로그인 상태에서 `/api/personal-push?workspace=PERSONAL`의 `setup`을 확인한다. 저장소 조회와 appUrl/databaseUrl/serviceKey/vapidKeyPair/dispatchSecret 검증 결과를 boolean으로만 반환하며 키 값·길이·일부 문자는 반환하지 않는다. serviceKey=false이면 PERSONAL_SUPABASE_SECRET_KEY, vapidKeyPair=false이면 VAPID 공개/개인키의 짝, dispatchSecret=false이면 생성한 발송 비밀값을 Render에서 확인한다. Vault와 Cron 미설정은 scheduled=false 원인이며 ready=false 원인은 아니다.

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
