-- REVIEW AND TEST BEFORE PRODUCTION. This file is not run by the app or CI.
-- Install separately using a database administrator in an isolated environment.
-- Preserves the existing table, RLS policies and client revision checks.
begin;
create or replace function public.prevent_plan_version_downgrade()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  old_version numeric;
  new_version numeric;
begin
  if jsonb_typeof(old.data -> 'version') = 'number' then
    old_version := (old.data ->> 'version')::numeric;
  end if;
  if jsonb_typeof(new.data -> 'version') = 'number' then
    new_version := (new.data ->> 'version')::numeric;
  end if;
  if old_version >= 4 and (new_version is null or new_version < old_version) then
    raise exception 'This plan requires an updated StudyPlanner client. Document version downgrade refused.' using errcode = '23514';
  end if;
  if new_version = 4 and (jsonb_typeof(new.data -> 'degrees') is distinct from 'array') then
    raise exception 'Invalid multi-degree document' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_plan_version_downgrade on public.plans;
create trigger prevent_plan_version_downgrade
before update on public.plans
for each row execute function public.prevent_plan_version_downgrade();
commit;

-- Rollback (only after backing up v4 plans and disabling incompatible clients):
-- begin;
-- drop trigger if exists prevent_plan_version_downgrade on public.plans;
-- drop function if exists public.prevent_plan_version_downgrade();
-- commit;
