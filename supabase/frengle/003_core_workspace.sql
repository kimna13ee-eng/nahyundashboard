-- FRENGLE project tlclbraledbncndhemsr ONLY. Requires company 001 and 002.
-- Fresh company-owned core schema. No PERSONAL connections, rows or data copies.
-- Supported: projects/tasks, notes and versions, calendar/trash, work timers and
-- journal, library/version metadata, recurrence and workflow. No content, leave,
-- inspiration, personal sheets, exercise videos or push subscriptions are created.
-- No cron jobs are registered. All functions use SECURITY INVOKER.
begin;
do $$ begin
 if to_regclass('public.ops_company_members') is null or to_regclass('public.ops_automation_results') is null then
  raise exception 'Apply FRENGLE 001/002 before the company core migration';
 end if;
end $$;

create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;
set local search_path=public,extensions;
create or replace function public.ops_company_member() returns boolean
language sql stable security invoker set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.ops_company_members where user_id=(select auth.uid()));
$$;
revoke all on function public.ops_company_member() from public,anon;
grant execute on function public.ops_company_member() to authenticated;
create or replace function public.ops_valid_process_steps(p_steps jsonb)
returns boolean language plpgsql immutable security invoker set search_path='' as $$
declare
  step jsonb;
  step_ids text[] := array[]::text[];
  step_id text;
  step_title text;
begin
  if jsonb_typeof(p_steps) is distinct from 'array' then return false; end if;
  if jsonb_array_length(p_steps)>30 then return false; end if;
  for step in select value from jsonb_array_elements(p_steps) loop
    if jsonb_typeof(step) is distinct from 'object' then return false; end if;
    if not (step ?& array['id','title','done'])
       or (select count(*) from jsonb_object_keys(step))<>3 then return false; end if;
    if jsonb_typeof(step->'id') is distinct from 'string'
       or jsonb_typeof(step->'title') is distinct from 'string'
       or jsonb_typeof(step->'done') is distinct from 'boolean' then return false; end if;
    step_id := step->>'id';
    step_title := step->>'title';
    if length(step_id) not between 1 and 80 or length(btrim(step_id))=0
       or length(btrim(step_title)) not between 1 and 120
       or step_title<>btrim(step_title)
       or step_id=any(step_ids) then return false; end if;
    step_ids := array_append(step_ids,step_id);
  end loop;
  return true;
end $$;


create table if not exists public.ops_projects (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 title text not null check(length(btrim(title)) between 1 and 120), description text not null default '' check(length(description)<=2000),
 status text not null default 'planning' check(status in ('planning','active','completed')),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(owner_id,id)
);

create table if not exists public.tasks (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 title text not null check(length(btrim(title)) between 1 and 120),notes text not null default '' check(length(notes)<=2000),
 status text not null default 'pending' check(status in ('pending','running','completed','failed')),
 priority text not null default 'normal' check(priority in ('high','normal','low')),due_date date,project_id uuid,
 tool text not null default '' check(length(tool)<=80),assignee text not null default '' check(length(assignee)<=80),result_url text not null default '',
 estimated_minutes integer not null default 0 check(estimated_minutes between 0 and 100000),approval text not null default 'none' check(approval in ('none','pending','approved')),
 work_kind text not null default 'unclassified' check(work_kind in ('unclassified','planned','unexpected')),
 contact_status text not null default 'none' check(contact_status in ('none','planned','sent','waiting','materials','follow_up','answered','closed')),follow_up_at timestamptz,
 task_category text not null default 'other' check(task_category in ('content','sales','design','other')),
 process_steps jsonb not null default '[]' check(public.ops_valid_process_steps(process_steps)),is_test boolean,completed_at timestamptz,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(owner_id,id),
 foreign key(owner_id,project_id) references public.ops_projects(owner_id,id)
);

create table if not exists public.ops_task_notes (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 task_id uuid not null, body text not null check(length(btrim(body)) between 1 and 10000),
 kind text not null check(kind in ('general','issue','next_action')),pinned boolean not null default false,done boolean not null default false,
 converted_task_id uuid,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(owner_id,id),
 foreign key(owner_id,task_id) references public.tasks(owner_id,id) on delete cascade,
 foreign key(owner_id,converted_task_id) references public.tasks(owner_id,id)
);

