-- PERSONAL only. Requires SQL002/012/018; preserves existing schedules and push setup.
begin;

alter table public.ops_schedules
  add column if not exists duration_minutes integer;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.ops_schedules'::regclass
      and conname='ops_schedules_duration_minutes_check'
  ) then
    alter table public.ops_schedules
      add constraint ops_schedules_duration_minutes_check
      check(duration_minutes is null or duration_minutes between 1 and 1440);
  end if;
end $$;

-- Add privileges only for this nullable metadata column. Do not restore broad
-- UPDATE/DELETE or change ownership, trash-window, or notification privileges.
grant select(duration_minutes),insert(duration_minutes),update(duration_minutes)
  on public.ops_schedules to authenticated;

notify pgrst, 'reload schema';
commit;

select exists (
  select 1 from information_schema.columns
  where table_schema='public' and table_name='ops_schedules'
    and column_name='duration_minutes' and data_type='integer' and is_nullable='YES'
) as yoga_metadata_installed;
