-- PERSONAL 전용. 사용자별 읽기 전용 콘텐츠 시트 연결 설정.
-- 원본 시트 ID는 관리자 SQL로 해당 소유자에게만 연결한다.
begin;
create table if not exists public.ops_personal_sheet_sources (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  spreadsheet_id text not null check(spreadsheet_id ~ '^[A-Za-z0-9_-]{20,200}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.ops_personal_sheet_sources enable row level security;
alter table public.ops_personal_sheet_sources force row level security;
revoke all on public.ops_personal_sheet_sources from public,anon,authenticated;
grant select on public.ops_personal_sheet_sources to authenticated;
drop policy if exists owner_select on public.ops_personal_sheet_sources;
create policy owner_select on public.ops_personal_sheet_sources for select to authenticated
  using ((select auth.uid())=owner_id);
drop trigger if exists stamp on public.ops_personal_sheet_sources;
create trigger stamp before update on public.ops_personal_sheet_sources
  for each row execute function public.ops_stamp();
notify pgrst,'reload schema';
commit;

select to_regclass('public.ops_personal_sheet_sources') is not null as personal_sheet_sources_installed;
