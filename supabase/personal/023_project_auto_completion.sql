-- PERSONAL project rimtvotfmtupguslpzts ONLY. Requires SQL020.
-- Finish projects when every unarchived managed step is completed. Existing
-- task completion timestamps, notes and timer history are never rewritten.
begin;

do $$ begin
 if to_regprocedure('public.ops_project_save(uuid,text,text,text,text,jsonb,timestamptz)') is null
    or to_regprocedure('public.ops_project_step_touch()') is null then
  raise exception 'Apply PERSONAL SQL020 before SQL023';
 end if;
end $$;

-- Match the task -> project row-lock order used by the existing save RPC.
lock table public.tasks,public.ops_projects in share row exclusive mode;
alter table public.ops_projects add column if not exists process_auto_completed boolean not null default false;
grant select(process_auto_completed),insert(process_auto_completed),update(process_auto_completed)
 on public.ops_projects to authenticated;

create or replace function public.ops_project_auto_completion() returns trigger
language plpgsql security invoker set search_path='' as $$
declare project_status text;was_automatic boolean;step_count bigint;done_count bigint;
begin
 -- The existing BEFORE STATEMENT owner lock serializes authenticated task,
 -- project and timer writes before row locks. Preserve owner RLS throughout.
 select status,process_auto_completed into project_status,was_automatic
  from public.ops_projects where owner_id=new.owner_id and id=new.id;
 if not found then return null;end if;
 select count(*),count(*) filter(where status='completed') into step_count,done_count
  from public.tasks where owner_id=new.owner_id and project_id=new.id
    and project_step_id is not null and project_step_archived_at is null;
 if step_count>0 and step_count=done_count then
  if project_status<>'completed' then
   update public.ops_projects set status='completed',process_auto_completed=true
    where owner_id=new.owner_id and id=new.id;
  end if;
 elsif was_automatic then
  -- Reopen only automatic completions. A manually completed project with
  -- unfinished steps retains the owner's explicit choice.
  update public.ops_projects
   set status=case when status='completed' then 'active' else status end,
       process_auto_completed=false
   where owner_id=new.owner_id and id=new.id;
 end if;
 return null;
end $$;
revoke all on function public.ops_project_auto_completion() from public,anon,authenticated;

-- Project-step writes already touch their parent via project_step_touch.
-- Defer until COMMIT so ops_project_save is evaluated after ALL inserts,
-- restores and archives, never against an intermediate checklist state.
-- The synchronizer updates only a changed status/marker, so its queued
-- follow-up event is a no-op rather than recursive updates.
drop trigger if exists project_auto_completion on public.ops_projects;
create constraint trigger project_auto_completion
 after insert or update on public.ops_projects deferrable initially deferred
 for each row execute function public.ops_project_auto_completion();

-- Repair existing 100% projects without touching task rows or completion dates.
update public.ops_projects p set status='completed',process_auto_completed=true
 where p.status<>'completed'
   and exists(select 1 from public.tasks t where t.owner_id=p.owner_id and t.project_id=p.id
     and t.project_step_id is not null and t.project_step_archived_at is null)
   and not exists(select 1 from public.tasks t where t.owner_id=p.owner_id and t.project_id=p.id
     and t.project_step_id is not null and t.project_step_archived_at is null and t.status<>'completed')
   -- Do not make installation fail or close a running timer if legacy data
   -- predates the project-step guards. Finish that timer before completing it.
   and not exists(select 1 from public.ops_work_sessions s join public.tasks t
     on t.owner_id=s.owner_id and t.id=s.task_id
     where t.owner_id=p.owner_id and t.project_id=p.id and t.project_step_id is not null
       and (s.status='ACTIVE' or exists(select 1 from public.ops_session_intervals i
         where i.owner_id=s.owner_id and i.session_id=s.id and i.ends_at is null)));

notify pgrst,'reload schema';
commit;
select exists(select 1 from pg_trigger where tgrelid='public.ops_projects'::regclass
 and tgname='project_auto_completion' and tgdeferrable and tginitdeferred) as project_auto_completion_installed;
