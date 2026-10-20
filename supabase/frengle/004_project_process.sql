-- FRENGLE project tlclbraledbncndhemsr ONLY. Requires FRENGLE SQL001~003.
-- Adds project classification and managed process tasks without rewriting,
-- adopting or deleting existing tasks, notes, timers or completion history.
-- All RPCs/triggers remain SECURITY INVOKER and retain the existing owner RLS.
begin;

do $$ begin
 if to_regclass('public.ops_projects') is null
    or to_regclass('public.tasks') is null
    or to_regprocedure('public.ops_valid_process_steps(jsonb)') is null
    or to_regprocedure('public.ops_task_completion_stamp()') is null
    or to_regprocedure('public.ops_company_member()') is null then
  raise exception 'Apply FRENGLE SQL001~003 before SQL004';
 end if;
end $$;

alter table public.ops_projects add column if not exists project_category text not null default 'other';
alter table public.tasks
 add column if not exists project_step_id text,
 add column if not exists project_step_order integer,
 add column if not exists project_step_archived_at timestamptz;
do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='public.ops_projects'::regclass and conname='ops_projects_category_check') then
  alter table public.ops_projects add constraint ops_projects_category_check
   check(project_category in ('content','development','operations','other'));
 end if;
 if not exists(select 1 from pg_constraint where conrelid='public.tasks'::regclass and conname='tasks_project_step_shape') then
  alter table public.tasks add constraint tasks_project_step_shape check(
   (project_step_id is null and project_step_order is null and project_step_archived_at is null)
   or (project_step_id is not null and project_id is not null
       and length(project_step_id)<=80 and length(btrim(project_step_id)) between 1 and 80
       and project_step_order is not null and project_step_order between 0 and 29));
 end if;
end $$;
create unique index if not exists tasks_owner_project_step on public.tasks(owner_id,project_id,project_step_id);
create index if not exists tasks_project_process_queue on public.tasks(owner_id,project_id,project_step_order)
 where project_step_id is not null and project_step_archived_at is null and status<>'completed';

-- Extend only these new column privileges; do not widen existing table grants.
grant select(project_category),insert(project_category),update(project_category) on public.ops_projects to authenticated;
grant select(project_step_id,project_step_order,project_step_archived_at),
 insert(project_step_id,project_step_order,project_step_archived_at),
 update(project_step_id,project_step_order,project_step_archived_at) on public.tasks to authenticated;

-- Acquire the same owner lock as timer/save RPCs BEFORE taking row locks.
-- This also serializes ordinary task PATCH and direct authenticated session
-- writes. A row trigger taking this lock would invert timer's lock order.
-- Administrative migrations without an auth.uid() do not acquire this lock.
create or replace function public.ops_project_owner_lock() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is not null then
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 end if;
 return null;
end $$;
do $$ declare target text;begin
 foreach target in array array['tasks','ops_projects','ops_work_sessions','ops_session_intervals'] loop
  execute format('drop trigger if exists project_owner_lock on public.%I',target);
  execute format('create trigger project_owner_lock before insert or update or delete on public.%I for each statement execute function public.ops_project_owner_lock()',target);
 end loop;
end $$;

create or replace function public.ops_project_step_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if TG_OP='DELETE' then
  if old.project_step_id is not null then raise exception 'Project step cannot be deleted';end if;
  return old;
 end if;
 if TG_OP='UPDATE' and old.project_step_id is not null
    and (new.project_id is distinct from old.project_id or new.project_step_id is distinct from old.project_step_id) then
  raise exception 'Project step binding cannot be changed';
 end if;
 if new.project_step_id is not null and (new.project_step_archived_at is not null or new.status='completed')
    and exists(select 1 from public.ops_work_sessions s
       where s.owner_id=new.owner_id and s.task_id=new.id
         and (s.status='ACTIVE' or exists(select 1 from public.ops_session_intervals i
               where i.owner_id=s.owner_id and i.session_id=s.id and i.ends_at is null))) then
  raise exception 'Project step has an active timer';
 end if;
 return new;
end $$;
drop trigger if exists project_step_guard on public.tasks;
create trigger project_step_guard before insert or update or delete on public.tasks
 for each row execute function public.ops_project_step_guard();

-- A checklist change made from Overview invalidates an older project editor.
create or replace function public.ops_project_step_touch() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.project_step_id is not null and (TG_OP='INSERT' or
    row(new.title,new.status,new.project_step_order,new.project_step_archived_at)
      is distinct from row(old.title,old.status,old.project_step_order,old.project_step_archived_at)) then
  update public.ops_projects set updated_at=clock_timestamp() where owner_id=new.owner_id and id=new.project_id;
 end if;
 return new;
end $$;
drop trigger if exists project_step_touch on public.tasks;
create trigger project_step_touch after insert or update on public.tasks
 for each row execute function public.ops_project_step_touch();

create or replace function public.ops_project_completion_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.status='completed' and old.status<>'completed' and exists(select 1 from public.ops_work_sessions s join public.tasks t
      on t.owner_id=s.owner_id and t.id=s.task_id
      where t.owner_id=new.owner_id and t.project_id=new.id and t.project_step_id is not null
        and (s.status='ACTIVE' or exists(select 1 from public.ops_session_intervals i
              where i.owner_id=s.owner_id and i.session_id=s.id and i.ends_at is null))) then
  raise exception 'Project step has an active timer';
 end if;
 return new;
end $$;
drop trigger if exists project_completion_guard on public.ops_projects;
create trigger project_completion_guard before update on public.ops_projects
 for each row execute function public.ops_project_completion_guard();

