-- FRENGLE only. Requires company SQL003. No PERSONAL storage is created or read.
begin;

do $$ begin
  if to_regprocedure('public.ops_company_member()') is null then
    raise exception 'Apply FRENGLE SQL003 before overview memos';
  end if;
end $$;

create table if not exists public.ops_overview_memos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  -- Match String.trim() whitespace, including non-breaking and Unicode spaces.
  body text not null check(length(body) between 1 and 1000 and body=btrim(body,
    E' \t\n\r\f\u000b\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff')),
  done boolean not null default false,
  deleted_at timestamptz check(deleted_at is null or isfinite(deleted_at)),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

alter table public.ops_overview_memos enable row level security;
alter table public.ops_overview_memos force row level security;
revoke all on public.ops_overview_memos from public,anon,authenticated;
revoke all(id,owner_id,body,done,deleted_at,created_at,updated_at)
  on public.ops_overview_memos from public,anon,authenticated;
grant select on public.ops_overview_memos to authenticated;
grant insert(body) on public.ops_overview_memos to authenticated;
grant update(body,done,deleted_at) on public.ops_overview_memos to authenticated;

drop policy if exists overview_memo_owner on public.ops_overview_memos;
create policy overview_memo_owner on public.ops_overview_memos for all to authenticated
  using(owner_id=(select auth.uid()) and (select public.ops_company_member()))
  with check(owner_id=(select auth.uid()) and (select public.ops_company_member()));

create or replace function public.ops_overview_memo_stamp()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if TG_OP='INSERT' then
    new.created_at=clock_timestamp();
    new.updated_at=new.created_at;
  else
    -- A fresh token even for rapid consecutive writes within one transaction.
    new.updated_at=greatest(clock_timestamp(),old.updated_at+interval '1 microsecond');
  end if;
  return new;
end $$;
revoke all on function public.ops_overview_memo_stamp() from public,anon,authenticated;
drop trigger if exists overview_memo_stamp on public.ops_overview_memos;
create trigger overview_memo_stamp before insert or update on public.ops_overview_memos
  for each row execute function public.ops_overview_memo_stamp();

create index if not exists ops_overview_memo_active on public.ops_overview_memos(owner_id,created_at,id)
  where deleted_at is null;
create index if not exists ops_overview_memo_archived on public.ops_overview_memos(owner_id,deleted_at desc,id desc)
  where deleted_at is not null;

notify pgrst, 'reload schema';
commit;

select to_regclass('public.ops_overview_memos') is not null as overview_memos_installed;
