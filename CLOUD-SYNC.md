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
