begin;

alter table public.ops_blog_keywords add column if not exists archive_batch uuid;
-- Migration 025's unnamed two-column CHECK is named ops_blog_keywords_check.
alter table public.ops_blog_keywords drop constraint if exists ops_blog_keywords_check;
alter table public.ops_blog_keywords drop constraint if exists ops_blog_keywords_deleted_at_check;
alter table public.ops_blog_keywords add constraint ops_blog_keywords_deleted_at_check check (
  (deleted_at is null and archive_batch is null) or
  (deleted_at is not null and isfinite(deleted_at) and (used or archive_batch is not null))
);
grant update (archive_batch) on public.ops_blog_keywords to authenticated;

-- Return one scalar object so PostgREST's row limit cannot truncate an export.
create or replace function public.ops_blog_keyword_archive(p_action text, p_snapshot text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  v_owner uuid := auth.uid();
  v_ids uuid[];
  v_snapshot text;
  v_count bigint;
  v_items jsonb;
  v_batch uuid;
begin
  if v_owner is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_action is null or p_action not in ('summary','export','clear') then
    raise exception 'Invalid archive action' using errcode='22023';
  end if;
  if p_action='clear' then
    if p_snapshot is null or p_snapshot !~ '^[0-9a-f]{64}$' then
      raise exception 'Invalid archive snapshot' using errcode='22023';
    end if;
    -- Lock in the same order as the checked-item operation. Rows inserted
    -- after this selection must be left for the next download and deletion.
    v_ids := array(select id from public.ops_blog_keywords
      where owner_id=v_owner and deleted_at is null order by id for update);
  end if;

  select count(*), encode(sha256(convert_to(coalesce(
      string_agg(k.id::text || ':' || extract(epoch from k.updated_at)::text, ',' order by k.id), ''
    ),'UTF8')),'hex'),
    jsonb_agg(jsonb_build_object(
      'board',k.board,'keyword',k.keyword,'sub_keyword',k.sub_keyword,'summary',k.summary,
      'is_draft',k.is_draft,'used',k.used,'created_at',k.created_at,'updated_at',k.updated_at
    ) order by k.created_at desc,k.id desc) filter (where p_action='export')
    into v_count,v_snapshot,v_items from public.ops_blog_keywords k
    where k.owner_id=v_owner and k.deleted_at is null and (v_ids is null or k.id=any(v_ids));

  if p_action='export' then
    return jsonb_build_object('count',v_count,'snapshot',v_snapshot,'items',coalesce(v_items,'[]'::jsonb));
  elsif p_action='summary' then
    return jsonb_build_object('count',v_count,'snapshot',v_snapshot);
  end if;
  if v_count=0 or v_snapshot<>p_snapshot then
    raise exception 'Archive contents changed' using errcode='40001';
  end if;
  v_batch := gen_random_uuid();
  update public.ops_blog_keywords set deleted_at=statement_timestamp(),archive_batch=v_batch
    where owner_id=v_owner and id=any(v_ids);
  return jsonb_build_object('count',v_count,'batchId',v_batch);
end $$;

create or replace function public.ops_blog_keyword_archive_restore(p_batch uuid)
returns bigint language plpgsql security invoker set search_path='' as $$
declare
  v_owner uuid := auth.uid();
  v_count bigint;
begin
  if v_owner is null then raise exception 'Authentication required' using errcode='42501'; end if;
  update public.ops_blog_keywords set deleted_at=null,archive_batch=null
    where owner_id=v_owner and archive_batch=p_batch and deleted_at is not null;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke all on function public.ops_blog_keyword_archive(text,text),
  public.ops_blog_keyword_archive_restore(uuid) from public,anon,authenticated;
grant execute on function public.ops_blog_keyword_archive(text,text),
  public.ops_blog_keyword_archive_restore(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
