-- Run ONLY in an isolated PostgreSQL test database, after schema and guard setup.
-- Tests the real trigger on a temporary table; no auth.users or real plans needed.
begin;
create temporary table guard_fixture (data jsonb not null);
create trigger fixture_guard before update on guard_fixture
for each row execute function public.prevent_plan_version_downgrade();
insert into guard_fixture values ('{"modules":[]}');
update guard_fixture set data = '{"version":4,"degrees":[{"id":"degree-a"}]}';
do $$
begin
  begin
    update guard_fixture set data = '{"modules":[]}';
    raise exception 'FAIL: unversioned old-client write was accepted';
  exception when check_violation then null;
  end;
  begin
    update guard_fixture set data = '{"version":3,"modules":[]}';
    raise exception 'FAIL: v3 downgrade was accepted';
  exception when check_violation then null;
  end;
  begin
    update guard_fixture set data = '{"version":4,"modules":[]}';
    raise exception 'FAIL: missing degrees was accepted';
  exception when check_violation then null;
  end;
end;
$$;
update guard_fixture set data = '{"version":4,"degrees":[{"id":"degree-b"}]}';
update guard_fixture set data = '{"version":5,"degrees":[]}';
do $$
begin
  begin
    update guard_fixture set data = '{"version":4,"degrees":[]}';
    raise exception 'FAIL: future document downgrade was accepted';
  exception when check_violation then null;
  end;
end;
$$;
rollback;
