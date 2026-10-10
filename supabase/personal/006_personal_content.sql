-- 사용자 승인 후 PERSONAL Supabase에서만 실행.
-- 기존 행·정책·테이블을 삭제하지 않음. 기존 콘텐츠 상세는 NULL로 유지.
begin;
alter table public.ops_content add column if not exists personal_details jsonb;
do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='public.ops_content'::regclass and conname='ops_content_personal_details_object') then
  alter table public.ops_content add constraint ops_content_personal_details_object
   check(personal_details is null or (jsonb_typeof(personal_details)='object' and octet_length(personal_details::text)<=32000));
 end if;
end $$;
-- 기존 owner_access RLS 및 owner_id/project_id 복합 FK를 그대로 유지.
commit;
