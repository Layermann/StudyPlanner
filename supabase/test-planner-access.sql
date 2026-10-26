-- Isolated TEST PROJECT ONLY. Everything, including synthetic identities, is rolled back.
-- Run after schema.sql and multi-degree-guard.sql. No real login/JWT validation implied.
begin;
set local statement_timeout = '20s';
select set_config('studyplanner_test.owner_a', gen_random_uuid()::text, true);
select set_config('studyplanner_test.owner_b', gen_random_uuid()::text, true);
insert into auth.users (id) values
  (current_setting('studyplanner_test.owner_a')::uuid),
  (current_setting('studyplanner_test.owner_b')::uuid);

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('studyplanner_test.owner_a'), true);
select set_config('request.jwt.claims', json_build_object('sub', current_setting('studyplanner_test.owner_a'), 'role', 'authenticated')::text, true);
do $$
declare
  affected integer;
  original jsonb := '{"version":4,"theme":"midnight","degrees":[{"id":"test-master","title":"Test Master","type":"master","semesters":[{"id":"s1","title":"Semester 1"}],"requirements":[{"id":"r1","title":"Studienleistungen","requiredCredits":120,"countTowardsTotal":true,"color":null}],"modules":[]},{"id":"test-bachelor","title":"Test Bachelor","type":"bachelor","semesters":[{"id":"s2","title":"Semester 1"}],"requirements":[{"id":"r2","title":"Studienleistungen","requiredCredits":180,"countTowardsTotal":true,"color":null}],"modules":[]}]}';
begin
  if auth.uid() is distinct from current_setting('studyplanner_test.owner_a')::uuid then raise exception 'FAIL: role context'; end if;
  insert into public.plans (owner,data,updated_at) values (auth.uid(),original,'2026-01-01T00:00:00Z');
  if (select data from public.plans where owner=auth.uid()) is distinct from original then raise exception 'FAIL: multi-degree roundtrip'; end if;
  update public.plans set data=jsonb_set(data,'{degrees,0,title}','"First edit"'), updated_at='2026-01-01T00:00:01Z'
    where owner=auth.uid() and updated_at='2026-01-01T00:00:00Z';
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'FAIL: matching revision refused'; end if;
  update public.plans set data=jsonb_set(data,'{degrees,0,title}','"Stale edit"'), updated_at='2026-01-01T00:00:02Z'
    where owner=auth.uid() and updated_at='2026-01-01T00:00:00Z';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'FAIL: stale revision accepted'; end if;
  if (select data #>> '{degrees,0,title}' from public.plans where owner=auth.uid()) <> 'First edit' then raise exception 'FAIL: fresh data lost'; end if;
  begin
    -- Old client uses a fresh revision but an incompatible unversioned payload.
    update public.plans set data='{"modules":[],"semesters":["Semester 1"],"requirements":[]}'
      where owner=auth.uid() and updated_at='2026-01-01T00:00:01Z';
    raise exception 'FAIL: old writer accepted at fresh revision';
  exception when check_violation then null;
  end;
  if (select jsonb_array_length(data->'degrees') from public.plans where owner=auth.uid()) <> 2 then raise exception 'FAIL: guard lost a degree'; end if;
  begin
    insert into public.plans(owner,data) values(current_setting('studyplanner_test.owner_b')::uuid,original);
    raise exception 'FAIL: insert for another owner accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.plans set owner=current_setting('studyplanner_test.owner_b')::uuid where owner=auth.uid();
    raise exception 'FAIL: owner reassignment accepted';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', current_setting('studyplanner_test.owner_b'), true);
select set_config('request.jwt.claims', json_build_object('sub', current_setting('studyplanner_test.owner_b'), 'role', 'authenticated')::text, true);
do $$
declare affected integer;
begin
  if exists(select 1 from public.plans) then raise exception 'FAIL: B can read A'; end if;
  update public.plans set data='{}' where owner=current_setting('studyplanner_test.owner_a')::uuid;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'FAIL: B can update A'; end if;
  delete from public.plans where owner=current_setting('studyplanner_test.owner_a')::uuid;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'FAIL: B can delete A'; end if;
  insert into public.plans(owner,data) values(auth.uid(),'{"version":4,"degrees":[{"id":"b"}]}');
  if (select count(*) from public.plans) <> 1 then raise exception 'FAIL: B cannot access own row'; end if;
  delete from public.plans where owner=auth.uid();
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'FAIL: own delete refused'; end if;
end;
$$;
reset role;
set local role anon;
do $$
begin
  begin
    perform 1 from public.plans;
    raise exception 'FAIL: anonymous table access accepted';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;
select 'PASS' as planner_rls_revision_and_guard_tests;
rollback;
