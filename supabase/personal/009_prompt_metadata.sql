-- PERSONAL 002 이후 사용자 검토·승인 후 실행. 이전 원문·버전 변경/삭제 없음.
begin;
alter table public.ops_prompt_versions add constraint ops_prompt_owner_item_unique unique(owner_id,item_id,id),add column metadata jsonb;
revoke update,delete on public.ops_prompt_versions from authenticated;
alter table public.ops_library_items add column tool text not null default '' check(length(tool)<=80),add column project_id uuid,
 add column change_reason text not null default '' check(length(change_reason)<=2000),add column status text not null default 'active' check(status in ('active','archived')),
 add column approved_version_id uuid,
 add constraint library_personal_project foreign key(owner_id,project_id) references public.ops_projects(owner_id,id),
 add constraint library_approved_version foreign key(owner_id,id,approved_version_id) references public.ops_prompt_versions(owner_id,item_id,id);
create or replace function public.ops_version() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if TG_TABLE_NAME='ops_library_items' and new.kind='prompt' then
  if TG_OP='UPDATE' and row(new.body,new.title,new.tool,new.project_id,new.change_reason,new.status,new.approved_version_id) is not distinct from row(old.body,old.title,old.tool,old.project_id,old.change_reason,old.status,old.approved_version_id) then return new;end if;
  insert into public.ops_prompt_versions(owner_id,item_id,body,title,metadata) values(new.owner_id,new.id,new.body,new.title,jsonb_build_object('tool',new.tool,'project_id',new.project_id,'change_reason',new.change_reason,'status',new.status,'approved_version_id',new.approved_version_id));
 elsif TG_TABLE_NAME='ops_task_notes' then
  insert into public.ops_note_versions(owner_id,note_id,body,kind,pinned,done) values(new.owner_id,new.id,new.body,new.kind,new.pinned,new.done);
 end if;return new;
end $$;
commit;
