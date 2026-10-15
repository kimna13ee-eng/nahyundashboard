-- FRENGLE project tlclbraledbncndhemsr ONLY. Never apply to PERSONAL.
begin;
create table public.ops_company_members (
 user_id uuid primary key references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);
alter table public.ops_company_members enable row level security;
alter table public.ops_company_members force row level security;
revoke all on public.ops_company_members from public,anon,authenticated;
grant select on public.ops_company_members to authenticated;
create policy company_member_self on public.ops_company_members for select to authenticated
 using(user_id=(select auth.uid()));
create table public.ops_automation_results (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 source text not null check(source in ('frengle_keywords','frengle_site_recommendations')),
 run_key text not null check(length(run_key) between 1 and 160),
 title text not null check(length(title) between 1 and 120),
 body text not null check(length(body) between 1 and 50000),
 source_url text not null check(source_url ~ '^https://chatgpt\.com/(c|scheduled)(/|\?|$)'),
 reported_at timestamptz not null,
 received_at timestamptz not null default clock_timestamp(),
 unique(owner_id,source,run_key)
);
create index ops_automation_results_received on public.ops_automation_results(owner_id,received_at desc);
alter table public.ops_automation_results enable row level security;
alter table public.ops_automation_results force row level security;
revoke all on public.ops_automation_results from anon,authenticated;
grant select,insert on public.ops_automation_results to authenticated;
create policy automation_result_owner_select on public.ops_automation_results for select to authenticated
 using(owner_id=(select auth.uid()) and exists(select 1 from public.ops_company_members where user_id=(select auth.uid())));
create policy automation_result_owner_insert on public.ops_automation_results for insert to authenticated
 with check(owner_id=(select auth.uid()) and exists(select 1 from public.ops_company_members where user_id=(select auth.uid())));
create function public.ops_automation_result_rate_guard()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(new.owner_id::text||':automation-result',0));
 if not exists(select 1 from public.ops_automation_results
   where owner_id=new.owner_id and source=new.source and run_key=new.run_key)
   and (select count(*) from public.ops_automation_results
     where owner_id=new.owner_id and received_at>clock_timestamp()-interval '1 minute')>=30 then
  raise exception 'Automation result rate limit';
 end if;
 return new;
end $$;
revoke all on function public.ops_automation_result_rate_guard() from public,anon,authenticated;
create trigger ops_automation_result_rate_guard before insert on public.ops_automation_results
 for each row execute function public.ops_automation_result_rate_guard();
notify pgrst,'reload schema';
commit;

