-- FRENGLE tlclbraledbncndhemsr ONLY; requires 001.
-- Extend accepted result types; preserve rows, membership and owner policies.
begin;
alter table public.ops_automation_results
 drop constraint ops_automation_results_source_check;
alter table public.ops_automation_results
 add constraint ops_automation_results_source_check
 check(source in ('frengle_keywords','frengle_site_recommendations','frengle_work_check'));
notify pgrst,'reload schema';
commit;
