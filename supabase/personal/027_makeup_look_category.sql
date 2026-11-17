begin;

-- Existing looks keep their photos and picks, with no category until the owner chooses one.
alter table public.ops_makeup_looks
  add column if not exists category text check (category in ('female', 'male'));
grant insert (category), update (category) on public.ops_makeup_looks to authenticated;

-- The five-argument and three-argument functions from 026 remain available during deployment.
create or replace function public.ops_create_makeup_look(
  p_id uuid, p_title text, p_image bytea, p_thumbnail bytea, p_week date, p_category text
) returns table(id uuid, title text, created_at timestamptz, picked boolean, category text)
language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.ops_makeup_looks (id, title, image, thumbnail, category)
  values (p_id, p_title, p_image, p_thumbnail, p_category)
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
  -- A retried upload returns the current category and picks, including edits made after upload.
  return query select l.id, l.title, l.created_at, exists (
    select 1 from public.ops_makeup_week_picks w
    where w.owner_id = l.owner_id and w.look_id = l.id and w.week_start = p_week
  ), l.category from public.ops_makeup_looks l where l.owner_id = auth.uid() and l.id = p_id;
end $$;

create or replace function public.ops_list_makeup_looks(
  p_week date, p_picked_only boolean, p_offset integer, p_category text
) returns table(id uuid, title text, created_at timestamptz, picked boolean, category text)
language sql stable security invoker set search_path = '' as $$
  select l.id, l.title, l.created_at, (w.look_id is not null), l.category
  from public.ops_makeup_looks l
  left join public.ops_makeup_week_picks w
    on (w.owner_id, w.look_id, w.week_start) = (l.owner_id, l.id, p_week)
  where l.owner_id = (select auth.uid()) and (not p_picked_only or w.look_id is not null)
    and (p_category is null or l.category = p_category or (p_category = 'unclassified' and l.category is null))
  order by l.created_at desc, l.id desc limit 41 offset p_offset
$$;

revoke all on function public.ops_create_makeup_look(uuid,text,bytea,bytea,date,text),
  public.ops_list_makeup_looks(date,boolean,integer,text) from public, anon, authenticated;
grant execute on function public.ops_create_makeup_look(uuid,text,bytea,bytea,date,text),
  public.ops_list_makeup_looks(date,boolean,integer,text) to authenticated;

notify pgrst, 'reload schema';
commit;
