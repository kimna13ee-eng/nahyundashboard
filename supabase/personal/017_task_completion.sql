-- PERSONAL only. Record completion transitions independently of later edits.
begin;
do $$
declare stamp_state "char";
begin
 if not exists (
  select 1 from information_schema.columns
  where table_schema='public' and table_name='tasks' and column_name='completed_at'
 ) then
  alter table public.tasks add column completed_at timestamptz;
  -- Legacy completions have no event timestamp; preserve their last-edit estimate.
  -- SQL002 normally stamps updated_at on every update. Backfilling a new field
  -- must not rewrite that history. DDL keeps writers locked until this commits.
  select tgenabled into stamp_state from pg_catalog.pg_trigger
    where tgrelid='public.tasks'::regclass and tgname='tasks_stamp' and not tgisinternal;
  if stamp_state is not null and stamp_state <> 'D' then
   alter table public.tasks disable trigger tasks_stamp;
  end if;
  update public.tasks set completed_at=updated_at where status='completed';
  if stamp_state='O' then
   alter table public.tasks enable trigger tasks_stamp;
  elsif stamp_state='A' then
   alter table public.tasks enable always trigger tasks_stamp;
  elsif stamp_state='R' then
   alter table public.tasks enable replica trigger tasks_stamp;
  end if;
 end if;
end $$;

create or replace function public.ops_task_completion_stamp()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.status <> 'completed' then
  new.completed_at := null;
 elsif TG_OP='INSERT' then
  new.completed_at := clock_timestamp();
 elsif old.status <> 'completed' then
  new.completed_at := clock_timestamp();
 else
  new.completed_at := old.completed_at;
 end if;
 return new;
end $$;
revoke all on function public.ops_task_completion_stamp() from public,anon;
grant execute on function public.ops_task_completion_stamp() to authenticated;
drop trigger if exists task_completion_stamp on public.tasks;
create trigger task_completion_stamp before insert or update on public.tasks
 for each row execute function public.ops_task_completion_stamp();
grant select(completed_at) on public.tasks to authenticated;
create index if not exists tasks_owner_completed on public.tasks(owner_id,completed_at desc)
 where status='completed';
notify pgrst, 'reload schema';
commit;
