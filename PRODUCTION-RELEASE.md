# Production release — 2026-10-26

The user explicitly authorized publishing the multi-degree feature to production
and trying the remaining Google/browser flows live instead of first configuring
Google in the isolated test project.

## Production target and preparation

- Published site: https://layermann.github.io/StudyPlanner/
- Supabase application project: `ucsyivchvsztahpcrkzk` (StudyPlanner).
- Existing cloud plans were backed up locally before changing the database.
  The backup is ignored by Git and is not shipped with the application.
- Dry-run migration of all **5 existing cloud plans / 65 modules** passed.
- The previously isolated-test-verified `multi_degree_version_guard` migration
  was installed in production. Trigger presence/enabled state was verified;
  all 5 existing rows remained present. The guard does not rewrite plan data.
- Production RLS policies, grants, Auth settings, Google configuration and keys
  were not changed. No test account or sample plan was inserted in production.

## Validation

- 24 automated tests passed.
- Production Vite build passed before publication.
- Earlier isolated browser checks passed: notes smoke, 15 planner/cloud hook
  cases and UI flows at 390/768/1280 px.
- Existing real Google login had been observed working on the previous version.
  A complete Google multi-account/cross-device flow with the new client remains
  a live validation task, not a completed isolated Auth test.

## Existing Supabase advisor findings

Production advisors reported existing warnings about GraphQL schema visibility
of `plans`, execute privileges on `public.rls_auto_enable()`, and disabled leaked
password protection. These settings were not changed as part of publication.
GraphQL schema discovery does not itself bypass RLS. The authenticated role's
SELECT privilege is required for the application's normal cloud reads.

References:
- https://supabase.com/docs/guides/database/database-linter?lint=0026_pg_graphql_anon_table_exposed
- https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
- https://supabase.com/docs/guides/auth/password-security

## Rollback caution

Once a user's cloud document has become version 4, deploying the old client is
not a safe application rollback: the old client cannot read the multi-degree
format and the guard deliberately rejects downgrade writes. Preserve/export v4
plans and use a compatible client or a separately reviewed recovery operation.
Do not remove the guard merely to permit old clients to overwrite migrated data.
