-- SQL011: schedule trash and 12-hour recovery window.
-- Local/isolated validation first. Do not apply to Supabase or register Cron
-- without separate approval.
begin;

alter table public.ops_schedules
 add column if not exists deleted_at timestamptz,
 add column if not exists purge_after timestamptz;

do $$
begin
 if not exists (
  select 1 from pg_constraint
  where conrelid='public.ops_schedules'::regclass
    and conname='ops_schedules_trash_window'
 ) then
  alter table public.ops_schedules
   add constraint ops_schedules_trash_window check (
    (deleted_at is null and purge_after is null) or
    (deleted_at is not null and purge_after=deleted_at+interval '12 hours')
   );
 end if;
end $$;

create index if not exists ops_schedule_trash
 on public.ops_schedules(owner_id,purge_after)
 where deleted_at is not null;

-- Prevent authenticated clients from bypassing the recovery window.
revoke delete on public.ops_schedules from authenticated;
revoke update on public.ops_schedules from authenticated;
grant update(title,notes,starts_at,ends_at,timezone,project_id)
 on public.ops_schedules to authenticated;

create or replace function public.ops_schedule_soft_delete(p_schedule_id uuid)
returns text language plpgsql security definer set search_path='' as $$
declare uid uuid=auth.uid(); target public.ops_schedules; stamp timestamptz;
begin
 if uid is null then raise exception 'Authentication required';end if;
 if p_schedule_id is null then return 'not_found';end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text||':'||p_schedule_id::text,0));
 select * into target from public.ops_schedules
  where id=p_schedule_id and owner_id=uid for update;
 if target.id is null then return 'not_found';end if;
 if target.deleted_at is not null then return 'already_deleted';end if;
 stamp=clock_timestamp();
 update public.ops_schedules
  set deleted_at=stamp,purge_after=stamp+interval '12 hours'
  where id=p_schedule_id and owner_id=uid;
 return 'deleted';
end $$;

create or replace function public.ops_schedule_restore(p_schedule_id uuid)
returns text language plpgsql security definer set search_path='' as $$
declare uid uuid=auth.uid(); target public.ops_schedules; stamp timestamptz;
begin
 if uid is null then raise exception 'Authentication required';end if;
 if p_schedule_id is null then return 'not_found';end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text||':'||p_schedule_id::text,0));
 select * into target from public.ops_schedules
  where id=p_schedule_id and owner_id=uid for update;
 if target.id is null then return 'not_found';end if;
 if target.deleted_at is null then return 'already_active';end if;
 stamp=clock_timestamp();
 if target.purge_after<=stamp then return 'expired';end if;
 update public.ops_schedules set deleted_at=null,purge_after=null
  where id=p_schedule_id and owner_id=uid;
 return 'restored';
end $$;

create or replace function public.ops_purge_expired_schedules()
returns bigint language plpgsql security definer set search_path='' as $$
declare removed bigint;
begin
 delete from public.ops_schedules
  where deleted_at is not null and purge_after<=clock_timestamp();
 get diagnostics removed=row_count;
 return removed;
end $$;

revoke all on function public.ops_schedule_soft_delete(uuid) from public,anon;
revoke all on function public.ops_schedule_restore(uuid) from public,anon;
revoke all on function public.ops_purge_expired_schedules() from public,anon,authenticated;
grant execute on function public.ops_schedule_soft_delete(uuid) to authenticated;
grant execute on function public.ops_schedule_restore(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;

-- Read-only installation check. Cron registration is intentionally excluded.
select
 to_regprocedure('public.ops_schedule_soft_delete(uuid)') is not null as soft_delete_installed,
 to_regprocedure('public.ops_schedule_restore(uuid)') is not null as restore_installed,
 to_regprocedure('public.ops_purge_expired_schedules()') is not null as purge_installed;
