-- PERSONAL 전용. 001_tasks.sql 적용 후 실행. 기존 행 삭제/변경 없음.
-- 실제 적용 전 사용자 승인 및 기존 스키마 확인 필요.
begin;
create extension if not exists btree_gist with schema extensions;
set local search_path = public, extensions;
create table public.ops_projects (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 title text not null check(length(btrim(title)) between 1 and 120), description text not null default '' check(length(description)<=2000),
 status text not null default 'planning' check(status in ('planning','active','completed')),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(owner_id,id)
);
alter table public.tasks add column project_id uuid, add column tool text not null default '', add column assignee text not null default '',
 add column result_url text not null default '',add column estimated_minutes integer not null default 0 check(estimated_minutes between 0 and 100000),
 add column approval text not null default 'none' check(approval in ('none','pending','approved')),add column updated_at timestamptz not null default now(),
 add constraint tasks_owner_id_unique unique(owner_id,id),add constraint tasks_personal_project foreign key(owner_id,project_id) references public.ops_projects(owner_id,id);
create index tasks_project on public.tasks(owner_id,project_id);
create table public.ops_task_notes (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 task_id uuid not null, body text not null check(length(btrim(body)) between 1 and 10000),
 kind text not null check(kind in ('general','issue','next_action')),pinned boolean not null default false,done boolean not null default false,
 converted_task_id uuid,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(owner_id,id),
 foreign key(owner_id,task_id) references public.tasks(owner_id,id) on delete cascade,
 foreign key(owner_id,converted_task_id) references public.tasks(owner_id,id)
);
create table public.ops_note_versions (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 note_id uuid not null,body text not null,kind text not null,pinned boolean not null,done boolean not null,created_at timestamptz not null default now(),
 foreign key(owner_id,note_id) references public.ops_task_notes(owner_id,id) on delete cascade
);
create table public.ops_schedules (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 title text not null check(length(btrim(title)) between 1 and 120),notes text not null default '' check(length(notes)<=2000),
 starts_at timestamptz not null,ends_at timestamptz not null check(ends_at>starts_at),timezone text not null default 'Asia/Seoul' check(timezone='Asia/Seoul'),
 project_id uuid,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(owner_id,project_id) references public.ops_projects(owner_id,id)
);
create index ops_schedule_range on public.ops_schedules(owner_id,starts_at,ends_at);
create table public.ops_work_sessions (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 task_id uuid not null,status text not null check(status in ('ACTIVE','PARKED','ENDED')),summary text not null default '' check(length(summary)<=10000),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),ended_at timestamptz,
 foreign key(owner_id,task_id) references public.tasks(owner_id,id),unique(owner_id,id)
);
create unique index ops_one_active on public.ops_work_sessions(owner_id) where status='ACTIVE';
create unique index ops_one_open_task on public.ops_work_sessions(owner_id,task_id) where status in ('ACTIVE','PARKED');
create table public.ops_session_intervals (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 session_id uuid not null,starts_at timestamptz not null,ends_at timestamptz check(ends_at>=starts_at),
 created_at timestamptz not null default now(),foreign key(owner_id,session_id) references public.ops_work_sessions(owner_id,id),
 exclude using gist(owner_id with =,tstzrange(starts_at,ends_at,'[)') with &&)
);
create unique index ops_one_open_interval on public.ops_session_intervals(owner_id) where ends_at is null;
create table public.ops_session_events (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 request_id uuid not null,session_id uuid not null,previous_session_id uuid,kind text not null check(kind in ('start','switch','resume','pause','finish')),
 created_at timestamptz not null default now(),unique(owner_id,request_id),
 foreign key(owner_id,session_id) references public.ops_work_sessions(owner_id,id),foreign key(owner_id,previous_session_id) references public.ops_work_sessions(owner_id,id)
);
create table public.ops_work_journal (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 session_id uuid not null,work_date date not null,summary text not null default '',created_at timestamptz not null default now(),
 unique(owner_id,session_id),foreign key(owner_id,session_id) references public.ops_work_sessions(owner_id,id)
);
create table public.ops_library_items (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 title text not null check(length(btrim(title)) between 1 and 120),kind text not null check(kind in ('prompt','skill')),
 category text not null check(category in ('개발','디자인','이미지 콘텐츠','영상 콘텐츠','운영')),body text not null default '' check(length(body)<=50000),
 url text not null default '',favorite boolean not null default false,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(owner_id,id)
);
create table public.ops_prompt_versions (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 item_id uuid not null,body text not null,title text not null,created_at timestamptz not null default now(),
 foreign key(owner_id,item_id) references public.ops_library_items(owner_id,id) on delete cascade
);
create function public.ops_stamp() returns trigger language plpgsql set search_path='' as $$
begin new.updated_at=now();return new;end $$;
create function public.ops_version() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if TG_TABLE_NAME='ops_library_items' and new.kind='prompt' then
  insert into public.ops_prompt_versions(owner_id,item_id,body,title) values(new.owner_id,new.id,new.body,new.title);
 elsif TG_TABLE_NAME='ops_task_notes' then
  insert into public.ops_note_versions(owner_id,note_id,body,kind,pinned,done) values(new.owner_id,new.id,new.body,new.kind,new.pinned,new.done);
 end if;return new;
