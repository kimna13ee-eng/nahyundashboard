-- SQL010: user approved review/application/integration 2026-10-11.
-- Apply only to the existing PERSONAL project. Preview deployment is not approved.
-- No historical rows are classified or deleted. NULL means legacy/unknown.
begin;
alter table public.tasks add column if not exists is_test boolean;
alter table public.ops_content add column if not exists is_test boolean;
alter table public.ops_inbox add column if not exists is_test boolean;
alter table public.ops_recurrence add column if not exists is_test boolean;
alter table public.ops_recurrence add column if not exists archived_at timestamptz;
-- Archived recurrence rules retain all ops_recurrence_runs; restoration clears archived_at.
-- UI/API integration of these columns is a separate approved change.
-- Bind pause/finish to a particular session, protecting a new session of the same task.
create or replace function public.ops_timer_guarded(p_command text,p_task_id uuid,p_request_id uuid,
 p_expected_session_id uuid,p_summary text default '',p_context jsonb default '{}') returns uuid
language plpgsql security invoker set search_path='' as $$
declare uid uuid=auth.uid(); target public.ops_work_sessions; previous uuid;
begin
 if uid is null then raise exception 'Authentication required';end if;
 if p_request_id is null or p_command not in ('start','pause','finish') then raise exception 'Invalid timer command';end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
 select session_id into previous from public.ops_session_events where owner_id=uid and request_id=p_request_id;
 if found then return previous;end if;
 if p_command in ('pause','finish') then
  select * into target from public.ops_work_sessions where owner_id=uid and id=p_expected_session_id for update;
  if target.id is null or p_task_id is null or target.task_id<>p_task_id then raise exception 'Expected session required';end if;
  if p_command='finish' and target.status='ENDED' then return target.id;end if;
  if p_command='pause' and target.status='PARKED' then return target.id;end if;
  if target.status<>'ACTIVE' then raise exception 'Active session changed';end if;
 end if;
 return public.ops_timer_context(p_command,p_task_id,p_request_id,p_summary,p_context);
end $$;
revoke all on function public.ops_timer_guarded(text,uuid,uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.ops_timer_guarded(text,uuid,uuid,uuid,text,jsonb) to authenticated;
create or replace function public.ops_timer_guard_ready() returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 return true;
end $$;
revoke all on function public.ops_timer_guard_ready() from public,anon;
grant execute on function public.ops_timer_guard_ready() to authenticated;
notify pgrst, 'reload schema';
commit;
-- Read-only installation check (does not read or modify user data).
select to_regprocedure('public.ops_timer_guarded(text,uuid,uuid,uuid,text,jsonb)') is not null as timer_guard_installed,
       to_regprocedure('public.ops_timer_guard_ready()') is not null as capability_installed;
