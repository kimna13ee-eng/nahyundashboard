-- 신규 PERSONAL 전용 Supabase 프로젝트에서만 적용. 회사 프로젝트에는 적용 금지.
begin;
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 120),
  notes text not null default '' check (length(notes) <= 2000),
  status text not null default 'pending' check (status in ('pending','running','completed','failed')),
  priority text not null default 'normal' check (priority in ('high','normal','low')),
  due_date date,
  created_at timestamptz not null default now()
);
create index tasks_owner_created on public.tasks(owner_id, created_at desc);
alter table public.tasks enable row level security;
alter table public.tasks force row level security;
revoke all on public.tasks from anon;
revoke all on public.tasks from authenticated;
grant select, insert, update, delete on public.tasks to authenticated;
create policy "personal_owner_select" on public.tasks for select to authenticated using ((select auth.uid()) = owner_id);
create policy "personal_owner_insert" on public.tasks for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "personal_owner_update" on public.tasks for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "personal_owner_delete" on public.tasks for delete to authenticated using ((select auth.uid()) = owner_id);
commit;
