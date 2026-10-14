-- Operational setup, separate from SQL012. Requires explicit approval:
-- permanently deletes expired schedules for ALL owners every 5 minutes.
-- pg_cron must already be enabled. No immediate purge is invoked here.
begin;
do $$
begin
 if current_user <> 'postgres' then
  raise exception 'Run as postgres in the approved PERSONAL project';
 end if;
 if not exists (select 1 from pg_extension where extname='pg_cron') then
  raise exception 'Enable Supabase Cron first; no job was registered';
 end if;
 if to_regprocedure('public.ops_purge_expired_schedules()') is null then
  raise exception 'SQL012 purge function is not installed';
 end if;
end $$;
select cron.schedule(
 'ops-schedule-trash-purge',
 '*/5 * * * *',
 'select public.ops_purge_expired_schedules();'
);
commit;
select jobid,jobname,schedule,command,active,username,database
from cron.job where jobname='ops-schedule-trash-purge';

-- To stop future runs (does not restore already purged schedules):
-- select cron.unschedule('ops-schedule-trash-purge');
