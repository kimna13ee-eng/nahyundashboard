-- PERSONAL 001~006 이후 사용자 검토·승인 후 실행. 기존 데이터 삭제/초기화 없음.
begin;
alter table public.tasks add column follow_up_at timestamptz,
 add column contact_status text not null default 'none' check(contact_status in ('none','planned','sent','waiting','materials','follow_up','answered','closed'));
create table public.ops_inbox (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null default auth.uid() references auth.users(id),
 title text not null check(length(btrim(title)) between 1 and 120),notes text not null default '' check(length(notes)<=2000),source text not null default '' check(length(source)<=80),
 status text not null default 'inbox' check(status in ('inbox','converted','archived')),project_id uuid,schedule_at timestamptz,converted_task_id uuid,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(owner_id,id),
 foreign key(owner_id,project_id) references public.ops_projects(owner_id,id),foreign key(owner_id,converted_task_id) references public.tasks(owner_id,id)
);
create table public.ops_parked_context (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null default auth.uid() references auth.users(id),session_id uuid not null,
 payload jsonb not null check(jsonb_typeof(payload)='object'),created_at timestamptz not null default now(),
 foreign key(owner_id,session_id) references public.ops_work_sessions(owner_id,id)
);
create table public.ops_recurrence_runs (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null default auth.uid() references auth.users(id),rule_id uuid not null,original_at timestamptz not null,
 title text not null check(length(btrim(title)) between 1 and 120),status text not null check(status in ('scheduled','running','completed','unconfirmed','delayed','held')),
 notes text not null default '' check(length(notes)<=2000),confirmed_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(owner_id,rule_id,original_at),
 foreign key(owner_id,rule_id) references public.ops_recurrence(owner_id,id)
);
do $$ declare t text;begin
 foreach t in array array['ops_inbox','ops_parked_context','ops_recurrence_runs'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('alter table public.%I force row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant select,insert on public.%I to authenticated',t);
  execute format('create policy owner_access on public.%I for all to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id)',t);
  execute format('create index on public.%I(owner_id,created_at)',t);
 end loop;
end $$;
grant update on public.ops_inbox,public.ops_recurrence_runs to authenticated;
create trigger stamp before update on public.ops_inbox for each row execute function public.ops_stamp();
create trigger stamp before update on public.ops_recurrence_runs for each row execute function public.ops_stamp();

-- 모든 구버전 타이머 호출에도 중단 당시 맥락을 같은 트랜잭션에서 보존.
create function public.ops_snapshot_park() returns trigger language plpgsql security invoker set search_path='' as $$
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
create trigger snapshot_park after update of status on public.ops_work_sessions for each row execute function public.ops_snapshot_park();
create function public.ops_timer_context(p_command text,p_task_id uuid,p_request_id uuid,p_summary text,p_context jsonb default '{}') returns uuid
language plpgsql security invoker set search_path='' as $$
declare target uuid;
begin
 if p_context is null or jsonb_typeof(p_context)<>'object' or octet_length(p_context::text)>16000 then raise exception 'invalid context';end if;
 perform set_config('myops.park_context',p_context::text,true);
 target:=public.ops_timer(p_command,p_task_id,p_request_id,p_summary);
 perform set_config('myops.park_context','',true);return target;
end $$;
revoke all on function public.ops_timer_context(text,uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.ops_timer_context(text,uuid,uuid,text,jsonb) to authenticated;

-- Inbox 보관·예정·지금 처리는 같은 입구. 재시도 시 업무/일정 중복 생성 방지.
create function public.ops_capture(p_id uuid,p_mode text,p_value jsonb,p_context jsonb default '{}') returns uuid
language plpgsql security invoker set search_path='' as $$
declare item public.ops_inbox;task uuid;planned timestamptz;
begin
 if auth.uid() is null or p_id is null or p_mode not in ('inbox','task','now','schedule','archive') then raise exception 'invalid capture';end if;
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
 if p_mode='now' then perform public.ops_timer_context('start',task,p_id,'',p_context);end if;
 return task;
end $$;
revoke all on function public.ops_capture(uuid,text,jsonb,jsonb) from public,anon;
grant execute on function public.ops_capture(uuid,text,jsonb,jsonb) to authenticated;
commit;