-- Covers guarded and legacy timer RPCs, as well as direct session writes.
create or replace function public.ops_project_session_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.status='ACTIVE' and exists(select 1 from public.tasks t
      where t.owner_id=new.owner_id and t.id=new.task_id and t.project_step_id is not null
        and (t.project_step_archived_at is not null or t.status='completed')) then
  raise exception 'Archived or completed project step cannot start';
 end if;
 return new;
end $$;
drop trigger if exists project_session_guard on public.ops_work_sessions;
create trigger project_session_guard before insert or update on public.ops_work_sessions
 for each row execute function public.ops_project_session_guard();

create or replace function public.ops_project_interval_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.ends_at is null and exists(select 1 from public.ops_work_sessions s join public.tasks t
      on t.owner_id=s.owner_id and t.id=s.task_id
      where s.owner_id=new.owner_id and s.id=new.session_id and t.project_step_id is not null
        and (t.project_step_archived_at is not null or t.status='completed')) then
  raise exception 'Archived or completed project step cannot start';
 end if;
 return new;
end $$;
drop trigger if exists project_interval_guard on public.ops_session_intervals;
create trigger project_interval_guard before insert or update on public.ops_session_intervals
 for each row execute function public.ops_project_interval_guard();

create or replace function public.ops_project_save(
 p_id uuid,p_title text,p_description text,p_status text,p_category text,p_steps jsonb,
 p_expected_updated_at timestamptz default null) returns uuid
language plpgsql security invoker set search_path='' as $$
declare uid uuid=auth.uid();project uuid;step jsonb;step_position integer=0;current_task public.tasks;next_status text;
begin
 if not public.ops_company_member() then raise exception 'Company membership required';end if;
 if p_title is null or length(p_title)>120 or length(btrim(p_title))=0
    or p_description is null or length(p_description)>2000
    or p_status is null or p_status not in ('planning','active','completed')
    or p_category is null or p_category not in ('content','development','operations','other')
    or public.ops_valid_process_steps(p_steps) is distinct from true then
  raise exception 'Invalid project process input';
 end if;
 -- Same owner lock and lock order as timer/capture RPCs. A failed guard rolls
 -- back the project metadata and every step change together.
 perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
 if p_id is null then
  insert into public.ops_projects(owner_id,title,description,status,project_category)
   values(uid,btrim(p_title),p_description,p_status,p_category) returning id into project;
 else
  select id into project from public.ops_projects where owner_id=uid and id=p_id;
  if not found then raise exception 'Project not found';end if;
  -- Direct task updates touch the parent after locking their task row. Match
  -- that row order before locking the project to avoid a completion/save cycle.
  perform 1 from public.tasks where owner_id=uid and project_id=project and project_step_id is not null for update;
  select id into project from public.ops_projects where owner_id=uid and id=p_id for update;
  if not found then raise exception 'Project not found';end if;
  if p_expected_updated_at is not null and not exists(select 1 from public.ops_projects
      where owner_id=uid and id=project and updated_at=p_expected_updated_at) then
   raise exception 'Project changed since editing';
  end if;
  if p_status='completed' and exists(select 1 from public.ops_work_sessions s join public.tasks t
      on t.owner_id=s.owner_id and t.id=s.task_id
      where t.owner_id=uid and t.project_id=project and t.project_step_id is not null
        and (s.status='ACTIVE' or exists(select 1 from public.ops_session_intervals i
              where i.owner_id=uid and i.session_id=s.id and i.ends_at is null))) then
   raise exception 'Project step has an active timer';
  end if;
  update public.ops_projects set title=btrim(p_title),description=p_description,status=p_status,project_category=p_category
   where id=project and owner_id=uid
     and row(title,description,status,project_category) is distinct from row(btrim(p_title),p_description,p_status,p_category);
 end if;
 for step in select value from jsonb_array_elements(p_steps) loop
  select * into current_task from public.tasks where owner_id=uid and project_id=project and project_step_id=step->>'id' for update;
  if found then
   next_status=case when (step->>'done')::boolean then 'completed'
     when current_task.status='completed' then 'pending' else current_task.status end;
   update public.tasks set title=step->>'title',project_step_order=step_position,status=next_status,project_step_archived_at=null
    where owner_id=uid and id=current_task.id
      and row(title,project_step_order,status,project_step_archived_at) is distinct from row(step->>'title',step_position,next_status,null::timestamptz);
  else
   insert into public.tasks(owner_id,project_id,title,status,work_kind,project_step_id,project_step_order)
    values(uid,project,step->>'title',case when (step->>'done')::boolean then 'completed' else 'pending' end,'planned',step->>'id',step_position);
  end if;
  step_position=step_position+1;
 end loop;
 update public.tasks t set project_step_archived_at=clock_timestamp()
  where t.owner_id=uid and t.project_id=project and t.project_step_id is not null and t.project_step_archived_at is null
    and not exists(select 1 from jsonb_array_elements(p_steps) requested(value) where requested.value->>'id'=t.project_step_id);
 return project;
end $$;

create or replace function public.ops_project_process_ready() returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 if not public.ops_company_member() then raise exception 'Company membership required';end if;
 return true;
end $$;
revoke all on function public.ops_project_owner_lock(),public.ops_project_step_guard(),public.ops_project_step_touch(),public.ops_project_completion_guard(),public.ops_project_session_guard(),public.ops_project_interval_guard() from public,anon,authenticated;
revoke all on function public.ops_project_save(uuid,text,text,text,text,jsonb,timestamptz),public.ops_project_process_ready() from public,anon,authenticated;
grant execute on function public.ops_project_save(uuid,text,text,text,text,jsonb,timestamptz),public.ops_project_process_ready() to authenticated;
notify pgrst,'reload schema';
commit;
-- Metadata only. No projects, tasks or timer sessions are created by installation.
select to_regprocedure('public.ops_project_save(uuid,text,text,text,text,jsonb,timestamptz)') is not null as project_process_installed;