create table if not exists public.ops_note_versions (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 note_id uuid not null,body text not null,kind text not null,pinned boolean not null,done boolean not null,created_at timestamptz not null default now(),
 foreign key(owner_id,note_id) references public.ops_task_notes(owner_id,id) on delete cascade
);

create table if not exists public.ops_schedules (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 title text not null check(length(btrim(title)) between 1 and 120),notes text not null default '' check(length(notes)<=2000),
 starts_at timestamptz not null,ends_at timestamptz not null check(ends_at>starts_at),timezone text not null default 'Asia/Seoul' check(timezone='Asia/Seoul'),
 project_id uuid,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(owner_id,project_id) references public.ops_projects(owner_id,id)
);

create table if not exists public.ops_work_sessions (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 task_id uuid not null,status text not null check(status in ('ACTIVE','PARKED','ENDED')),summary text not null default '' check(length(summary)<=10000),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),ended_at timestamptz,
 foreign key(owner_id,task_id) references public.tasks(owner_id,id),unique(owner_id,id)
);

create table if not exists public.ops_session_intervals (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 session_id uuid not null,starts_at timestamptz not null,ends_at timestamptz check(ends_at>=starts_at),
 created_at timestamptz not null default now(),foreign key(owner_id,session_id) references public.ops_work_sessions(owner_id,id),
 exclude using gist(owner_id with =,tstzrange(starts_at,ends_at,'[)') with &&)
);

create table if not exists public.ops_session_events (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 request_id uuid not null,session_id uuid not null,previous_session_id uuid,kind text not null check(kind in ('start','switch','resume','pause','finish')),
 created_at timestamptz not null default now(),unique(owner_id,request_id),
 foreign key(owner_id,session_id) references public.ops_work_sessions(owner_id,id),foreign key(owner_id,previous_session_id) references public.ops_work_sessions(owner_id,id)
);

create table if not exists public.ops_work_journal (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 session_id uuid not null,work_date date not null,summary text not null default '',created_at timestamptz not null default now(),
 unique(owner_id,session_id),foreign key(owner_id,session_id) references public.ops_work_sessions(owner_id,id)
);

create table if not exists public.ops_library_items (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 title text not null check(length(btrim(title)) between 1 and 120),kind text not null check(kind in ('prompt','skill')),
 category text not null check(category in ('개발','디자인','이미지 콘텐츠','영상 콘텐츠','운영')),body text not null default '' check(length(body)<=50000),
 url text not null default '',favorite boolean not null default false,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(owner_id,id)
);

create table if not exists public.ops_prompt_versions (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 item_id uuid not null,body text not null,title text not null,created_at timestamptz not null default now(),
 foreign key(owner_id,item_id) references public.ops_library_items(owner_id,id) on delete cascade
);

create table if not exists public.ops_recurrence (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 title text not null check(length(btrim(title)) between 1 and 120),notes text not null default '' check(length(notes)<=2000),
 starts_at timestamptz not null,ends_at timestamptz not null check(ends_at>starts_at and ends_at<=starts_at+interval '31 days'),
 frequency text not null check(frequency in ('daily','weekly','monthly','yearly')),interval integer not null check(interval between 1 and 52),until_date date not null,
 check(until_date >= (starts_at at time zone 'Asia/Seoul')::date),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(owner_id,id)
);

create table if not exists public.ops_recurrence_exceptions (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 rule_id uuid not null,original_at timestamptz not null,cancelled boolean not null default false,title text not null check(length(btrim(title)) between 1 and 120),notes text not null default '' check(length(notes)<=2000),
 starts_at timestamptz not null,ends_at timestamptz not null check(ends_at>starts_at),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(owner_id,rule_id,original_at),
 foreign key(owner_id,rule_id) references public.ops_recurrence(owner_id,id) on delete cascade
);

create table if not exists public.ops_inbox (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null default auth.uid() references auth.users(id),
 title text not null check(length(btrim(title)) between 1 and 120),notes text not null default '' check(length(notes)<=2000),source text not null default '' check(length(source)<=80),
 status text not null default 'inbox' check(status in ('inbox','converted','archived')),project_id uuid,schedule_at timestamptz,converted_task_id uuid,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(owner_id,id),
 foreign key(owner_id,project_id) references public.ops_projects(owner_id,id),foreign key(owner_id,converted_task_id) references public.tasks(owner_id,id)
);

