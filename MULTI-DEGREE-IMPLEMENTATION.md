# Multi-degree implementation and review

Implemented locally on `codex/multi-degree-support`. No push, PR, merge,
production deployment or production database changes were performed. A separate
Supabase test project was later created and configured with user authorization.

## Architecture

- `multi-degree.mjs` defines version 4 validation, deterministic legacy migration,
  new degree creation, ID relationships, degree-isolated updates and shared
  ECTS/weighted-grade calculations.
- Canonical modules use `semesterId` and `requirementId`. Semesters and requirements
  are ordered objects. `degreeView`/`modulesFromView` adapt this representation to
  the existing editor components without persisting name-based relationships.
- `hooks/usePlanner.js` owns editing and persistence. Updates validate and persist
  the whole document before changing the visible state. Undo is degree-scoped;
  document replacement/account changes invalidate history and stale callbacks.
  Degree metadata changes clear that degree's undo history so later undo cannot
  unexpectedly restore an old name/type. Selection is local metadata.
- `planner-storage.mjs` separates guest, demo and authenticated-account caches.
  Local writes detect stale caches changed by another tab before replacing them.
- `hooks/useCloudSync.js` owns loading, reconciliation, account lifecycle and
  debounced complete-document saves. `plan-sync.mjs` retains its revision checks,
  load-before-save and serialized writes unchanged.
- `DegreeSwitcher`, `PlannerDialog` and `MultiDegreeOverview` add degree management,
  focus-managed native dialogs and per-degree dashboards to the existing view.

## Migration and storage

Version 3, earlier supported versioned exports, and the original unversioned
single-plan shape migrate to one degree. IDs generated from legacy positions are
deterministic; existing valid entity/note IDs remain. Titles, original array order,
module ordering, status, grades, notes, expansion, colors and inclusion flags remain.
Requirement ECTS accepts positive finite values above 30. Module ECTS retains its
existing maximum of 30.

The original `studyPlanner*MScInformatik` storage keys remain unchanged and are no longer written by v4. Theme retains
its existing global preference key. Missing individual legacy keys use the old
Informatik defaults; malformed present data does not fall back to an empty plan.
Ambiguous names or unresolved legacy references abort migration and preserve the
source rather than guessing module membership.

The new key is `studyPlanner:v4:guest` or
`studyPlanner:v4:account:<Supabase user ID>`, prefixed with `demo:` for development
sample mode. It contains the document, local active degree, dirty flag, known
cloud baseline and migration marker. Legacy source values are copied to
`<key>:legacy-source` before the migration document is committed in one write.
Old keys are retained, so interruption before the new write can safely retry.

Before import, deletion or cloud replacement, the prior complete workspace is
stored under `<key>:recovery` and an immutable `<key>:recovery:<UUID>` archive.
Earlier recovery copies are retained. Storage-full/unavailable errors prevent the
operation from applying and surface an export message. Archives are intentionally
not automatically pruned; large repeated replacements can eventually require the
user to export/archive recovery data and manage browser storage.

An unreadable cache blocks editing and offers raw-data export plus restoration
from a validated JSON backup. A raw-data recovery export contains storage entries;
it is not itself a normal planner backup. To restore an older archived copy,
extract its `document` field into a JSON file and import that complete plan.
The normal recovery control restores the latest local point, backed up in turn.

## User workflow

1. Use **+ Studiengang** to enter a name, degree type and ECTS target. Bachelor
   defaults to 180 and Master to 120; Other requires an explicit target.
2. A new degree starts with one semester, no modules and an editable
   **Studienleistungen** requirement. Included categories determine the total;
   there is no competing authoritative `targetCredits` field.
3. Switch through **Aktiver Studiengang**. **Verwalten** renames/changes type or
   deletes with confirmation; the last degree cannot be deleted.
4. An open module form offers a degree selector. Switching requires Save / Discard
   / Cancel. Saved drafts belong to their original degree. Notes save on each
   change, so they have no separate unsaved draft on navigation.
