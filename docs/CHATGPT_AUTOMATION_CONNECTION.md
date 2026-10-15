# ChatGPT 자동화 결과 연결 — 2026-10-14

## 구현 범위와 실제 상태

개인 Metricool 자동화가 `save_metricool_result` MCP 도구로 최종 결과를
보내면 PERSONAL `ops_automation_results`에 저장한다. 대시보드 Automations는
본문/작업 보고 시각/서버 수신 시각/ChatGPT 원본을 표시하며 열린 Overview와
Automations 화면에서 30초마다 새 결과를 조회한다.
Overview 실행 수는 오늘 받은 결과 수(최근 100개 조회 범위)이며 ChatGPT 전체
예약 실행 수 또는 성공률이 아니다. 결과가 없어도 실패로 간주하지 않는다.

키워드 검색 자동화 및 사이트 읽고 키워드 추천은 사용자 지정 FRENGLE 자료다.
전용 저장소가 아직 없으므로 수신 불가이며 개인 저장소로 대체하지 않는다.

2026-10-15 운영 확인: SQL013 및 Render 설정 후 ChatGPT의
`MY OPS · PERSONAL Metricool` 연결을 승인했다. 조회 0건 → 테스트 저장 →
재조회 1건 및 대시보드 Automations 본문/Overview 수신 건수 1을 확인했다.
테스트 저장 ID는 `3ece8065-527f-47d7-8981-b779380d7fa6`이며 실제 지표가 아니다.
검증 대화: https://chatgpt.com/c/6ad0491b-4c6c-83ec-abb9-56c1f9bf84dd

기존 `Metricool 데이터 확인` 작업(`6ac23b5f41d081918f6a53b261787517`)은
일시 중지 상태였다. 원래 조회 지시를 유지하고 실제 PERSONAL 결과만 저장하는
지시를 추가·저장한 뒤 재개했다. UI의 다음 실행은 3일 후로 표시됐다.
예약 실행에서 새 도구를 실제로 호출하는지는 아직 검증하지 않았다.
FRENGLE 두 자동화는 전용 프로젝트 준비 및 별도 수신 구현이 필요하다.

## 인증 및 저장

- 공식 MCP SDK의 stateless Streamable HTTP JSON transport를 사용한다.
- Supabase JWT 검증 및 getUser 확인 후 owner_id를 서버에서 결정한다.
- 승인된 PERSONAL_MCP_CLIENT_ID와 일치하는 OAuth 토큰만 허용한다.
- 비밀 키/service_role 사용 없음. 사용자 JWT와 publishable key로 RLS 적용.
- MCP 도구는 개인 Metricool 결과 저장 및 최근 결과 조회 두 개뿐이다.
- 전체 Supabase OAuth 토큰은 기존 사용자 권한을 가지므로, OAuth 승인 범위와
  기존 테이블 RLS도 검토해야 한다. 이 연결은 제한된 전용 DB 역할 발급이 아니다.
- 같은 owner/source/run_key는 중복 저장하지 않으며 다른 본문으로 덮어쓰지 않는다.
- 본문은 텍스트로 렌더링하고 HTML을 실행하지 않는다. 비밀정보 패턴/입력 길이/
  ChatGPT 원본 URL/보고 시각 검증, SQL 분당 30개 수신 제한을 적용한다.
- 결과 수정/삭제 권한은 authenticated에 부여하지 않는다.

## 설치 순서 (운영 설정 필요)

1. PERSONAL SQL Editor에서 `013_automation_results.sql` 내용을 검토·승인 후 적용.
   새 테이블/정책/트리거만 추가하며 기존 업무·일정은 변경하지 않는다.
2. Render에 APP_PUBLIC_URL을 실제 HTTPS 대시보드 origin으로 설정하고 새 앱 배포.
3. Supabase Authentication → OAuth Server를 검토 후 활성화한다.
   Site URL은 대시보드 origin, authorization path는 `/oauth/consent`로 설정한다.
4. ChatGPT custom MCP 도구의 OAuth 연결 화면에서 요구하는 정확한 callback URL을
   확인하고 Supabase에 전용 OAuth 클라이언트를 등록한다. 자동 클라이언트 등록은
   기본으로 켜지 않는다. client secret은 ChatGPT의 인증 설정에만 입력하며
   채팅/저장소/로그에 넣지 않는다.
5. 클라이언트 ID를 Render PERSONAL_MCP_CLIENT_ID에 입력하고 재시작한다.
6. ChatGPT 연결 endpoint는 `https://<dashboard-origin>/mcp`다.
   사용자 본인이 OAuth 승인 페이지에서 요청 앱/범위/반환 주소를 확인하고 승인한다.
7. 개인 Metricool 작업에 이 도구를 선택하고 최종 결과를 저장하도록 지침을 추가한다.
   같은 회차 재시도에는 같은 run_key를 사용한다. 원래 cadence/분석 지침은 유지한다.
8. 실제 1회 실행으로 저장 응답 ID, 대시보드 결과, 수신 시각, 원본을 대조한다.
   이 단계가 통과한 뒤에만 운영 자동 연결 완료로 표시한다.

## Metricool 작업에 추가할 지침 초안

분석을 마친 뒤 사용자가 지정한 PERSONAL 계정 분석 결과만 MY OPS의
save_metricool_result 도구에 저장한다. run_key는 예약 회차의 ISO 시각으로
고정해 재시도에도 동일하게 사용한다. title은 보고서 제목, body는 최종 결과,
source_url은 실제 ChatGPT 대화 주소, reported_at은 실제 결과 작성 시각이다.
원본 주소나 예약 시각을 확인할 수 없으면 값을 만들지 말고 저장 연결 실패를
알린다. 회사/FRENGLE 계정 데이터는 저장하지 않는다. 도구의 성공 응답을 받은
경우에만 대시보드 저장 완료를 알린다. 저장 실패 시 분석 결과는 ChatGPT에 유지한다.

## 검증

단위 48/48, 결과 DB 소유자 RLS/중복/기존 결과 보호 1/1,
MCP 초기화/도구 호출/입력 검증, production build/타입 검사/ESLint PASS.
Edge 격리 UI에서 결과 본문/원본 링크/HTML 무실행/390px 넘침 없음 PASS.
로컬 HTTP endpoint의 미인증401 및 외부 Origin403 PASS.
실제 Supabase OAuth/ChatGPT MCP 연결과 테스트 저장·조회·대시보드 반영 PASS.
예약 실행에 의한 자동 저장은 미검증이다.

공식 문서:
- https://learn.chatgpt.com/docs/automations
- https://developers.openai.com/plugins/build/mcp-server
- https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication
- https://supabase.com/docs/guides/auth/oauth-server/getting-started
