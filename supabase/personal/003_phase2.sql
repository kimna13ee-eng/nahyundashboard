-- PERSONAL 001/002 적용 후 검토·실행. 기존 행 삭제/수정 없음. 한 번만 실행.
begin;
create table public.ops_content (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 title text not null check(length(btrim(title)) between 1 and 120),notes text not null default '' check(length(notes)<=2000),
 channel text not null default '' check(length(channel)<=80),stage text not null check(stage in ('idea','production','review','approval','published','results')),
 approval text not null check(approval in ('none','pending','approved')),publish_at timestamptz,result_url text not null default '',project_id uuid,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),foreign key(owner_id,project_id) references public.ops_projects(owner_id,id)
);
create table public.ops_inspiration (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 title text not null check(length(btrim(title)) between 1 and 120),notes text not null default '' check(length(notes)<=2000),url text not null default '',
 category text not null check(category in ('개발','디자인','이미지 콘텐츠','영상 콘텐츠','운영')),favorite boolean not null default false,inbox boolean not null default true,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table public.ops_leave_entries (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 title text not null check(length(btrim(title)) between 1 and 120),date date not null,kind text not null check(kind in ('grant','use','adjust')),
 amount numeric not null check(amount<>0 and abs(amount)<=365 and mod(amount,0.5)=0),
 check((kind='grant' and amount>0) or (kind='use' and amount<0) or kind='adjust'),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table public.ops_recurrence (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 title text not null check(length(btrim(title)) between 1 and 120),notes text not null default '' check(length(notes)<=2000),
 starts_at timestamptz not null,ends_at timestamptz not null check(ends_at>starts_at and ends_at<=starts_at+interval '31 days'),
 frequency text not null check(frequency in ('daily','weekly')),interval integer not null check(interval between 1 and 52),until_date date not null,
 check(until_date >= (starts_at at time zone 'Asia/Seoul')::date),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(owner_id,id)
);
create table public.ops_recurrence_exceptions (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 rule_id uuid not null,original_at timestamptz not null,cancelled boolean not null default false,title text not null check(length(btrim(title)) between 1 and 120),notes text not null default '' check(length(notes)<=2000),
 starts_at timestamptz not null,ends_at timestamptz not null check(ends_at>starts_at),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(owner_id,rule_id,original_at),
 foreign key(owner_id,rule_id) references public.ops_recurrence(owner_id,id) on delete cascade
);
do $$ declare t text;begin
 foreach t in array array['ops_content','ops_inspiration','ops_leave_entries','ops_recurrence','ops_recurrence_exceptions'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('alter table public.%I force row level security',t);
  execute format('revoke all on public.%I from anon, authenticated',t);
  execute format('grant select,insert,update,delete on public.%I to authenticated',t);
  execute format('create policy owner_access on public.%I for all to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id)',t);
  execute format('create index on public.%I(owner_id,created_at)',t);
  execute format('create trigger stamp before update on public.%I for each row execute function public.ops_stamp()',t);
 end loop;
end $$;
-- 모든 변경은 호출 사용자 소유 규칙을 잠근 뒤 원자적으로 처리.
create function public.ops_recurrence_change(p_rule uuid,p_original timestamptz,p_scope text,p_value jsonb,p_cancel boolean) returns void
language plpgsql security invoker set search_path='' as $$
declare r public.ops_recurrence;step_seconds bigint;offset_seconds numeric;cut date;
begin
 if p_original is null or p_scope is null or p_cancel is null then raise exception 'invalid request';end if;
 select * into r from public.ops_recurrence where id=p_rule and owner_id=auth.uid() for update;
 if not found then raise exception 'rule missing';end if;
 step_seconds:=r.interval*case when r.frequency='weekly' then 604800 else 86400 end;
 offset_seconds:=extract(epoch from p_original-r.starts_at);
 if offset_seconds<0 or mod(offset_seconds,step_seconds)<>0 or (p_original at time zone 'Asia/Seoul')::date>r.until_date then raise exception 'invalid occurrence';end if;
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
revoke all on function public.ops_recurrence_change(uuid,timestamptz,text,jsonb,boolean) from public,anon;
grant execute on function public.ops_recurrence_change(uuid,timestamptz,text,jsonb,boolean) to authenticated;
commit;
