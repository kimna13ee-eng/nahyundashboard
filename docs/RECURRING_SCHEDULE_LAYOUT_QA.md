# 반복 일정 정렬 QA

## 변경

PC: 정보 minmax(0,1fr) + 조작 auto의 2열 grid. 일정명, 기록된 주기/간격, 상태 배지, 예정 회차 시간, 메모 순서. 오른쪽 수행 상태 label/select와 수정/삭제 버튼 하단 중앙 정렬. 모바일: 정보/조작 2단, controls wrap, gap6~10px, 버튼44px hit영역. 긴 제목/공백 없는 URL 줄바꿈. archived_at·규칙·예외·실행 원장 및 삭제 정책 변경 없음.

## 실제 실행 결과

|대상|결과|
|---|---|
|1280x900 / 1440x900 합성 반복 행|PASS: 32px 버튼, 긴 제목/메모 줄바꿈, 가로 넘침 없음|
|360 / 375 / 390 / 430 합성 반복 행|PASS: 수정/삭제44x44, 하단 액션80x44, 행 scrollWidth=clientWidth|
|실제 Calendar 6크기|PASS: 가로 넘침 없음; 모바일 Calendar 이벤트 보정 후 작은 버튼0개|
|Content Studio modal 6크기|PASS: 취소/저장 같은 y, 간격8px, dialog scrollWidth=clientWidth|
|모바일 주요5페이지 x4폭|PASS: Overview/Calendar/Projects/Journal/Library 가로 넘침 없음, 작은 버튼0개|
|PC 전체10페이지 이동|PASS: 페이지 전환 및 가로 넘침 없음|
|보조 모바일5페이지430px|PASS: Inbox/Automations/Content/Analytics/Settings, 가로 넘침·작은 버튼 없음|
|미저장 경고|PASS: 취소 -> 경고, Enter 계속 작성, 제목/300자 메모 유지, Space 취소 -> 경고|
|키보드 Tab|PASS: Context Resume primary focus-visible solid outline; 취소 동작|
|Calendar 상세 / Context Resume 진입|PASS: 상세 원문·기존 맥락 표시, 닫기/취소|
|실제 반복 규칙 저장·원장 수정|UNVERIFIED: 실제 반복 목록 없음; 실제 DB 쓰기 안 함|
|iOS/Android 실기기/가상 키보드/safe-area|UNVERIFIED|

측정 원문: outputs/COMPACT_RESPONSIVE_MEASUREMENTS.json, COMPACT_APP_CALENDAR_QA.json, COMPACT_MOBILE_PAGES_QA.json, COMPACT_MODAL_QA.json. initialCalendar에는 수정 전 발견치를 남겼으며 finalMobileCalendar가 최종 결과다. 문서에서 초기 실패를 최종 PASS로 숨기지 않는다.

합성 반복 일정은 work의 임시 서버/HTML에서 실제 RecurringScheduleRow SSR 및 실제 editorial/compact CSS로 렌더링했다. DB/API와 연결하지 않으며 클릭 callback 저장 검증으로 간주하지 않는다. 실제 앱 데이터는 기존 QA 기록 읽기만 수행했다.

상태·색상·줄바꿈은 브라우저 screenshot 확인. 클릭 영역은 DOM rect 실측. 노치 safe-area는 CSS 유지/검토이며 실기기 보장은 아님. 인접 그룹 간 gap8px, hit영역은 native box 밖으로 확장하지 않는다.