create table if not exists public.ops_parked_context (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null default auth.uid() references auth.users(id),session_id uuid not null,
 payload jsonb not null check(jsonb_typeof(payload)='object'),created_at timestamptz not null default now(),
 foreign key(owner_id,session_id) references public.ops_work_sessions(owner_id,id)
);

create table if not exists public.ops_recurrence_runs (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null default auth.uid() references auth.users(id),rule_id uuid not null,original_at timestamptz not null,
 title text not null check(length(btrim(title)) between 1 and 120),status text not null check(status in ('scheduled','running','completed','unconfirmed','delayed','held')),
 notes text not null default '' check(length(notes)<=2000),confirmed_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(owner_id,rule_id,original_at),
 foreign key(owner_id,rule_id) references public.ops_recurrence(owner_id,id)
);

-- Final compatible core columns; no user row classification or backfill.
alter table public.ops_recurrence add column if not exists is_test boolean,add column if not exists archived_at timestamptz;
alter table public.ops_inbox add column if not exists is_test boolean;
alter table public.ops_schedules add column if not exists deleted_at timestamptz,add column if not exists purge_after timestamptz;
alter table public.ops_library_items add column if not exists tool text not null default '' check(length(tool)<=80),add column if not exists project_id uuid,
 add column if not exists change_reason text not null default '' check(length(change_reason)<=2000),add column if not exists status text not null default 'active' check(status in ('active','archived')),add column if not exists approved_version_id uuid;
alter table public.ops_prompt_versions add column if not exists metadata jsonb;
do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='public.ops_prompt_versions'::regclass and conname='ops_prompt_owner_item_unique') then
  alter table public.ops_prompt_versions add constraint ops_prompt_owner_item_unique unique(owner_id,item_id,id);
 end if;
 if not exists(select 1 from pg_constraint where conrelid='public.ops_library_items'::regclass and conname='library_company_project') then
  alter table public.ops_library_items add constraint library_company_project foreign key(owner_id,project_id) references public.ops_projects(owner_id,id);
 end if;
 if not exists(select 1 from pg_constraint where conrelid='public.ops_library_items'::regclass and conname='library_approved_version') then
  alter table public.ops_library_items add constraint library_approved_version foreign key(owner_id,id,approved_version_id) references public.ops_prompt_versions(owner_id,item_id,id);
 end if;
 if not exists(select 1 from pg_constraint where conrelid='public.ops_schedules'::regclass and conname='ops_schedules_trash_window') then
  alter table public.ops_schedules add constraint ops_schedules_trash_window check((deleted_at is null and purge_after is null) or (deleted_at is not null and purge_after=deleted_at+interval '12 hours'));
 end if;
