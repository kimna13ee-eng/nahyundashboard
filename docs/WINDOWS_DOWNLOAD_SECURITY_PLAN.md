# Windows 다운로드 보안·설정 계획

## 상태
LOCAL_IMPLEMENTED / STORAGE_UNVERIFIED / NO_UPLOAD / NO_DEPLOY. 실제 PERSONAL Storage 버킷·정책·요금/할당량을 아직 확인하지 않았으므로 다운로드 준비 완료를 주장하지 않는다. 버튼은 비활성 상태. 기존 SQL011, DB, Desktop19파일 및 EXE 원본 변경 없음.

## 대안 비교
|안|장점|부담/판정|
|---|---|---|
|Private GitHub Release + 인증 proxy|릴리스 버전 관리|서버 GitHub credential·private release 업로드와 운영 필요; 직접 링크는 별도 GitHub 로그인 필요|
|Supabase Private Storage + 기존 PERSONAL 세션|별도 계정·service-role 키 불필요; 객체 RLS 재사용|실제 private 버킷/SELECT 정책/제한·이용량 사전 감사 필요; 조건부 권장|
|서버 로컬 private 파일|Storage 정책 불필요|Render 빌드 이미지에 EXE 반입 및 비공개 배포 관리 필요; public 디렉터리에 놓으면 안 됨|

## 후보 구현
기본 선호 B의 저장소 + 인증된 서버 파일 전달. signed URL 대신 기존 SSR getUser 검증, 서버 allowed UUID 일치, 사용자 세션 Storage RLS를 통과한 파일만 전달한다. service-role/PAT/새 토큰 없음. GET 준비 확인과 POST 다운로드 모두 서버 검증. POST same-origin 필요. bucket/object/version/size/hash 고정, 실제 payload SHA256 검증 실패 시503. no-store, attachment, nosniff. 공개/서명 URL을 브라우저에 전달하지 않는다. 다운로드 자체는 실행하지 않는다.
짧은 서명 URL 대안은 bearer 노출·만료 재시도 관리가 추가되므로 2.03MiB 파일은 인증된 메모리 응답을 선택했다. 장기 스트리밍/대형 파일 용도로 설계하지 않았다. 세션 만료 시401이며 사용자 재로그인 후 재확인 필요.

공식 근거:
- https://supabase.com/docs/guides/storage/buckets/fundamentals
- https://supabase.com/docs/guides/storage/security/access-control
- https://supabase.com/docs/reference/javascript/file-buckets-createsignedurl
private 파일 접근에는 RLS가 적용되며 signed URL은 제한 시간 접근을 허용한다. 이 사실이 현재 프로젝트 정책의 안전성을 검증해 주지는 않는다.

## 별도 승인 전 준비할 감사/설정
1. 기존 PERSONAL 프로젝트인지, Storage 할당량/egress/파일 크기 제한과 비용 확인.
2. myops-desktop-private 이름 충돌 및 private(public=false) 확인. public bucket이면 중단.
3. SELECT 정책은 authenticated 중 본인 UUID + 해당 bucket + 정확한 releases/2.1.0/MY OPS_2.1.0_x64-setup.exe만 허용. 기존 broad 정책이 OR로 허용하지 않는지 확인. anon·다른 계정 직접 요청 거부 검증. 다른 버킷/테이블 정책 변경 금지.
4. 서버 MYOPS_DESKTOP_ALLOWED_USER_ID와 MYOPS_DESKTOP_DOWNLOAD_ENABLED 준비. 아직 값을 설정하지 않았다. enabled는 감사·파일 검증 후에만 true로 설정한다. UUID는 서버에만 관리.
5. 승인된 기존 EXE만 관리 콘솔 업로드. 공개 URL 생성 금지. 사용자 browser INSERT/UPDATE/DELETE 권한을 추가하지 않는다. 비밀키 채팅 전송 금지.
6. 서버 RLS 다운로드·실제 payload hash·미로그인401·다른 사용자403·Storage 직접 접근 거부 확인 후 버튼 활성화. 회사 PC는 사용자가 직접 확인.

이번 단계에서 버킷 생성, 정책 변경, 업로드, 환경변수 변경, SQL/push/배포는 하지 않았다. 이 설정과 공개 여부 감사 없이 enable하지 않는다.

## EXE
version2.1.0,2127839bytes,2.029MiB,NotSigned. SHA256 d240ca270772f6cd3b91cf0c28d45bd7075bae51570efd1920011159152c12e7. 요청문 hash는 일부 문자 누락; 기존 artifact manifest 및 실파일 hash가 정확한 기준.
NSIS 설치 wrapper PE machine0x14c(32bit), 설치 대상 실제 앱0x8664(x64). 설치 wrapper와 payload architecture를 혼동하지 않는다. 알려진 ASCII/UTF16 비밀키·JWT 패턴0건. 압축 payload 전체 복원/포렌식 검증은 미실행이며 ‘비밀정보 없음’ 완전 보장을 하지 않는다. 원 Tauri frontendDist는 로컬 fallback만 포함, env/server 리소스 bundle 없음.
