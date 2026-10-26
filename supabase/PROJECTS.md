# Supabase project inventory

Verified and display names corrected on 2026-10-26.

All projects belong to the single organization **Layermann**
(`abhnrberomqxvcgzgkzw`, Free plan).

| Purpose | Display name | Project reference | Region | Verified status |
| --- | --- | --- | --- | --- |
| Published application | StudyPlanner | `ucsyivchvsztahpcrkzk` | `eu-west-3` | ACTIVE_HEALTHY |
| Isolated tests | StudyPlanner Test | `tsbhjkdmoahngnyrzmxq` | `eu-central-1` | ACTIVE_HEALTHY |
| Historical project | StudyPlanner Archiv | `ttrdfoozriykoqpylihk` | `eu-west-1` | INACTIVE / paused |

## Verified application target

The published JavaScript served by https://layermann.github.io/StudyPlanner/
contains the Supabase API URL for **`ucsyivchvsztahpcrkzk`**. This project was
previously named **LayerTim's Project** and was renamed to **StudyPlanner**.
The published website returned HTTP 200 before and after the rename.

The historical project was previously named **StudyPlaner**, which made it appear
to be the application's backend. It is paused and is not referenced by the current
published build. Its old GitHub association is not evidence of the application's
runtime API target. It was renamed **StudyPlanner Archiv** without resuming it.
Its database contents were not inspected or deleted.

Exactly two projects are online: application and tests. The extra archive entry
is retained offline to preserve any historical data. No project deletion, database
migration, auth change, key rotation, repository push or deployment was performed
as part of this inventory/name cleanup. Existing organization membership and
permissions were left unchanged. Project IDs and API URLs are unchanged by rename.

For any future production SQL deployment, verify **`ucsyivchvsztahpcrkzk`** as the
intended target. Never select the archived project based on its former name or
GitHub association. The user separately authorized production publication on 2026-10-26. The
multi-degree guard is now installed in the application project too; see
`../PRODUCTION-RELEASE.md`.

See `TEST-PROJECT.md` for test configuration and completed database checks.
