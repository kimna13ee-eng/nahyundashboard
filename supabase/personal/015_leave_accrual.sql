-- PERSONAL 전용. 기존 002/003 적용 후 실행. 회사 FRENGLE DB에는 적용하지 않는다.
-- 입사일 기준 자동 계산용 설정만 추가한다. 기존 연차 원장은 유지한다.
begin;
create table if not exists public.ops_leave_settings (
  owner_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  hire_date date not null check(hire_date between date '1900-01-01' and date '9998-12-31'),
  prior_used numeric not null default 0 check(prior_used >= 0 and prior_used <= 365 and mod(prior_used,0.5)=0),
  prior_used_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(prior_used_date is null or (prior_used > 0 and prior_used_date >= hire_date and prior_used_date <= date '9999-12-31'))
);
alter table public.ops_leave_settings enable row level security;
alter table public.ops_leave_settings force row level security;
revoke all on public.ops_leave_settings from public,anon,authenticated;
grant select,insert,update,delete on public.ops_leave_settings to authenticated;
drop policy if exists owner_access on public.ops_leave_settings;
create policy owner_access on public.ops_leave_settings for all to authenticated
  using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
drop trigger if exists stamp on public.ops_leave_settings;
create trigger stamp before update on public.ops_leave_settings
  for each row execute function public.ops_stamp();
notify pgrst,'reload schema';
commit;

select to_regclass('public.ops_leave_settings') is not null as leave_settings_installed;