end $$;
do $$ declare t text;begin
 foreach t in array array['ops_projects','ops_task_notes','ops_schedules','ops_work_sessions','ops_library_items'] loop
  execute format('create trigger stamp before update on public.%I for each row execute function public.ops_stamp()',t);
 end loop;
 foreach t in array array['ops_projects','ops_task_notes','ops_note_versions','ops_schedules','ops_work_sessions','ops_session_intervals','ops_session_events','ops_work_journal','ops_library_items','ops_prompt_versions'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('alter table public.%I force row level security',t);
  execute format('revoke all on public.%I from anon, authenticated',t);
  execute format('grant select,insert,update,delete on public.%I to authenticated',t);
  execute format('create policy owner_access on public.%I for all to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id)',t);
  execute format('create index on public.%I(owner_id,created_at)',t);
 end loop;
end $$;
create trigger tasks_stamp before update on public.tasks for each row execute function public.ops_stamp();
create trigger library_version after insert or update on public.ops_library_items for each row execute function public.ops_version();
create trigger note_version after insert or update on public.ops_task_notes for each row execute function public.ops_version();

create function public.ops_timer(p_command text,p_task_id uuid,p_request_id uuid,p_summary text default '') returns uuid
language plpgsql security invoker set search_path='' as $$
declare uid uuid=auth.uid(); active_row public.ops_work_sessions;target public.ops_work_sessions; stamp timestamptz; event_kind text;
begin
 if uid is null then raise exception 'Authentication required';end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
 stamp=clock_timestamp();
 select s.* into target from public.ops_session_events e join public.ops_work_sessions s on s.id=e.session_id and s.owner_id=e.owner_id where e.owner_id=uid and e.request_id=p_request_id;
 if found then return target.id;end if;
 if p_command not in ('start','pause','finish') or p_request_id is null or length(p_summary)>10000 then raise exception 'Invalid timer command';end if;
 select * into active_row from public.ops_work_sessions where owner_id=uid and status='ACTIVE' for update;
 if p_command='start' then
  if not exists(select 1 from public.tasks where id=p_task_id and owner_id=uid) then raise exception 'Task not found';end if;
  if active_row.task_id=p_task_id then return active_row.id;end if;
  if active_row.id is not null then
   update public.ops_session_intervals set ends_at=stamp where owner_id=uid and session_id=active_row.id and ends_at is null;
   update public.ops_work_sessions set status='PARKED' where owner_id=uid and id=active_row.id;
  end if;
  select * into target from public.ops_work_sessions where owner_id=uid and task_id=p_task_id and status='PARKED' for update;
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
  if active_row.id is null then raise exception 'No active session';end if;
  if p_task_id is not null and active_row.task_id<>p_task_id then raise exception 'Active session changed';end if;
  update public.ops_session_intervals set ends_at=stamp where owner_id=uid and session_id=active_row.id and ends_at is null;
  update public.ops_work_sessions set status=case when p_command='pause' then 'PARKED' else 'ENDED' end,
   ended_at=case when p_command='finish' then stamp else null end,summary=case when p_command='finish' then p_summary else summary end
   where id=active_row.id and owner_id=uid;
  if p_command='finish' then
   insert into public.ops_work_journal(owner_id,session_id,work_date,summary) values(uid,active_row.id,(stamp at time zone 'Asia/Seoul')::date,p_summary);
  end if;target=active_row;event_kind=p_command;
 end if;
 insert into public.ops_session_events(owner_id,request_id,session_id,previous_session_id,kind) values(uid,p_request_id,target.id,active_row.id,event_kind);
 return target.id;
end $$;
revoke all on function public.ops_timer(text,uuid,uuid,text) from public,anon;
grant execute on function public.ops_timer(text,uuid,uuid,text) to authenticated;

create function public.ops_note_to_task(p_note_id uuid) returns uuid language plpgsql security invoker set search_path='' as $$
declare n public.ops_task_notes;created uuid;project uuid;begin
 select * into n from public.ops_task_notes where id=p_note_id and owner_id=auth.uid() for update;
 if n.id is null or n.kind<>'next_action' then raise exception 'Next action not found';end if;
 if n.converted_task_id is not null then return n.converted_task_id;end if;
 select project_id into project from public.tasks where id=n.task_id and owner_id=auth.uid();
 insert into public.tasks(owner_id,title,notes,project_id) values(auth.uid(),left(n.body,120),left(n.body,2000),project) returning id into created;
 update public.ops_task_notes set done=true,converted_task_id=created where id=n.id and owner_id=auth.uid();return created;
end $$;
revoke all on function public.ops_note_to_task(uuid) from public,anon;
grant execute on function public.ops_note_to_task(uuid) to authenticated;
commit;