5. **Alle Studiengänge** displays separate progress and average grades plus summed
   credits. No combined grade or cross-degree recognition is inferred.
6. **Export JSON** backs up every degree. **Import JSON** validates first, confirms
   replacement of all current degrees and offers a current-plan download. A legacy
   import restores one degree, explicitly replacing the full multi-degree backup.
7. Guest and signed-in data remain separate. To transfer a guest plan deliberately,
   download its backup from the signed-in controls and restore it through Import.

## Changed and added files

Added:
- `multi-degree.mjs`, `planner-storage.mjs`
- `components/DegreeSwitcher.jsx`, `components/PlannerDialog.jsx`,
  `components/MultiDegreeOverview.jsx`
- `tests/multi-degree.test.mjs`
- `tests/browser/multi-degree.html`, `multi-degree-smoke.jsx`,
  `multi-degree-ui.html`, `multi-degree-preview.html`, `multi-degree-ui-smoke.jsx`
- `supabase/multi-degree-guard.sql`, `supabase/test-multi-degree-guard.sql`,
  `supabase/test-planner-access.sql`, `supabase/TEST-PROJECT.md`
- `MULTI-DEGREE-PLAN.md`, this review document

Modified:
- `supabase/schema.sql` (explicit authenticated grants and role-scoped RLS)
- `hooks/usePlanner.js`, `hooks/useCloudSync.js`, `planner-model.mjs`,
  `planner-preferences.mjs`, `study-planer.jsx`, `style.scss`
- `components/DegreeProgress.jsx`, `components/modules/ModuleModal.jsx`,
  `components/notes/NoteCard.jsx`
- `README.md`, `CLOUD-SYNC.md`

No dependencies or credentials were added. Generated `dist` output is not a
source change and is regenerated by the existing deployment workflow.

## Verification and remaining release gate

Run `npm test` and `npm run build`. For browser checks, run `npm run dev` and open:

- `/?demo=1` for the editable sample workspace, with cloud disabled.
- `/tests/browser/notes.html` for the existing notes regression flow.
- `/tests/browser/multi-degree.html` for isolated planner/cloud-hook integration.
- `/tests/browser/multi-degree-ui.html` for sequential 390/768/1280 px UI flows.

The integration fixture uses memory storage and a fake Supabase query layer. UI
fixtures use memory storage, and must be opened with the supplied demo URLs.
They do not modify ordinary local storage or production plans. The tests exercise
creation, migration, per-degree history, notes, renaming, deletion/recovery,
reload, import, failures, account changes and conditional cloud conflicts. UI
checks additionally exercise module drafts, drag/drop, large ECTS targets,
long names, native dialog focus and light-theme layout without page overflow.

The SQL guard and database RLS/revision assertions now pass against the separate
StudyPlanner Test database. Real Google sign-in, issued JWTs and cross-device
browser synchronization remain pending. Follow `CLOUD-SYNC.md` and
`supabase/TEST-PROJECT.md`. The tested guard has not been installed in production;
production rollout still requires that separate action or an explicit user decision
accepting the old-client compatibility risk.

### Results for the reviewed local implementation (2026-10-26)

- `npm test`: 24 passed, 0 failed.
- Production Vite build: passed. The last build used a separate verification
  output folder; tracked `dist` files are unchanged.
- Notes browser smoke: PASS.
- Multi-degree hook integration: 15 checks passed in the browser, using the
  in-memory query double and isolated storage.
- Responsive UI flows: PASS at 390, 768 and 1280 px, including explicit imported
  ordering, module drafts, ID-backed moves and large requirement targets (ordering
  is covered by the hook fixture; drag/drop by the UI fixture).
- Isolated PostgreSQL guard, RLS ownership, conditional revision and old-writer
  assertions: PASS after test-project setup. Synthetic users/plans were rolled back.
- Security/performance advisors: no findings. Anonymous Data API query: 401.
- Google sign-in and production changes: not performed; release gate remains.
