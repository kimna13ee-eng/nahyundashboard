-- PERSONAL only. Requires SQL002, SQL012 and SQL018. No Cron job is installed.
begin;

create table if not exists public.ops_push_subscriptions (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 endpoint text not null unique check(length(endpoint) between 1 and 4096 and endpoint ~
  '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|([A-Za-z0-9-]+\.)*push\.apple\.com|([A-Za-z0-9-]+\.)+notify\.windows\.com)/[^[:space:]@]+$'
  and endpoint !~ '[[:cntrl:]]'),
 keys jsonb not null check(
  jsonb_typeof(keys)='object' and keys ? 'p256dh' and keys ? 'auth'
  and jsonb_typeof(keys->'p256dh')='string' and jsonb_typeof(keys->'auth')='string'
  and (keys->>'p256dh') ~ '^[A-Za-z0-9_-]{87}=?$'
  and (keys->>'auth') ~ '^[A-Za-z0-9_-]{22}(==)?$'
  and keys-'p256dh'-'auth'='{}'::jsonb
 ),
 enabled boolean not null default true,
 last_test_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(owner_id,id)
);
alter table public.ops_push_subscriptions enable row level security;
alter table public.ops_push_subscriptions force row level security;
revoke all on public.ops_push_subscriptions from public,anon,authenticated;
revoke all(id,owner_id,endpoint,keys,enabled,last_test_at,created_at,updated_at)
 on public.ops_push_subscriptions from public,anon,authenticated;
grant select,delete on public.ops_push_subscriptions to authenticated;
grant insert(owner_id,endpoint,keys,enabled,last_test_at) on public.ops_push_subscriptions to authenticated;
-- last_test_at is an owner-device UX cooldown marker, not an auth boundary.
grant update(endpoint,keys,enabled,last_test_at) on public.ops_push_subscriptions to authenticated;
grant select,insert,update,delete on public.ops_push_subscriptions to service_role;
drop policy if exists owner_access on public.ops_push_subscriptions;
create policy owner_access on public.ops_push_subscriptions for all to authenticated
 using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
drop trigger if exists stamp on public.ops_push_subscriptions;
create trigger stamp before update on public.ops_push_subscriptions
 for each row execute function public.ops_stamp();

-- Composite references keep schedule, subscription, and recipient ownership
-- identical even for privileged dispatch writes. Existing schedules are kept.
create unique index if not exists ops_schedules_push_owner_id
 on public.ops_schedules(owner_id,id);
create table if not exists public.ops_exercise_push_deliveries (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null,
 schedule_id uuid not null,
 subscription_id uuid not null,
 exercise_day date not null,
 due_at timestamptz not null,
 state text not null default 'retry' check(state in ('claimed','retry','sent','failed')),
 attempts integer not null default 0 check(attempts between 0 and 3),
 claim_token uuid,
 lease_until timestamptz,
 next_attempt_at timestamptz,
 sent_at timestamptz,
 last_error text not null default '' check(length(last_error)<=500),
 last_status integer check(last_status between 100 and 599),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint ops_exercise_push_once unique(schedule_id,subscription_id,exercise_day),
 foreign key(owner_id,schedule_id) references public.ops_schedules(owner_id,id) on delete cascade,
 foreign key(owner_id,subscription_id) references public.ops_push_subscriptions(owner_id,id) on delete cascade,
 check((due_at at time zone 'Asia/Seoul')::date=exercise_day
   and (due_at at time zone 'Asia/Seoul')::time=time '21:00'),
 check((state='claimed')=(lease_until is not null)),
 check(state<>'claimed' or claim_token is not null),
 check((state='retry')=(next_attempt_at is not null)),
 check((state='sent')=(sent_at is not null))
);
alter table public.ops_exercise_push_deliveries enable row level security;
alter table public.ops_exercise_push_deliveries force row level security;
revoke all on public.ops_exercise_push_deliveries from public,anon,authenticated;
revoke all(id,owner_id,schedule_id,subscription_id,exercise_day,due_at,state,attempts,
 claim_token,lease_until,next_attempt_at,sent_at,last_error,last_status,created_at,updated_at)
 on public.ops_exercise_push_deliveries from public,anon,authenticated;
