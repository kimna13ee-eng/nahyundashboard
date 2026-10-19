-- PERSONAL 전용. 기존 001~010 적용 후 실행. FRENGLE 프로젝트에는 적용하지 않는다.
-- 업무 분류와 단계 체크리스트만 추가한다. 기존 필드·메모·타이머·RLS는 유지한다.
begin;

create or replace function public.ops_valid_process_steps(p_steps jsonb)
returns boolean language plpgsql immutable security invoker set search_path='' as $$
declare
  step jsonb;
  step_ids text[] := array[]::text[];
  step_id text;
  step_title text;
begin
  if jsonb_typeof(p_steps) is distinct from 'array' then return false; end if;
  if jsonb_array_length(p_steps)>30 then return false; end if;
  for step in select value from jsonb_array_elements(p_steps) loop
    if jsonb_typeof(step) is distinct from 'object' then return false; end if;
    if not (step ?& array['id','title','done'])
       or (select count(*) from jsonb_object_keys(step))<>3 then return false; end if;
    if jsonb_typeof(step->'id') is distinct from 'string'
       or jsonb_typeof(step->'title') is distinct from 'string'
       or jsonb_typeof(step->'done') is distinct from 'boolean' then return false; end if;
    step_id := step->>'id';
    step_title := step->>'title';
    if length(step_id) not between 1 and 80 or length(btrim(step_id))=0
       or length(btrim(step_title)) not between 1 and 120
       or step_title<>btrim(step_title)
       or step_id=any(step_ids) then return false; end if;
    step_ids := array_append(step_ids,step_id);
  end loop;
  return true;
end $$;
revoke all on function public.ops_valid_process_steps(jsonb) from public,anon;
grant execute on function public.ops_valid_process_steps(jsonb) to authenticated;

alter table public.tasks
  add column if not exists task_category text not null default 'other',
  add column if not exists process_steps jsonb not null default '[]'::jsonb;
do $$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.tasks'::regclass and conname='tasks_task_category_check') then
    alter table public.tasks add constraint tasks_task_category_check
      check(task_category in ('content','sales','design','other'));
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.tasks'::regclass and conname='tasks_process_steps_check') then
    alter table public.tasks add constraint tasks_process_steps_check
      check(public.ops_valid_process_steps(process_steps));
  end if;
end $$;
-- Supports installations using column grants without widening access to older columns.
grant select(task_category,process_steps),insert(task_category,process_steps),update(task_category,process_steps)
  on public.tasks to authenticated;
notify pgrst, 'reload schema';
commit;

-- Installation check reads schema metadata only.
select exists(select 1 from information_schema.columns where table_schema='public' and table_name='tasks' and column_name='task_category') as task_category_exists,
       exists(select 1 from information_schema.columns where table_schema='public' and table_name='tasks' and column_name='process_steps') as process_steps_exists;
