# Isolated Supabase test project

Created with explicit user authorization on 2026-10-26. Production is unchanged.

- Name: **StudyPlanner Test**
- Organization: **Layermann** (`abhnrberomqxvcgzgkzw`)
- Reference: `tsbhjkdmoahngnyrzmxq`
- Region: `eu-central-1` (Frankfurt)
- API URL: `https://tsbhjkdmoahngnyrzmxq.supabase.co`
- Dashboard: https://supabase.com/dashboard/project/tsbhjkdmoahngnyrzmxq
- Cost quoted by Supabase at creation: **USD 0/month**. No paid upgrade or add-on
  was selected; this is not a guarantee about future usage/plan changes.

## Installed and verified

The project was empty before setup. Only this test project received:

1. `schema.sql` as migration `planner_schema`: `public.plans`, explicit
   authenticated CRUD privileges, no anonymous table privileges, owner-based
   RLS with SELECT/INSERT/UPDATE/DELETE policies. UPDATE checks both existing
   and resulting ownership.
2. `multi-degree-guard.sql` as migration `multi_degree_version_guard`: rejects
   document-version downgrades after v4 migration.

Checks executed successfully using the Supabase connector:

- `test-multi-degree-guard.sql`: legacy/unversioned and v3 writes rejected after
  v4; missing degrees rejected on v4 update; valid v4 updates accepted; downgrade
  from a future numeric version rejected.
- `test-planner-access.sql`: canonical two-degree JSON roundtrip, matching
  revision update, stale revision rejection, rejection of an old payload using
  a fresh revision, access only to own rows, blocked writes/reassignment to
  another owner, blocked reads/updates/deletes by another owner and anonymous
  access denied.
- Test identities and data existed only inside a transaction that was rolled
  back. Verified afterward: **0 auth users, 0 plans**.
- Supabase security advisor: **no findings**.
- Supabase performance advisor: **no findings**.
- Public Data API check with the publishable key: anonymous query to `plans`
  returned **HTTP 401**; public Auth settings endpoint returned **HTTP 200**.

These are real PostgreSQL/RLS/trigger checks with simulated authenticated role
and subject context. They are not a real Google login or JWT validation test.

## Local configuration

`.env.test.local` is prepared and ignored by Git. It contains only this test
project's public API URL and modern publishable key, plus an empty Google client
ID. No service-role key or database password is stored in the repository.

Start a separate local server explicitly:

```sh
npm run dev -- --mode test --port 5174 --host 127.0.0.1
```

For real cloud tests use `http://127.0.0.1:5174/`, **without `?demo=1`**.
Demo mode intentionally disables cloud synchronization. Ordinary development
configuration and existing production secrets were not changed.

## Remaining Google setup and browser verification

Google login is currently **disabled** in the test project's Auth configuration.
Supabase's official guide for the web flow requires Google OAuth Client ID and
Client Secret, registered origins and the project's callback URL:
https://supabase.com/docs/guides/auth/social-sign-in/auth-google

Use a dedicated test OAuth client rather than altering the production client's
configuration. The Google client must allow the local test origin (use the exact
origin, including port), and the provider must use the callback shown in Supabase:
`https://tsbhjkdmoahngnyrzmxq.supabase.co/auth/v1/callback`.

Enable Google in this project's Authentication / Sign In / Providers settings,
configure its Client ID/Secret securely there, and put only the public Client ID
in `.env.test.local`. Keep nonce validation enabled. Never add the Google Client
Secret to Vite/browser environment variables. Configure test-user audience in
Google as appropriate and project site/redirect URLs for the test origin.

Then perform the pending browser/account tests in `CLOUD-SYNC.md`: two separate
Google test accounts, a second session/device, account switching, failed loads
and conflicting edits. User login/consent is performed interactively by the user.

No production schema/auth settings, GitHub secrets, pushes, merges or deployments
were performed. Applying the tested guard to production remains a separately
user-authorized step before release.
