begin;

create table if not exists public.ops_makeup_tips (
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id uuid not null,
  content text not null default '' check (char_length(content) <= 1500),
  image bytea check (octet_length(image) between 1 and 1048576),
  thumbnail bytea check (octet_length(thumbnail) between 1 and 65536),
  has_photo boolean generated always as (image is not null) stored,
  deleted boolean not null default false,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  primary key(owner_id,id),
  check (image is not null or thumbnail is null),
  check (case when deleted then image is null and content = ''
         else image is not null or content ~ '[^[:space:]]' end)
);
create index if not exists ops_makeup_tips_recent on public.ops_makeup_tips
  (owner_id,created_at desc,id desc) where not deleted;

alter table public.ops_makeup_tips enable row level security;
alter table public.ops_makeup_tips force row level security;
revoke all on public.ops_makeup_tips from public,anon,authenticated;
grant select on public.ops_makeup_tips to authenticated;
grant insert (id,content,image,thumbnail), update (content,image,thumbnail,deleted)
  on public.ops_makeup_tips to authenticated;
drop policy if exists makeup_tip_owner on public.ops_makeup_tips;
create policy makeup_tip_owner on public.ops_makeup_tips for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create or replace function public.ops_stamp_makeup_tip()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  return new;
end $$;
revoke all on function public.ops_stamp_makeup_tip() from public,anon,authenticated;
drop trigger if exists stamp_makeup_tip on public.ops_makeup_tips;
create trigger stamp_makeup_tip before update on public.ops_makeup_tips
  for each row execute function public.ops_stamp_makeup_tip();

-- Repeating a failed response never creates a second entry or revives a deleted tip.
create or replace function public.ops_create_makeup_tip(
  p_id uuid, p_content text, p_image bytea, p_thumbnail bytea
) returns table (id uuid,content text,has_photo boolean,created_at timestamptz,updated_at timestamptz)
language plpgsql security invoker set search_path='' as $$
begin
  insert into public.ops_makeup_tips (id,content,image,thumbnail)
    values (p_id,p_content,p_image,p_thumbnail)
    on conflict on constraint ops_makeup_tips_pkey do nothing;
  return query select t.id,t.content,t.has_photo,t.created_at,t.updated_at from public.ops_makeup_tips t
    where t.owner_id=(select auth.uid()) and t.id=p_id and not t.deleted and t.content=p_content
      and t.image is not distinct from p_image and t.thumbnail is not distinct from p_thumbnail;
  if not found then raise exception 'Tip changed' using errcode='40001'; end if;
end $$;
revoke all on function public.ops_create_makeup_tip(uuid,text,bytea,bytea) from public,anon,authenticated;
grant execute on function public.ops_create_makeup_tip(uuid,text,bytea,bytea) to authenticated;
notify pgrst, 'reload schema';
commit;
