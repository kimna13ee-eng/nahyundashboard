-- PERSONAL 전용. SQL002/012 적용 후 실행. 기존 일정·휴지통·RLS는 유지한다.
begin;
alter table public.ops_schedules
  add column if not exists category text not null default 'other',
  add column if not exists video_url text not null default '';

do $$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.ops_schedules'::regclass and conname='ops_schedules_category_check') then
    alter table public.ops_schedules add constraint ops_schedules_category_check
      check(category in ('work','exercise','other'));
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.ops_schedules'::regclass and conname='ops_schedules_video_url_check') then
    alter table public.ops_schedules add constraint ops_schedules_video_url_check
      check(length(video_url)<=2000 and (video_url='' or (
        video_url ~* '^https://[^/?#[:space:]@]+([/?#][^[:space:]]*)?$'
        and video_url !~ '[[:cntrl:]]'
      )));
  end if;
end $$;
-- SQL012 intentionally restricts UPDATE by column. Never restore table-wide
-- UPDATE/DELETE privileges or let clients change deleted_at/purge_after.
grant select(category,video_url),insert(category,video_url),update(category,video_url)
  on public.ops_schedules to authenticated;
notify pgrst,'reload schema';
commit;

select exists(select 1 from information_schema.columns where table_schema='public' and table_name='ops_schedules' and column_name='category') as schedule_category_installed,
       exists(select 1 from information_schema.columns where table_schema='public' and table_name='ops_schedules' and column_name='video_url') as schedule_video_url_installed;
