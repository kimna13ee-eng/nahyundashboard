begin;
alter table public.ops_shooting_skills add column if not exists sort_order integer not null default 0;
grant update(sort_order) on public.ops_shooting_skills to authenticated;
create or replace function public.ops_move_shooting_skill(p_id uuid,p_target uuid,p_after boolean)
returns void language plpgsql security invoker set search_path='' as $$
declare ids uuid[]; target_index integer;
begin
  -- Serialize reorders for this owner, including moves across loaded pages.
  perform id from public.ops_shooting_skills where owner_id=auth.uid() order by id for update;
  select array_agg(id order by sort_order,created_at desc,id desc) into ids
    from public.ops_shooting_skills where owner_id=auth.uid();
  if p_id=p_target or p_after is null or not (p_id=any(ids)) or not (p_target=any(ids)) or ids is null then
    raise exception 'Memo missing' using errcode='22023';
  end if;
  ids:=array_remove(ids,p_id);
  target_index:=array_position(ids,p_target) + case when p_after then 1 else 0 end;
  ids:=coalesce(ids[1:target_index-1],'{}'::uuid[]) || array[p_id] || coalesce(ids[target_index:array_length(ids,1)],'{}'::uuid[]);
  update public.ops_shooting_skills s set sort_order=a.position::integer
    from unnest(ids) with ordinality a(id,position)
    where s.owner_id=auth.uid() and s.id=a.id and s.sort_order is distinct from a.position::integer;
end $$;
revoke all on function public.ops_move_shooting_skill(uuid,uuid,boolean) from public,anon;
grant execute on function public.ops_move_shooting_skill(uuid,uuid,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