end $$;
create index if not exists tasks_owner_created on public.tasks(owner_id,created_at desc);
create index if not exists tasks_project on public.tasks(owner_id,project_id);
create index if not exists tasks_owner_completed on public.tasks(owner_id,completed_at desc) where status='completed';
create index if not exists ops_schedule_range on public.ops_schedules(owner_id,starts_at,ends_at);
create index if not exists ops_schedule_trash on public.ops_schedules(owner_id,purge_after) where deleted_at is not null;
create unique index if not exists ops_one_active on public.ops_work_sessions(owner_id) where status='ACTIVE';
create unique index if not exists ops_one_open_task on public.ops_work_sessions(owner_id,task_id) where status in ('ACTIVE','PARKED');
create unique index if not exists ops_one_open_interval on public.ops_session_intervals(owner_id) where ends_at is null;
create or replace function public.ops_stamp() returns trigger language plpgsql security invoker set search_path='' as $$
begin new.updated_at=now();return new;end $$;
create or replace function public.ops_version() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if TG_TABLE_NAME='ops_library_items' and new.kind='prompt' then
  if TG_OP='UPDATE' and row(new.body,new.title,new.tool,new.project_id,new.change_reason,new.status,new.approved_version_id) is not distinct from row(old.body,old.title,old.tool,old.project_id,old.change_reason,old.status,old.approved_version_id) then return new;end if;
  insert into public.ops_prompt_versions(owner_id,item_id,body,title,metadata) values(new.owner_id,new.id,new.body,new.title,jsonb_build_object('tool',new.tool,'project_id',new.project_id,'change_reason',new.change_reason,'status',new.status,'approved_version_id',new.approved_version_id));
 elsif TG_TABLE_NAME='ops_task_notes' then
  insert into public.ops_note_versions(owner_id,note_id,body,kind,pinned,done) values(new.owner_id,new.id,new.body,new.kind,new.pinned,new.done);
 end if;return new;
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
-- Ownership and current membership are required on every company core table.
-- Existing membership and automation tables/policies are deliberately untouched.
do $$ declare t text;begin
 foreach t in array array['tasks','ops_projects','ops_task_notes','ops_note_versions','ops_schedules','ops_work_sessions','ops_session_intervals','ops_session_events','ops_work_journal','ops_library_items','ops_prompt_versions','ops_recurrence','ops_recurrence_exceptions','ops_inbox','ops_parked_context','ops_recurrence_runs'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('alter table public.%I force row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select,insert,update,delete on public.%I to authenticated',t);
  execute format('drop policy if exists company_owner_guard on public.%I',t);
  execute format('create policy company_owner_guard on public.%I as restrictive for all to authenticated using (owner_id=(select auth.uid()) and (select public.ops_company_member())) with check (owner_id=(select auth.uid()) and (select public.ops_company_member()))',t);
  execute format('drop policy if exists company_owner_access on public.%I',t);
  execute format('create policy company_owner_access on public.%I for all to authenticated using (owner_id=(select auth.uid()) and (select public.ops_company_member())) with check (owner_id=(select auth.uid()) and (select public.ops_company_member()))',t);
  execute format('create index if not exists %I on public.%I(owner_id,created_at)',t||'_owner_created',t);
 end loop;
 foreach t in array array['tasks','ops_projects','ops_task_notes','ops_schedules','ops_work_sessions','ops_library_items','ops_recurrence','ops_recurrence_exceptions','ops_inbox','ops_recurrence_runs'] loop
  execute format('drop trigger if exists stamp on public.%I',t);
  execute format('create trigger stamp before update on public.%I for each row execute function public.ops_stamp()',t);
 end loop;
end $$;
revoke update,delete on public.ops_note_versions,public.ops_prompt_versions,public.ops_session_events,public.ops_work_journal,public.ops_parked_context from authenticated;
revoke delete on public.ops_work_sessions,public.ops_session_intervals,public.ops_inbox,public.ops_recurrence_runs,public.ops_schedules from authenticated;
drop trigger if exists task_completion_stamp on public.tasks;
create trigger task_completion_stamp before insert or update on public.tasks for each row execute function public.ops_task_completion_stamp();
drop trigger if exists library_version on public.ops_library_items;
create trigger library_version after insert or update on public.ops_library_items for each row execute function public.ops_version();
drop trigger if exists note_version on public.ops_task_notes;
create trigger note_version after insert or update on public.ops_task_notes for each row execute function public.ops_version();


create or replace function public.ops_recurrence_at(p_start timestamptz,p_frequency text,p_interval integer,p_index integer) returns timestamptz
language plpgsql immutable strict security invoker set search_path='' as $$
declare base timestamp;target timestamp;last_day integer;
begin
 if p_interval<1 or p_index<0 then raise exception 'invalid recurrence';end if;
 if p_frequency in ('daily','weekly') then return p_start+make_interval(secs=>p_index::double precision*p_interval*case when p_frequency='weekly' then 604800 else 86400 end);end if;
 if p_frequency not in ('monthly','yearly') then raise exception 'invalid frequency';end if;
 base:=p_start at time zone 'Asia/Seoul';
 target:=date_trunc('month',base)+make_interval(months=>p_index*p_interval*case when p_frequency='yearly' then 12 else 1 end);
 last_day:=extract(day from target+interval '1 month'-interval '1 day')::int;
 return (target+make_interval(days=>least(extract(day from base)::int,last_day)-1)+(base-base::date)) at time zone 'Asia/Seoul';
end $$;

create or replace function public.ops_recurrence_change(p_rule uuid,p_original timestamptz,p_scope text,p_value jsonb,p_cancel boolean) returns void
language plpgsql security invoker set search_path='' as $$
declare r public.ops_recurrence;step_seconds bigint;offset_seconds numeric;cut date;months integer;idx integer;
begin
 if not public.ops_company_member() then raise exception 'Company membership required';end if;
 if p_original is null or p_scope is null or p_cancel is null then raise exception 'invalid request';end if;
 select * into r from public.ops_recurrence where id=p_rule and owner_id=auth.uid() for update;
 if not found then raise exception 'rule missing';end if;
 step_seconds:=r.interval*case when r.frequency='weekly' then 604800 else 86400 end;
 offset_seconds:=extract(epoch from p_original-r.starts_at);
 if r.frequency in ('monthly','yearly') then
 months:=(extract(year from p_original at time zone 'Asia/Seoul')::int-extract(year from r.starts_at at time zone 'Asia/Seoul')::int)*12+extract(month from p_original at time zone 'Asia/Seoul')::int-extract(month from r.starts_at at time zone 'Asia/Seoul')::int;
 idx:=months/(r.interval*case when r.frequency='yearly' then 12 else 1 end);
 if months<0 or public.ops_recurrence_at(r.starts_at,r.frequency,r.interval,idx)<>p_original then raise exception 'invalid occurrence';end if;
 elsif offset_seconds<0 or mod(offset_seconds,step_seconds)<>0 then raise exception 'invalid occurrence';end if;
 if (p_original at time zone 'Asia/Seoul')::date>r.until_date then raise exception 'invalid occurrence';end if;
 if p_scope='one' then
  insert into public.ops_recurrence_exceptions(owner_id,rule_id,original_at,cancelled,title,notes,starts_at,ends_at)
  values(auth.uid(),r.id,p_original,p_cancel,coalesce(p_value->>'title',r.title),coalesce(p_value->>'notes',r.notes),coalesce((p_value->>'starts_at')::timestamptz,p_original),coalesce((p_value->>'ends_at')::timestamptz,p_original+(r.ends_at-r.starts_at)))
  on conflict(owner_id,rule_id,original_at) do update set cancelled=excluded.cancelled,title=excluded.title,notes=excluded.notes,starts_at=excluded.starts_at,ends_at=excluded.ends_at;
 elsif p_scope in ('future','all') then
  if p_scope='all' or p_original=r.starts_at then
   if p_cancel then delete from public.ops_recurrence where id=r.id and owner_id=auth.uid();
   else
    update public.ops_recurrence set title=p_value->>'title',notes=p_value->>'notes',starts_at=(p_value->>'starts_at')::timestamptz,ends_at=(p_value->>'ends_at')::timestamptz,frequency=p_value->>'frequency',interval=(p_value->>'interval')::int,until_date=(p_value->>'until_date')::date where id=r.id and owner_id=auth.uid();
    delete from public.ops_recurrence_exceptions where rule_id=r.id and owner_id=auth.uid();
   end if;
  else
   if not p_cancel and ((p_value->>'starts_at')::timestamptz at time zone 'Asia/Seoul')::date < (p_original at time zone 'Asia/Seoul')::date then raise exception 'future start before split';end if;
   cut:=(p_original at time zone 'Asia/Seoul')::date-1;
   update public.ops_recurrence set until_date=cut where id=r.id and owner_id=auth.uid();
   delete from public.ops_recurrence_exceptions where rule_id=r.id and owner_id=auth.uid() and original_at>=p_original;
   if not p_cancel then
    insert into public.ops_recurrence(owner_id,title,notes,starts_at,ends_at,frequency,interval,until_date)
    values(auth.uid(),p_value->>'title',p_value->>'notes',(p_value->>'starts_at')::timestamptz,(p_value->>'ends_at')::timestamptz,p_value->>'frequency',(p_value->>'interval')::int,(p_value->>'until_date')::date);
   end if;
  end if;
 else raise exception 'invalid scope';end if;
end $$;

create or replace function public.ops_snapshot_park() returns trigger language plpgsql security invoker set search_path='' as $$
declare t public.tasks;override jsonb;note text;issues jsonb;nexts jsonb;stamp timestamptz;
begin
 if old.status='ACTIVE' and new.status='PARKED' then
  select * into t from public.tasks where owner_id=new.owner_id and id=new.task_id;
  override:=coalesce(nullif(current_setting('myops.park_context',true),'')::jsonb,'{}');
  select body into note from public.ops_task_notes where owner_id=new.owner_id and task_id=new.task_id order by updated_at desc,created_at desc limit 1;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'body',body)),'[]') into issues from public.ops_task_notes where owner_id=new.owner_id and task_id=new.task_id and kind='issue' and not done;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'body',body)),'[]') into nexts from public.ops_task_notes where owner_id=new.owner_id and task_id=new.task_id and kind='next_action' and not done;
  select max(ends_at) into stamp from public.ops_session_intervals where owner_id=new.owner_id and session_id=new.id;
  insert into public.ops_parked_context(owner_id,session_id,payload) values(new.owner_id,new.id,jsonb_build_object(
   'last_stage',coalesce(override->>'last_stage',''),'last_note',coalesce(note,t.notes,''),'issues',issues,'next_actions',nexts,
   'next_action',coalesce(override->>'next_action',''),'last_file',coalesce(override->>'last_file',''),'result_url',t.result_url,
   'tool',t.tool,'paused_at',coalesce(stamp,clock_timestamp()),'reason',coalesce(override->>'reason','')));
 end if;return new;
