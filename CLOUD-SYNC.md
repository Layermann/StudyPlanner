# Cloud sync verification

The existing `public.plans` table (`owner`, `data jsonb`, `updated_at`) supports
multiple notes. No SQL migration is required for this change, provided the live
schema matches `supabase/schema.sql` and its row-level-security policies.

The current client loads before saving, inserts only after a successful missing-row
response, and updates existing rows only when `updated_at` matches the revision it
loaded. Saves within a session are serialized. A conflict or transport error pauses
further writes. Local data remains available for JSON export. An explicit cloud
reload requires confirmation because it replaces the local working copy.

This is optimistic concurrency protection for the new client. An old browser tab
running the previous unconditional-upsert code can still overwrite a newer plan.
Reload existing tabs after deployment. Database-enforced protection against old
clients would require a separate API/policy migration; it is not included here.

## Automated checks

Run `npm test` and `npm run build`. GitHub Pages runs tests before building and
deploying. The tests use an in-memory Supabase query double: they exercise errors,
conditional updates, two competing sessions, serialized saves, first-create races,
note migration and data roundtrips. They do not verify a live Supabase deployment,
authentication or actual RLS policies.

On restricted Windows environments that block the test runner's child process,
run each test module directly with Node; the same `node:test` tests execute:

```powershell
node tests/plan-sync.test.mjs
node tests/planner-preferences.test.mjs
```

## Live test (pending)

Use a dedicated test account and a local `.env.local` with the project's public
Supabase URL, publishable key and Google client ID. Do not use a service-role key.
The Google OAuth configuration must allow the local origin. Open the ordinary
local URL, not `?demo=1` (demo mode deliberately disables cloud sync).

1. Sign in, create two notes with different expansion states and wait for save.
2. Reload and verify both notes, their contents and formatting.
3. Open two independent browser sessions for the same test account. Save a change
   in A, then a different change in B without reloading. B must pause with a conflict;
   a fresh session must show A's data unchanged.
4. Verify JSON export preserves B's unsaved changes before explicitly reloading.
5. Block the initial cloud read. Editing locally must not issue a write. Restore
   connectivity and use the explicit reload flow after exporting local changes.
6. Verify a different test account cannot read or update the first account's row.

Do not run these checks against an existing personal plan without a backup.

## Multi-degree version 4 compatibility

The client still uses `createPlanSync` unchanged: loads precede inserts/updates,
updates match the loaded revision and writes are serialized. The payload is now
`{ version: 4, theme, degrees }`, with all degrees saved together. A degree switch
changes only local selection metadata and never schedules a cloud save.

The version 4 client validates/migrates the entire document before applying it.
Malformed or future documents pause sync and remain untouched. A local edit made
during the initial request also pauses the load. Dirty local data that differs
from the cloud requires an explicit choice; both sides can be exported. Choosing
the local plan performs another load and checks that both the local document and
the remote document still match the choice the user approved before saving.
Revision checks still protect against changes after that fresh load.

Each authenticated user ID has a separate local cache and undo lifetime. Guest
data stays separate. On owner changes the old controller is disposed, its timers
are canceled and its late results are ignored. Requests already sent to the
server may still finish for their original owner; they cannot update another
owner's document or the active UI. A guest backup can be downloaded explicitly
and restored using the full-document import flow; it is never uploaded implicitly.

### Required server guard before production rollout

Old clients do not enforce version compatibility. Client revision checks alone
cannot stop a legacy payload saved against a freshly read revision. Review
`supabase/multi-degree-guard.sql`, then install and test it **in an isolated test
database first**, using `supabase/test-multi-degree-guard.sql`. The guard preserves
RLS and rejects unversioned/v3 updates once the existing row is v4 or later; it
also rejects downgrades of future numeric versions. It does not provide arbitrary
JSON schema validation, protect against deliberate row deletion, or replace
revision checks. Rollback instructions are included in the guard file.

The schema and guard were applied only to the separate StudyPlanner Test project
with explicit authorization. Production has not been changed. A production release remains blocked
until the guard has been separately reviewed, tested and installed (or the user
explicitly accepts the documented old-client risk). Reloading tabs supplements
this protection; it cannot replace the guard.

### Additional live validation (pending)

Use dedicated test accounts and isolated database data only. After installing
the guard in that environment:

1. Load a legacy cloud plan, edit it with v4, then retrieve both degrees in a
   second session. Check notes, expansion states, ordering, grades and colors.
2. Attempt a legacy/unversioned write against the migrated row using the current
   revision. Verify the database rejects it and preserves the v4 document.
3. Repeat the competing-session and failed-request cases above with v4 payloads.
4. Change between account A, account B and guest while requests are pending.
   Verify B with no cloud row never receives A's or the guest's data.
5. Exercise both local/cloud reconciliation choices. Export both sides before
   replacing either one. Verify recovery snapshots survive the next cloud load.
6. Confirm RLS still blocks cross-account reads and writes with real user tokens.

Local browser tests use a Supabase query double. Separately, both
`supabase/test-multi-degree-guard.sql` and `supabase/test-planner-access.sql` were
executed successfully against the isolated StudyPlanner Test PostgreSQL database.
The latter simulates authenticated roles and JWT subject context inside a rolled-back
transaction; it does not verify Google login, token issuance or browser sessions.
All synthetic users and plans were rolled back. Security and performance advisors
reported no findings; anonymous REST access returned 401. See
`supabase/TEST-PROJECT.md` for project configuration and remaining Auth setup.
