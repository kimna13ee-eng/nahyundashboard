begin;
create table if not exists public.ops_period_yoga (
 owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 id uuid not null,
 title text not null check(char_length(title) between 1 and 120 and title ~ '[^[:space:]]'),
 video_url text not null check(char_length(video_url) <= 2000 and video_url ~ '^https://'),
 duration_minutes integer check(duration_minutes between 1 and 1440),
 notes text not null default '' check(char_length(notes) <= 2000),
 created_at timestamptz not null default statement_timestamp(),
 updated_at timestamptz not null default statement_timestamp(),
 primary key(owner_id,id)
);
alter table public.ops_period_yoga enable row level security;
alter table public.ops_period_yoga force row level security;
revoke all on public.ops_period_yoga from public,anon,authenticated;
grant select,delete on public.ops_period_yoga to authenticated;
grant insert(id,title,video_url,duration_minutes,notes),update(title,video_url,duration_minutes,notes) on public.ops_period_yoga to authenticated;
drop policy if exists period_yoga_owner on public.ops_period_yoga;
create policy period_yoga_owner on public.ops_period_yoga for all to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create or replace function public.ops_stamp_period_yoga() returns trigger language plpgsql security invoker set search_path='' as $$
begin new.updated_at:=greatest(clock_timestamp(),old.updated_at+interval '1 microsecond'); return new; end $$;
revoke all on function public.ops_stamp_period_yoga() from public,anon,authenticated;
drop trigger if exists stamp_period_yoga on public.ops_period_yoga;
create trigger stamp_period_yoga before update on public.ops_period_yoga for each row execute function public.ops_stamp_period_yoga();
notify pgrst,'reload schema';
commit;