end $$;

drop trigger if exists snapshot_park on public.ops_work_sessions;
create trigger snapshot_park after update of status on public.ops_work_sessions for each row execute function public.ops_snapshot_park();


create or replace function public.ops_note_to_task(p_note_id uuid) returns uuid language plpgsql security invoker set search_path='' as $$
declare n public.ops_task_notes;created uuid;project uuid;begin
 if not public.ops_company_member() then raise exception 'Company membership required';end if;
 select * into n from public.ops_task_notes where id=p_note_id and owner_id=auth.uid() for update;
 if n.id is null or n.kind<>'next_action' then raise exception 'Next action not found';end if;
 if n.converted_task_id is not null then return n.converted_task_id;end if;
 select project_id into project from public.tasks where id=n.task_id and owner_id=auth.uid();
 insert into public.tasks(owner_id,title,notes,project_id) values(auth.uid(),left(n.body,120),left(n.body,2000),project) returning id into created;
 update public.ops_task_notes set done=true,converted_task_id=created where id=n.id and owner_id=auth.uid();return created;
end $$;

-- A single guarded entrypoint; legacy unbound timer RPCs are not created.
create or replace function public.ops_timer_guarded(
 p_command text,p_task_id uuid,p_request_id uuid,p_expected_session_id uuid,
 p_summary text default '',p_context jsonb default '{}') returns uuid
