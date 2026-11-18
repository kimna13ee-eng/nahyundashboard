begin;
create table if not exists public.ops_shooting_skills (
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id uuid not null,
  title text not null check (char_length(title) between 1 and 100 and title ~ '[^[:space:]]'),
  content text not null check (char_length(content) <= 10000 and content ~ '[^[:space:]]'),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  primary key (owner_id,id)
);
alter table public.ops_shooting_skills enable row level security;
alter table public.ops_shooting_skills force row level security;
revoke all on public.ops_shooting_skills from public,anon,authenticated;
grant select,delete on public.ops_shooting_skills to authenticated;
grant insert(id,title,content),update(title,content) on public.ops_shooting_skills to authenticated;
drop policy if exists shooting_skill_owner on public.ops_shooting_skills;
create policy shooting_skill_owner on public.ops_shooting_skills for all to authenticated
  using (owner_id=(select auth.uid())) with check (owner_id=(select auth.uid()));
create or replace function public.ops_stamp_shooting_skill() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  new.updated_at:=greatest(clock_timestamp(),old.updated_at+interval '1 microsecond');
  return new;
end $$;
revoke all on function public.ops_stamp_shooting_skill() from public,anon,authenticated;
drop trigger if exists stamp_shooting_skill on public.ops_shooting_skills;
create trigger stamp_shooting_skill before update on public.ops_shooting_skills
  for each row execute function public.ops_stamp_shooting_skill();
notify pgrst,'reload schema';
commit;