grant select,insert,update,delete on public.ops_exercise_push_deliveries to service_role;
grant select on public.ops_schedules to service_role;
create index if not exists ops_exercise_push_pending on public.ops_exercise_push_deliveries(due_at,next_attempt_at,lease_until)
 where state in ('claimed','retry');

create or replace function public.ops_claim_exercise_push(
 p_limit integer default 20,p_now timestamptz default null
)
returns table(
 delivery_id uuid,claim_token uuid,schedule_id uuid,subscription_id uuid,
 owner_id uuid,exercise_day date,due_at timestamptz,title text,video_url text,
 endpoint text,keys jsonb,attempts integer
)
language plpgsql security invoker set search_path='' as $$
declare
 stamp timestamptz=coalesce(p_now,clock_timestamp());
 today date;
 due timestamptz;
begin
 if p_limit is null or p_limit<1 or p_limit>50 then
  raise exception 'Dispatch limit must be between 1 and 50';
 end if;
 today=(stamp at time zone 'Asia/Seoul')::date;
 due=(today+time '21:00') at time zone 'Asia/Seoul';
 -- Expired jobs and lost final attempts become terminal without another send.
 update public.ops_exercise_push_deliveries d set
  state='failed',lease_until=null,next_attempt_at=null,updated_at=stamp,
  last_error=case when d.due_at+interval '30 minutes'<=stamp
   then 'delivery_window_expired' else 'retry_limit_reached' end
 where d.state in ('claimed','retry') and (
  d.due_at+interval '30 minutes'<=stamp or
  (d.state='claimed' and d.lease_until<=stamp and d.attempts>=3)
 );
 if stamp<due or stamp>=due+interval '30 minutes' then return;end if;

 insert into public.ops_exercise_push_deliveries
  (owner_id,schedule_id,subscription_id,exercise_day,due_at,next_attempt_at)
 select s.owner_id,s.id,b.id,today,due,due
 from public.ops_schedules s join public.ops_push_subscriptions b
  on b.owner_id=s.owner_id and b.enabled
 where s.category='exercise' and s.video_url<>'' and s.deleted_at is null
  and s.starts_at >= (today::timestamp at time zone 'Asia/Seoul')
  and s.starts_at < ((today+1)::timestamp at time zone 'Asia/Seoul')
  and not exists(select 1 from public.ops_exercise_push_deliveries d
   where d.schedule_id=s.id and d.subscription_id=b.id and d.exercise_day=today)
 order by s.id,b.id limit p_limit*4
 on conflict on constraint ops_exercise_push_once do nothing;

 return query
 with candidates as (
  select d.id from public.ops_exercise_push_deliveries d
  join public.ops_schedules s on s.id=d.schedule_id and s.owner_id=d.owner_id
  join public.ops_push_subscriptions b on b.id=d.subscription_id and b.owner_id=d.owner_id
  where d.exercise_day=today and d.due_at=due and d.attempts<3
   and b.enabled and s.category='exercise' and s.video_url<>'' and s.deleted_at is null
   and (s.starts_at at time zone 'Asia/Seoul')::date=today
   and ((d.state='retry' and d.next_attempt_at<=stamp) or
    (d.state='claimed' and d.lease_until<=stamp))
  order by d.due_at,d.id limit p_limit for update of d skip locked
 ),claimed as (
  update public.ops_exercise_push_deliveries d set state='claimed',
   attempts=d.attempts+1,claim_token=gen_random_uuid(),
   lease_until=stamp+interval '2 minutes',next_attempt_at=null,updated_at=stamp
  from candidates c where d.id=c.id returning d.*
 )
 select d.id,d.claim_token,d.schedule_id,d.subscription_id,d.owner_id,
  d.exercise_day,d.due_at,s.title,s.video_url,b.endpoint,b.keys,d.attempts
 from claimed d
 join public.ops_schedules s on s.id=d.schedule_id and s.owner_id=d.owner_id
 join public.ops_push_subscriptions b on b.id=d.subscription_id and b.owner_id=d.owner_id;