language plpgsql security invoker set search_path='' as $$
declare uid uuid=auth.uid();active_row public.ops_work_sessions;target public.ops_work_sessions;
 stamp timestamptz;event_kind text;previous uuid;
begin
 if not public.ops_company_member() then raise exception 'Company membership required';end if;
 if p_request_id is null or p_command is null or p_command not in ('start','pause','finish')
  or p_summary is null or length(p_summary)>10000 then raise exception 'Invalid timer command';end if;
 if p_context is null or jsonb_typeof(p_context)<>'object' or octet_length(p_context::text)>16000 then raise exception 'invalid context';end if;
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
 select * into active_row from public.ops_work_sessions where owner_id=uid and status='ACTIVE' for update;
 if p_command='start' then
  if not exists(select 1 from public.tasks where id=p_task_id and owner_id=uid) then raise exception 'Task not found';end if;
  if active_row.task_id=p_task_id then return active_row.id;end if;
  perform set_config('myops.park_context',p_context::text,true);
  if active_row.id is not null then
   update public.ops_session_intervals set ends_at=clock_timestamp() where owner_id=uid and session_id=active_row.id and ends_at is null;
   update public.ops_work_sessions set status='PARKED' where owner_id=uid and id=active_row.id;
  end if;
  select * into target from public.ops_work_sessions where owner_id=uid and task_id=p_task_id and status='PARKED' for update;
  stamp=clock_timestamp();
  if target.id is null then
   insert into public.ops_work_sessions(owner_id,task_id,status) values(uid,p_task_id,'ACTIVE') returning * into target;
   event_kind='start';
  else
   update public.ops_work_sessions set status='ACTIVE' where id=target.id and owner_id=uid;
   event_kind='resume';
  end if;
  if active_row.id is not null then event_kind='switch';end if;
  insert into public.ops_session_intervals(owner_id,session_id,starts_at) values(uid,target.id,stamp);
 else
  if active_row.id is null or active_row.id<>p_expected_session_id then raise exception 'Active session changed';end if;
  stamp=clock_timestamp();
  perform set_config('myops.park_context',p_context::text,true);
  update public.ops_session_intervals set ends_at=stamp where owner_id=uid and session_id=active_row.id and ends_at is null;
  update public.ops_work_sessions set status=case when p_command='pause' then 'PARKED' else 'ENDED' end,
   ended_at=case when p_command='finish' then stamp else null end,summary=case when p_command='finish' then p_summary else summary end
   where id=active_row.id and owner_id=uid;
  if p_command='finish' then
   insert into public.ops_work_journal(owner_id,session_id,work_date,summary)
    values(uid,active_row.id,(stamp at time zone 'Asia/Seoul')::date,p_summary);
  end if;
  target=active_row;event_kind=p_command;
 end if;
 perform set_config('myops.park_context','',true);
 insert into public.ops_session_events(owner_id,request_id,session_id,previous_session_id,kind)
  values(uid,p_request_id,target.id,active_row.id,event_kind);
 return target.id;
