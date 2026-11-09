-- PERSONAL only. Independent records; does not modify tasks, schedules or the separate diary.
begin;

create table if not exists public.ops_personal_records (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  body text not null check(length(body) between 1 and 6000 and body=btrim(body,
    E' \t\n\r\f\u000b\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff')),
  kind text not null check(kind in ('note','idea','todo')),
  entry_date date not null check(entry_date between date '0001-01-01' and date '9999-12-31'),
  done boolean not null default false check(not done or kind='todo'),
  archived_at timestamptz check(archived_at is null or isfinite(archived_at)),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

alter table public.ops_personal_records enable row level security;
alter table public.ops_personal_records force row level security;
revoke all on public.ops_personal_records from public,anon,authenticated;
revoke all(id,owner_id,body,kind,entry_date,done,archived_at,created_at,updated_at)
  on public.ops_personal_records from public,anon,authenticated;
grant select on public.ops_personal_records to authenticated;
grant insert(id,body,kind,entry_date,done) on public.ops_personal_records to authenticated;
grant update(body,kind,entry_date,done,archived_at) on public.ops_personal_records to authenticated;

drop policy if exists personal_record_owner on public.ops_personal_records;
create policy personal_record_owner on public.ops_personal_records for all to authenticated
  using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));

create or replace function public.ops_personal_record_stamp()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if TG_OP='INSERT' then
    new.created_at=clock_timestamp();
    new.updated_at=new.created_at;
  else
    new.updated_at=greatest(clock_timestamp(),old.updated_at+interval '1 microsecond');
  end if;
  return new;
end $$;
revoke all on function public.ops_personal_record_stamp() from public,anon,authenticated;
drop trigger if exists personal_record_stamp on public.ops_personal_records;
create trigger personal_record_stamp before insert or update on public.ops_personal_records
  for each row execute function public.ops_personal_record_stamp();

create index if not exists ops_personal_record_active on public.ops_personal_records(owner_id,entry_date desc,created_at desc,id desc)
  where archived_at is null;
create index if not exists ops_personal_record_archived on public.ops_personal_records(owner_id,archived_at desc,id desc)
  where archived_at is not null;

notify pgrst, 'reload schema';
commit;
select to_regclass('public.ops_personal_records') is not null as personal_records_installed;
