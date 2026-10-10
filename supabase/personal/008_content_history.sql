-- PERSONAL 006 이후 사용자 검토·승인 후 실행. 기존 행 변경/삭제 없음.
begin;
alter table public.ops_content add constraint ops_content_owner_unique unique(owner_id,id);
create table public.ops_content_versions (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null default auth.uid() references auth.users(id),content_id uuid not null,
 version integer not null check(version>0),snapshot jsonb not null check(jsonb_typeof(snapshot)='object'),created_at timestamptz not null default now(),
 unique(owner_id,content_id,version),foreign key(owner_id,content_id) references public.ops_content(owner_id,id) on delete cascade
);
alter table public.ops_content_versions enable row level security;
alter table public.ops_content_versions force row level security;
revoke all on public.ops_content_versions from anon,authenticated;
grant select,insert on public.ops_content_versions to authenticated;
create policy owner_access on public.ops_content_versions for all to authenticated using((select auth.uid())=owner_id) with check((select auth.uid())=owner_id);
create index on public.ops_content_versions(owner_id,created_at);
create function public.ops_content_version() returns trigger language plpgsql security invoker set search_path='' as $$
declare v integer;
begin
 if new.stage in ('published','results') and (new.approval='pending' or new.personal_details->>'review' in ('pending','revision')) then raise exception 'review pending';end if;
 if TG_OP='UPDATE' and row(new.title,new.notes,new.stage,new.approval,new.publish_at,new.result_url,new.personal_details) is not distinct from row(old.title,old.notes,old.stage,old.approval,old.publish_at,old.result_url,old.personal_details) then return new;end if;
 select coalesce(max(version),0)+1 into v from public.ops_content_versions where owner_id=new.owner_id and content_id=new.id;
 if TG_OP='UPDATE' and v=1 then
  insert into public.ops_content_versions(owner_id,content_id,version,snapshot) values(old.owner_id,old.id,1,jsonb_build_object('title',old.title,'notes',old.notes,'stage',old.stage,'approval',old.approval,'publish_at',old.publish_at,'result_url',old.result_url,'personal_details',old.personal_details));v:=2;
 end if;
 insert into public.ops_content_versions(owner_id,content_id,version,snapshot) values(new.owner_id,new.id,v,jsonb_build_object('title',new.title,'notes',new.notes,'stage',new.stage,'approval',new.approval,'publish_at',new.publish_at,'result_url',new.result_url,'personal_details',new.personal_details));return new;
end $$;
create trigger content_version after insert or update on public.ops_content for each row execute function public.ops_content_version();
create table public.ops_content_tasks (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null default auth.uid() references auth.users(id),content_id uuid not null,task_id uuid not null,
 step text not null check(step in ('idea','planning','shooting','editing','review','revision','scheduled','published','results')),created_at timestamptz not null default now(),unique(owner_id,content_id,step),
 foreign key(owner_id,content_id) references public.ops_content(owner_id,id) on delete cascade,foreign key(owner_id,task_id) references public.tasks(owner_id,id)
);
alter table public.ops_content_tasks enable row level security;
alter table public.ops_content_tasks force row level security;
revoke all on public.ops_content_tasks from anon,authenticated;
grant select,insert on public.ops_content_tasks to authenticated;
create policy owner_access on public.ops_content_tasks for all to authenticated using((select auth.uid())=owner_id) with check((select auth.uid())=owner_id);
create function public.ops_content_task(p_content uuid,p_step text) returns uuid language plpgsql security invoker set search_path='' as $$
declare c public.ops_content;t uuid;
begin
 if auth.uid() is null or p_step not in ('idea','planning','shooting','editing','review','revision','scheduled','published','results') then raise exception 'invalid step';end if;
 select * into c from public.ops_content where id=p_content and owner_id=auth.uid() for update;
 if not found then raise exception 'content missing';end if;
 select task_id into t from public.ops_content_tasks where owner_id=auth.uid() and content_id=c.id and step=p_step;
 if found then return t;end if;
 insert into public.tasks(owner_id,title,notes,project_id,work_kind) values(auth.uid(),left(c.title||' · '||p_step,120),left(c.notes,2000),c.project_id,'planned') returning id into t;
 insert into public.ops_content_tasks(owner_id,content_id,task_id,step) values(auth.uid(),c.id,t,p_step);return t;
end $$;
revoke all on function public.ops_content_task(uuid,text) from public,anon;
grant execute on function public.ops_content_task(uuid,text) to authenticated;
commit;
