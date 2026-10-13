-- Read-only production preflight. Run before considering SQL012.
-- Contains schema metadata only; does not read user schedules or change grants.
begin transaction read only;

select current_database() as database_name, current_user as inspecting_role;

select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'ops_schedules'
order by ordinal_position;

select c.relname, pg_get_userbyid(c.relowner) as owner,
       c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced,
       c.relacl as table_acl
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'ops_schedules';

select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = to_regclass('public.ops_schedules')
order by conname;

select policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'ops_schedules'
order by policyname;

select grantee, privilege_type, is_grantable
from information_schema.table_privileges
where table_schema = 'public' and table_name = 'ops_schedules'
order by grantee, privilege_type;

select grantee, column_name, privilege_type
from information_schema.column_privileges
where table_schema = 'public' and table_name = 'ops_schedules'
order by grantee, column_name, privilege_type;

select p.oid::regprocedure::text as signature,
       pg_get_userbyid(p.proowner) as owner, p.prosecdef as security_definer,
       p.proconfig as settings, p.proacl as function_acl,
       pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('ops_schedule_soft_delete', 'ops_schedule_restore',
                   'ops_purge_expired_schedules', 'ops_timer_guard_ready')
order by signature;

select to_regclass('supabase_migrations.schema_migrations') as migration_ledger;
-- If present, inspect the ledger separately and reconcile with the migration index.
-- A missing ledger does not establish which historical SQL scripts were applied.

commit;