end $$;

create or replace function public.ops_timer_guard_ready() returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 if not public.ops_company_member() then raise exception 'Company membership required';end if;
 return true;
end $$;

-- INVOKER cannot elevate column privileges. Instead, every update (including
-- direct authenticated writes) is constrained by the same immutable 12h window.
-- A client may trash/restore its own row but cannot forge or extend the deadline.
create or replace function public.ops_company_schedule_trash_stamp() returns trigger
language plpgsql security invoker set search_path='' as $$
declare stamp timestamptz;
begin
 if TG_OP='INSERT' then
  new.deleted_at=null;new.purge_after=null;
 elsif old.deleted_at is null then
  if new.deleted_at is null then new.purge_after=null;
  else stamp=clock_timestamp();new.deleted_at=stamp;new.purge_after=stamp+interval '12 hours';end if;
 elsif new.deleted_at is null then
  if old.purge_after<=clock_timestamp() then raise exception 'Schedule recovery window expired';end if;
  new.purge_after=null;
 else
  new.deleted_at=old.deleted_at;new.purge_after=old.purge_after;
 end if;
 return new;
end $$;
drop trigger if exists company_schedule_trash_stamp on public.ops_schedules;
create trigger company_schedule_trash_stamp before insert or update on public.ops_schedules
 for each row execute function public.ops_company_schedule_trash_stamp();

create or replace function public.ops_schedule_soft_delete(p_schedule_id uuid) returns text
language plpgsql security invoker set search_path='' as $$
declare target public.ops_schedules;uid uuid=auth.uid();
begin
 if not public.ops_company_member() then raise exception 'Company membership required';end if;
 if p_schedule_id is null then return 'not_found';end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text||':'||p_schedule_id::text,0));
 select * into target from public.ops_schedules where id=p_schedule_id and owner_id=uid for update;
 if not found then return 'not_found';end if;
 if target.deleted_at is not null then return 'already_deleted';end if;
 update public.ops_schedules set deleted_at=clock_timestamp() where id=p_schedule_id and owner_id=uid;
 return 'deleted';
end $$;

create or replace function public.ops_schedule_restore(p_schedule_id uuid) returns text
language plpgsql security invoker set search_path='' as $$
declare target public.ops_schedules;uid uuid=auth.uid();
begin
 if not public.ops_company_member() then raise exception 'Company membership required';end if;
 if p_schedule_id is null then return 'not_found';end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text||':'||p_schedule_id::text,0));
 select * into target from public.ops_schedules where id=p_schedule_id and owner_id=uid for update;
 if not found then return 'not_found';end if;
 if target.deleted_at is null then return 'already_active';end if;
 if target.purge_after<=clock_timestamp() then return 'expired';end if;
 update public.ops_schedules set deleted_at=null,purge_after=null where id=p_schedule_id and owner_id=uid;
 return 'restored';
