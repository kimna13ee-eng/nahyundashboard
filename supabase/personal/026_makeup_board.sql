-- PERSONAL makeup photo archive. Weekly picks reference photos without copying the image.
begin;

create table if not exists public.ops_makeup_looks (
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id uuid not null,
  title text not null default '' check (char_length(title) <= 100),
  image bytea not null check (octet_length(image) between 1 and 1048576),
  thumbnail bytea check (octet_length(thumbnail) between 1 and 65536),
  created_at timestamptz not null default clock_timestamp(),
  primary key (owner_id, id)
);

create table if not exists public.ops_makeup_week_picks (
  owner_id uuid not null default auth.uid(),
  look_id uuid not null,
  week_start date not null check (isfinite(week_start) and extract(isodow from week_start) = 1),
  primary key (owner_id, week_start, look_id),
  foreign key (owner_id, look_id) references public.ops_makeup_looks(owner_id, id) on delete cascade
);

create index if not exists ops_makeup_looks_recent on public.ops_makeup_looks(owner_id, created_at desc, id desc);
create index if not exists ops_makeup_picks_by_look on public.ops_makeup_week_picks(owner_id, look_id);

alter table public.ops_makeup_looks enable row level security;
alter table public.ops_makeup_looks force row level security;
alter table public.ops_makeup_week_picks enable row level security;
alter table public.ops_makeup_week_picks force row level security;
revoke all on public.ops_makeup_looks, public.ops_makeup_week_picks from public, anon, authenticated;
grant select, delete on public.ops_makeup_looks, public.ops_makeup_week_picks to authenticated;
grant insert (id, title, image, thumbnail) on public.ops_makeup_looks to authenticated;
grant insert (look_id, week_start) on public.ops_makeup_week_picks to authenticated;
drop policy if exists makeup_photo_owner on public.ops_makeup_looks;
create policy makeup_photo_owner on public.ops_makeup_looks for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
drop policy if exists makeup_pick_owner on public.ops_makeup_week_picks;
create policy makeup_pick_owner on public.ops_makeup_week_picks for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- Create the image and optional first pick together. A retry after a lost response
-- can read the original row but cannot undo a subsequent change of week selection.
create or replace function public.ops_create_makeup_look(
  p_id uuid, p_title text, p_image bytea, p_thumbnail bytea, p_week date
) returns table(id uuid, title text, created_at timestamptz, picked boolean)
language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.ops_makeup_looks (id, title, image, thumbnail)
  values (p_id, p_title, p_image, p_thumbnail)
  on conflict on constraint ops_makeup_looks_pkey do nothing;
  if found then
    if p_week is not null then
      insert into public.ops_makeup_week_picks (look_id, week_start) values (p_id, p_week);
    end if;
  elsif not exists (
    select 1 from public.ops_makeup_looks l where l.owner_id = auth.uid() and l.id = p_id
      and l.title = p_title and l.image = p_image
  ) then
    raise exception 'Photo ID already used' using errcode = '23505';
  end if;
  return query select l.id, l.title, l.created_at, exists (
    select 1 from public.ops_makeup_week_picks w
    where w.owner_id = l.owner_id and w.look_id = l.id and w.week_start = p_week
  ) from public.ops_makeup_looks l where l.owner_id = auth.uid() and l.id = p_id;
end $$;

create or replace function public.ops_list_makeup_looks(
  p_week date, p_picked_only boolean, p_offset integer
) returns table(id uuid, title text, created_at timestamptz, picked boolean)
language sql stable security invoker set search_path = '' as $$
  select l.id, l.title, l.created_at, (w.look_id is not null)
  from public.ops_makeup_looks l
  left join public.ops_makeup_week_picks w
    on (w.owner_id, w.look_id, w.week_start) = (l.owner_id, l.id, p_week)
  where l.owner_id = (select auth.uid()) and (not p_picked_only or w.look_id is not null)
  order by l.created_at desc, l.id desc limit 41 offset p_offset
$$;

revoke all on function public.ops_create_makeup_look(uuid,text,bytea,bytea,date),
  public.ops_list_makeup_looks(date,boolean,integer) from public, anon, authenticated;
grant execute on function public.ops_create_makeup_look(uuid,text,bytea,bytea,date),
  public.ops_list_makeup_looks(date,boolean,integer) to authenticated;

notify pgrst, 'reload schema';
commit;
