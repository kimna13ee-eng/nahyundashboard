-- MANUAL PERSONAL SETUP ONLY. Do not run as an application migration.
-- Requires SQL019, pg_cron, pg_net and Supabase Vault. No real secrets belong
-- in this file or in Git. The installed job is INACTIVE until separately enabled.
--
-- 1. In Supabase Dashboard, enable pg_cron and pg_net if absent.
-- 2. In Vault, create these two named secrets through the Dashboard:
--    ops_exercise_push_app_url: the HTTPS dashboard origin, without trailing '/'
--    ops_exercise_push_dispatch_secret: same random value as Render's dispatch
--    signing secret. Do not store the Supabase administrator key in this job.
-- 3. Verify Render has PERSONAL_SUPABASE_SECRET_KEY, the PERSONAL_PUSH_VAPID_*
--    public/private pair and PERSONAL_PUSH_DISPATCH_SECRET configured,
--    and finish a real device's manual test push before activation.
-- 4. Confirm the scheduler timezone is GMT/UTC, then run this setup SQL once.
--    Re-running this file pauses an existing job with this name.

begin;
-- Best-effort hardening. Some hosted pg_net objects are owned/granted by
-- supabase_admin, which postgres cannot revoke. Keep net outside exposed API
-- schemas. The queued headers below contain a 5-minute signature, never the
-- original Vault signing secret, even when hosted ACLs cannot be changed.
revoke all on schema net from public,anon,authenticated;
revoke all on all tables in schema net from public,anon,authenticated;
revoke all on all sequences in schema net from public,anon,authenticated;
revoke all on all functions in schema net from public,anon,authenticated;
do $$
declare job bigint; zone text;
begin
 zone=coalesce(current_setting('cron.timezone',true),'GMT');
 if zone not in ('GMT','UTC','Etc/UTC') then
  raise exception 'Cron timezone must be verified as UTC/GMT before this setup';
 end if;
 if not exists(select 1 from vault.decrypted_secrets where name='ops_exercise_push_app_url')
  or not exists(select 1 from vault.decrypted_secrets where name='ops_exercise_push_dispatch_secret') then
  raise exception 'Create the two exercise push Vault settings first';
 end if;
 job=cron.schedule(
  'ops-exercise-push-2100',
  '0-29 12 * * *', -- 21:00-21:29 Asia/Seoul; DB claim logic prevents duplicates.
  $command$
   with request_stamp as (select floor(extract(epoch from clock_timestamp()))::bigint::text as value)
   select net.http_post(
    url:=(select decrypted_secret from vault.decrypted_secrets where name='ops_exercise_push_app_url')||'/api/internal/exercise-push',
    headers:=jsonb_build_object(
     'Content-Type','application/json',
     'x-ops-push-timestamp',request_stamp.value,
     'x-ops-push-signature',encode(extensions.hmac('exercise-push:'||request_stamp.value,
       (select decrypted_secret from vault.decrypted_secrets where name='ops_exercise_push_dispatch_secret'),'sha256'),'hex')
    ),
    body:='{}'::jsonb,
    timeout_milliseconds:=120000
   ) from request_stamp;
  $command$
 );
 perform cron.alter_job(job,active:=false);
end $$;
commit;

select jobid,jobname,schedule,active from cron.job where jobname='ops-exercise-push-2100';

-- 5. Verify anon/authenticated cannot read vault.decrypted_secrets and net is
--    not an exposed Data API schema. Queued signatures expire in 5 minutes;
--    owner/day/device claim deduplication limits replay to existing due jobs.
-- 6. After the user is ready to enable scheduled sending, separately run:
-- select cron.alter_job(jobid,active:=true) from cron.job where jobname='ops-exercise-push-2100';
-- To stop sending again:
-- select cron.alter_job(jobid,active:=false) from cron.job where jobname='ops-exercise-push-2100';
-- Check net._http_response for HTTP status and delivery records for actual
-- push-service acceptance. A pg_net request ID alone does not prove a send.