end $$;

create or replace function public.ops_capture(p_id uuid,p_mode text,p_value jsonb,p_context jsonb default '{}') returns uuid
language plpgsql security invoker set search_path='' as $$
declare item public.ops_inbox;task uuid;planned timestamptz;
begin
 if not public.ops_company_member() then raise exception 'Company membership required';end if;
 if p_id is null or p_mode is null or p_mode not in ('inbox','task','now','schedule','archive') then raise exception 'invalid capture';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 select * into item from public.ops_inbox where owner_id=auth.uid() and id=p_id for update;
 if not found then
  if p_mode='archive' then raise exception 'inbox missing';end if;
  insert into public.ops_inbox(id,owner_id,title,notes,source,project_id,schedule_at)
  values(p_id,auth.uid(),p_value->>'title',coalesce(p_value->>'notes',''),coalesce(p_value->>'source',''),nullif(p_value->>'project_id','')::uuid,nullif(p_value->>'schedule_at','')::timestamptz) returning * into item;
 end if;
 if p_mode='archive' then update public.ops_inbox set status='archived' where id=item.id and owner_id=auth.uid();return item.id;end if;
 if item.status='converted' then return item.converted_task_id;end if;
 if p_mode='inbox' then return item.id;end if;
 if item.status='archived' then raise exception 'archived capture';end if;
 planned:=coalesce(nullif(p_value->>'schedule_at','')::timestamptz,item.schedule_at);
 if p_mode='schedule' and planned is null then raise exception 'schedule required';end if;
 insert into public.tasks(owner_id,title,notes,project_id,work_kind,due_date)
 values(auth.uid(),item.title,item.notes,coalesce(nullif(p_value->>'project_id','')::uuid,item.project_id),'unexpected',case when p_mode='schedule' then (planned at time zone 'Asia/Seoul')::date else null end) returning id into task;
 if p_mode='schedule' then
  insert into public.ops_schedules(owner_id,title,notes,project_id,starts_at,ends_at) values(auth.uid(),item.title,item.notes,coalesce(nullif(p_value->>'project_id','')::uuid,item.project_id),planned,planned+interval '30 minutes');
 end if;
 update public.ops_inbox set status='converted',converted_task_id=task,schedule_at=planned where id=item.id and owner_id=auth.uid();
 if p_mode='now' then perform public.ops_timer_guarded('start',task,p_id,null,'',p_context);end if;
 return task;
end $$;

-- Every executable application entrypoint is explicitly scoped; no PUBLIC grants.
revoke all on function public.ops_stamp(),public.ops_version(),public.ops_task_completion_stamp(),public.ops_snapshot_park(),public.ops_company_schedule_trash_stamp() from public,anon,authenticated;
revoke all on function public.ops_valid_process_steps(jsonb),public.ops_recurrence_at(timestamptz,text,integer,integer),public.ops_recurrence_change(uuid,timestamptz,text,jsonb,boolean),public.ops_note_to_task(uuid),public.ops_timer_guarded(text,uuid,uuid,uuid,text,jsonb),public.ops_timer_guard_ready(),public.ops_capture(uuid,text,jsonb,jsonb),public.ops_schedule_soft_delete(uuid),public.ops_schedule_restore(uuid) from public,anon,authenticated;
grant execute on function public.ops_valid_process_steps(jsonb),public.ops_recurrence_at(timestamptz,text,integer,integer),public.ops_recurrence_change(uuid,timestamptz,text,jsonb,boolean),public.ops_note_to_task(uuid),public.ops_timer_guarded(text,uuid,uuid,uuid,text,jsonb),public.ops_timer_guard_ready(),public.ops_capture(uuid,text,jsonb,jsonb),public.ops_schedule_soft_delete(uuid),public.ops_schedule_restore(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
-- Metadata only. This migration never starts a timer or copies any data.
select to_regclass('public.tasks') is not null as company_core_installed,
       to_regprocedure('public.ops_timer_guarded(text,uuid,uuid,uuid,text,jsonb)') is not null as company_timer_installed;
