# Compact Box Button System

## 토큰 및 구조

Editorial 팔레트 유지: Canvas #F6F4F1 / Paper #FFFFFF / Ink #29272D / Lavender #9586B2 / Mist #E7E1ED.

공통 파일 src/app/compact.css를 editorial.css 뒤에 로드한다. .editorial 범위에만 적용하며 새 데이터 모델 없음.

|변형|클래스|용도|
|---|---|---|
|Secondary|기본 button / summary|흰색, 얇은 테두리, 6px radius|
|Primary|ops-primary|Lavender, 어두운 텍스트, 주요 실행|
|Subtle|ops-subtle|옅은 배경, 카드 보조 액션|
|Danger|ops-danger|차분한 적색 텍스트/테두리, 기존 확인 절차 유지|
|Icon|ops-icon|16px 아이콘, PC 32px / 모바일 44px 영역|
|Action link|ops-link-action|native anchor 유지, 박스+underline|

PC 기본 시각/클릭 높이 32px, padding 5px 10px, 그룹 gap 8px. 긴 정보가 포함된 업무/프로젝트 선택 버튼 및 Calendar 이벤트는 필요한 줄바꿈으로 높이가 커질 수 있다. 모든 콘텐츠 높이를 32px로 강제하지 않는다.

모바일 <=760px: native 버튼 자체 min 44x44, 배경/테두리는 inset 6px 0 pseudo-element로 기본 시각 높이 32px. pseudo-element는 pointer-events:none으로 클릭 영역을 늘리거나 옆 버튼과 겹치게 하지 않는다. Calendar 이벤트는 44px hit 영역, inset 4px 표면. 기존 하단 내비는 정보 표시를 유지하며 별도 inset 4px 사용.

## 상태·접근성

hover inset outline, focus-visible 2px outline, active brightness, disabled opacity/cursor, 기존 busy disable 유지. native button의 Enter/Space 및 Tab 순서 유지. 아이콘 aria-label은 기존 원문 보존. loading/success/error는 기존 알림과 guard에서 처리하며 새 실행 로직 없음.

OpsFormActions는 취소(type=button, data-dialog-close, disabled=busy) + 기존 submit을 감싼다. 기본 cancel/primary 우측 그룹. Quick Capture는 세 가지 업무 선택 액션이므로 기존 Inbox-first DOM 순서를 유지한다: Enter가 갑자기 지금 처리로 바뀌지 않게 한다. form submitter.value, onSubmit, guarded payload 변경 없음. 미저장 confirmation도 같은 action 그룹.

입력 control 높이 PC34px, modal label gap6px. textarea는 내용에 맞는 기존 높이. 모바일 반복 상태 select 44px/16px. 상태 배지는 비클릭이며 버튼 테두리와 구분.

## 재사용

RecurringScheduleRow는 title/frequency/interval/state/archived marker/기존 회차시간/notes/optional link를 표현한다. 상태 판정·원장 저장·편집/삭제는 Phase2Panel의 기존 callback을 사용한다. 새 다음 예정일 계산이나 실행 추정 없음.

## 품질 검토

관련 Next 설치 문서를 읽고 기존 client boundary를 유지했다. presentation 컴포넌트는 기존 client 부모에서 import한다. 새 effect/hook/network call 없음. 객체 props는 기존 데이터 읽기용. React 검토: semantic buttons, busy/disabled, 안정 key, native form submission, 외부 anchor rel, 긴 텍스트, aria names 유지.
