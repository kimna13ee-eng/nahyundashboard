-- PERSONAL 003 적용 후 실행. 기존 데이터와 RLS 보존.
begin;
alter table public.ops_recurrence drop constraint ops_recurrence_frequency_check;
alter table public.ops_recurrence add constraint ops_recurrence_frequency_check check(frequency in ('daily','weekly','monthly','yearly'));
create function public.ops_recurrence_at(p_start timestamptz,p_frequency text,p_interval integer,p_index integer) returns timestamptz
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
revoke all on function public.ops_recurrence_at(timestamptz,text,integer,integer) from public,anon;
grant execute on function public.ops_recurrence_at(timestamptz,text,integer,integer) to authenticated;
create or replace function public.ops_recurrence_change(p_rule uuid,p_original timestamptz,p_scope text,p_value jsonb,p_cancel boolean) returns void
language plpgsql security invoker set search_path='' as $$
declare r public.ops_recurrence;step_seconds bigint;offset_seconds numeric;cut date;months integer;idx integer;
begin
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
revoke all on function public.ops_recurrence_change(uuid,timestamptz,text,jsonb,boolean) from public,anon;
grant execute on function public.ops_recurrence_change(uuid,timestamptz,text,jsonb,boolean) to authenticated;
commit;
