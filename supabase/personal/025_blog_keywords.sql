-- PERSONAL only. Independent blog keywords; no changes to existing records or schedules.
begin;

create table if not exists public.ops_blog_keywords (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  keyword text not null check(length(keyword) between 1 and 200 and keyword=btrim(keyword,
    E' \t\n\r\f\u000b\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff')),
  used boolean not null default false,
  deleted_at timestamptz check(deleted_at is null or (used and isfinite(deleted_at))),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

alter table public.ops_blog_keywords enable row level security;
alter table public.ops_blog_keywords force row level security;
revoke all on public.ops_blog_keywords from public,anon,authenticated;
revoke all(id,owner_id,keyword,used,deleted_at,created_at,updated_at)
  on public.ops_blog_keywords from public,anon,authenticated;
grant select on public.ops_blog_keywords to authenticated;
grant insert(id,keyword) on public.ops_blog_keywords to authenticated;
grant update(used,deleted_at) on public.ops_blog_keywords to authenticated;

drop policy if exists blog_keyword_owner on public.ops_blog_keywords;
create policy blog_keyword_owner on public.ops_blog_keywords for all to authenticated
  using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));

create or replace function public.ops_blog_keyword_stamp()
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
revoke all on function public.ops_blog_keyword_stamp() from public,anon,authenticated;
drop trigger if exists blog_keyword_stamp on public.ops_blog_keywords;
create trigger blog_keyword_stamp before insert or update on public.ops_blog_keywords
  for each row execute function public.ops_blog_keyword_stamp();

create index if not exists ops_blog_keyword_active on public.ops_blog_keywords(owner_id,created_at desc,id desc)
  where deleted_at is null;

-- Lock and validate the entire batch before updating any row. Stale/missing/foreign
-- items reject the whole request; no partial deletion and no privileged RLS bypass.
create or replace function public.ops_blog_keywords_set_deleted(p_items jsonb,p_deleted boolean)
returns setof public.ops_blog_keywords language plpgsql security invoker set search_path='' as $$
declare
  v_owner uuid := auth.uid();
  v_count integer;
  v_locked integer := 0;
  v_row record;
  v_token timestamptz;
begin
  if v_owner is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_deleted is null or jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Invalid keyword selection' using errcode='22023';
  end if;
  v_count := jsonb_array_length(p_items);
  if v_count < 1 or v_count > 500 then raise exception 'Invalid batch size' using errcode='22023'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) e
    where jsonb_typeof(e) is distinct from 'object'
      or jsonb_typeof(e->'id') is distinct from 'string'
      or jsonb_typeof(e->'expectedUpdatedAt') is distinct from 'string'
      or (e-'id'-'expectedUpdatedAt') <> '{}'::jsonb
      or (e->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or (e->>'expectedUpdatedAt') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$'
  ) then raise exception 'Invalid keyword selection' using errcode='22023'; end if;
  if (select count(distinct (e->>'id')::uuid) from jsonb_array_elements(p_items) e) <> v_count then
    raise exception 'Duplicate keyword selection' using errcode='22023';
  end if;
  for v_row in
    select k.id,k.updated_at,k.used,k.deleted_at from public.ops_blog_keywords k
    where k.owner_id=v_owner and k.id in (select (e->>'id')::uuid from jsonb_array_elements(p_items) e)
    order by k.id for update
  loop
    select (e->>'expectedUpdatedAt')::timestamptz into v_token
      from jsonb_array_elements(p_items) e where (e->>'id')::uuid=v_row.id;
    if not isfinite(v_token) or v_row.updated_at <> v_token
      or (p_deleted and (not v_row.used or v_row.deleted_at is not null))
      or (not p_deleted and v_row.deleted_at is null) then
      raise exception 'Keyword selection changed' using errcode='40001';
    end if;
    v_locked := v_locked+1;
  end loop;
  if v_locked <> v_count then raise exception 'Keyword selection changed' using errcode='40001'; end if;
  return query update public.ops_blog_keywords k
    set deleted_at=case when p_deleted then clock_timestamp() else null end
    where k.owner_id=v_owner and k.id in (select (e->>'id')::uuid from jsonb_array_elements(p_items) e)
    returning k.*;
end $$;
revoke all on function public.ops_blog_keywords_set_deleted(jsonb,boolean) from public,anon,authenticated;
grant execute on function public.ops_blog_keywords_set_deleted(jsonb,boolean) to authenticated;

notify pgrst, 'reload schema';
commit;
select to_regclass('public.ops_blog_keywords') is not null as blog_keywords_installed;
