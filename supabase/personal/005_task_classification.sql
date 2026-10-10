-- PERSONAL 001~004 적용 후 검토·실행. 기존 업무는 미분류로 유지.
begin;
alter table public.tasks add column work_kind text not null default 'unclassified'
  check(work_kind in ('unclassified','planned','unexpected'));
-- 기존 owner RLS, FK, 타이머 기록을 유지한다. 기존 업무를 돌발/계획으로 추정하지 않는다.
commit;
