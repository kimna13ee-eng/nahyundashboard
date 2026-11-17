begin;

create or replace function public.ops_delete_selected_makeup_looks(p_ids uuid[])
returns integer language sql security invoker set search_path = '' as $$
  with removed as (
    delete from public.ops_makeup_looks
    where owner_id = (select auth.uid()) and id = any(p_ids)
    returning 1
  )
  select count(*)::integer from removed;
$$;

revoke all on function public.ops_delete_selected_makeup_looks(uuid[]) from public, anon, authenticated;
grant execute on function public.ops_delete_selected_makeup_looks(uuid[]) to authenticated;

notify pgrst, 'reload schema';
commit;