end $$;

create or replace function public.ops_complete_exercise_push(
 p_delivery_id uuid,p_claim_token uuid,p_outcome text,
 p_status integer default null,p_error text default '',p_now timestamptz default null
)
returns text language plpgsql security invoker set search_path='' as $$
declare
 stamp timestamptz=coalesce(p_now,clock_timestamp());
 target public.ops_exercise_push_deliveries;
 result text;
begin
 if p_outcome not in ('sent','retry','gone','failed') or p_outcome is null
  or (p_status is not null and (p_status<100 or p_status>599)) then
  raise exception 'Invalid delivery outcome';
 end if;
 select * into target from public.ops_exercise_push_deliveries d
  where d.id=p_delivery_id and d.claim_token=p_claim_token for update;
 if not found then return 'stale';end if;
 if target.state<>'claimed' then
  return case when target.state='failed' and target.last_status in (404,410)
   then 'gone' else target.state end;
 end if;
 if p_outcome='sent' then
  if p_status is not null and (p_status<200 or p_status>299) then
   raise exception 'Invalid success status';
  end if;
  result='sent';
 elsif p_outcome='gone' or p_status in (404,410) then
  update public.ops_push_subscriptions b set enabled=false
   where b.id=target.subscription_id and b.owner_id=target.owner_id;
  result='gone';
 elsif p_outcome='retry' and target.attempts<3 and stamp+interval '1 minute'<target.due_at+interval '30 minutes' then
  result='retry';
 else result='failed';
 end if;
 update public.ops_exercise_push_deliveries d set
  state=case when result='gone' then 'failed' else result end,
  lease_until=null,
  next_attempt_at=case when result='retry' then stamp+interval '1 minute' else null end,
  sent_at=case when result='sent' then stamp else null end,
  last_status=case when result='gone' then coalesce(p_status,410) else p_status end,
  last_error=case when result='sent' then '' else left(regexp_replace(coalesce(p_error,''),'[[:cntrl:]]','','g'),500) end,
  updated_at=stamp where d.id=target.id;
 return result;
end $$;

revoke all on function public.ops_claim_exercise_push(integer,timestamptz) from public,anon,authenticated;
revoke all on function public.ops_complete_exercise_push(uuid,uuid,text,integer,text,timestamptz) from public,anon,authenticated;
grant execute on function public.ops_claim_exercise_push(integer,timestamptz) to service_role;
grant execute on function public.ops_complete_exercise_push(uuid,uuid,text,integer,text,timestamptz) to service_role;

-- Read only scheduler metadata through a narrow boolean, never its command or
-- secrets. Cron is deliberately optional; SQL019 itself never enables a job.
create or replace function public.ops_exercise_push_scheduler_ready()
returns boolean language plpgsql security definer set search_path='' as $$
declare ready boolean;
begin
 if pg_catalog.to_regclass('cron.job') is null then return false;end if;
 execute 'select exists(select 1 from cron.job where jobname=$1 and active)'
  into ready using 'ops-exercise-push-2100';
 return coalesce(ready,false);
exception when undefined_table or invalid_schema_name or insufficient_privilege then
 return false;
end $$;
revoke all on function public.ops_exercise_push_scheduler_ready() from public,anon,authenticated;
grant execute on function public.ops_exercise_push_scheduler_ready() to service_role;
notify pgrst,'reload schema';
commit;

select to_regclass('public.ops_push_subscriptions') is not null as exercise_push_installed;
