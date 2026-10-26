# StudyPlanner – Full Multi-Degree Support Implementation

> Review draft: This document specifies a future implementation. Editing or approving this plan alone does not authorize implementation, production changes, deployment or merging.

## Objective

Implement complete Multi-Degree Support in the existing StudyPlanner application.

The goal is to allow users to manage multiple independent degree programs (Bachelor, Master, double degrees, consecutive degrees, etc.) within one StudyPlanner account.

**Implement the entire feature end-to-end, including data architecture, migration, state management, UI, progress dashboards, import/export, cloud synchronization, automated testing and responsive styling.**

Do not stop after implementing the underlying data model. Deliver a fully integrated, usable feature.

Work autonomously, make reasonable architectural decisions, and follow the existing project's design language and coding conventions.

## 1. Inspect the existing architecture

Before making changes, analyze the relevant code, particularly:

- `study-planer.jsx` – Main application and UI composition
- `hooks/usePlanner.js` – Planner state and persistence
- `hooks/useCloudSync.js` – Supabase synchronization
- `planner-model.mjs` – Data normalization and validation
- `planner-config.mjs` – LocalStorage configuration
- `planner-preferences.mjs` – Themes and preferences
- `plan-sync.mjs` – Cloud synchronization and conflict protection
- `components/DegreeProgress.jsx` – ECTS and grade calculations
- `components/requirements/ContainerAnalytics.jsx`
- `components/semesters/SemesterColumn.jsx`
- `components/modules/ModuleCard.jsx`
- `supabase/schema.sql`
- Existing automated tests and deployment workflow

Reuse existing functionality rather than rewriting working components unnecessarily.

Preserve the current architecture where reasonable, but refactor it when necessary for clean Multi-Degree support.

## 2. Introduce a multi-degree data model

Replace the conceptual single-degree architecture with a versioned multi-degree model.

Suggested structure:

```json
{
  "version": 4,
  "theme": "midnight",
  "degrees": [
    {
      "id": "uuid-1",
      "title": "M.Sc. Informatik",
      "type": "master",
      "semesters": [],
      "requirements": [],
      "modules": []
    },
    {
      "id": "uuid-2",
      "title": "B.Sc. Mathematik",
      "type": "bachelor",
      "semesters": [],
      "requirements": [],
      "modules": []
    }
  ]
}
```

Use stable unique IDs for each degree.

Each degree must independently own its:

- Title and degree type
- Semesters
- Modules and their ordering
- Module statuses
- Grades
- Module notes
- Requirement categories
- Requirement colors
- ECTS requirements and progress calculations

Global application preferences such as the theme should remain global.

Maintain a locally stored `activeDegreeId` to determine which degree is currently displayed. Switching degrees should not unnecessarily modify or synchronize the underlying study data.

Use appropriate normalization and validation for all structures.

Avoid coupling data to human-readable titles when stable IDs are available.

### Stable references and migration

Version 4 must give semesters and requirement categories stable IDs. Modules must reference them through 'semesterId' and 'requirementId'; human-readable names are display values, not relationship keys.

Represent semesters as ordered objects with at least 'id' and 'title'. Array order defines semester and requirement order; module ordering remains explicit within each semester. Renaming a semester or requirement must not change module membership.

During legacy migration, resolve module semester/container names against the original lists before normalizing display names. Preserve all modules and ordering. Do not silently assign unresolved references to the first category or semester. Preserve ambiguous or unmatched data in a clearly identified recovery category/semester and explain the repair; if safe recovery is impossible, stop migration without replacing the source.

Preserve existing valid IDs. Generate missing degree and relationship IDs once and persist the migration result. Reprocessing the same legacy source must reuse a recorded migration result rather than create another degree. Never generate fresh IDs on ordinary reads.

Reject duplicate IDs within each owning scope in version 4 imports. Different degrees may contain identical legacy module IDs: all edit operations and UI state must therefore be scoped by degree ID as well as entity ID.

### ECTS source of truth

The total required ECTS of a degree is the sum of its requirement categories with 'countTowardsTotal !== false'. Do not persist a separate authoritative 'targetCredits' field.

The target entered in the creation dialog is an initialization input. Create one editable, included requirement category, initially named "Studienleistungen", with that many required ECTS. Bachelor starts with 180 and Master with 120; Other requires an explicit positive target. Users can later split or replace this category and change category ECTS. The UI must explain that the total follows the included categories.

New degrees start with independent data and a minimal semester list, without inheriting Informatik categories or modules. Preserve Informatik defaults only when migrating an existing plan that actually uses them.

### Important: Requirement ECTS validation

The existing code uses `isValidCredits()` for both module credits and requirement credits, currently restricting values to a maximum of 30.

This is insufficient for degree requirements that may contain 60, 120 or 180 ECTS.

Separate module-credit validation from requirement-credit validation.

Ensure that new degrees can support Bachelor, Master and custom ECTS structures without imposing the existing M.Sc. Informatik defaults on every new degree.

## 3. Backward-compatible data migration

Existing user data must never be silently lost.

Implement automatic migration from the previous single-degree format into the new multi-degree format.

Migration requirements:

1. Detect the existing localStorage structure.
2. Convert the existing planner into the first degree.
3. Preserve its title, semesters, modules, statuses, grades, notes, colors and requirements.
4. Preserve existing ordering.
5. Support migration of existing Supabase cloud plans.
6. Continue supporting imports of old JSON exports, including version 3.
7. Avoid repeated migration or duplicate degrees on subsequent loads.
8. Make the migration idempotent.
9. Do not delete the original local data immediately after migration.
10. Avoid saving empty/default data over existing plans during initialization.

The existing cloud data currently uses a single `plans` row per user containing JSON data.

Prefer keeping one versioned JSON document with a `degrees` array per account for this release.

Avoid database schema changes unless technically necessary.

Do not deploy database migrations automatically against production.

### Critical cloud migration behavior

A locally migrated legacy plan must not automatically overwrite an existing, different cloud plan.

Preserve the existing load-before-save and optimistic concurrency safeguards.

Handle failed loads, conflicting writes, account changes and unsupported future data versions safely.

If existing local and cloud data cannot be reconciled without risking data loss, require an explicit user decision rather than silently discarding one side.

### Migration transaction and local storage

Read, validate and migrate the entire source before writing the new active document. Keep the original storage keys and values intact as legacy recovery data; stop writing evolving version 4 data into those legacy keys. Store the new versioned document separately, preserving the existing demo-storage separation.

Persist a recoverable pre-migration snapshot and migration marker before considering migration complete. If storage is unavailable, full or contains malformed data, surface a recovery/export path and avoid committing a partial migration or falling back to defaults over existing data.

Distinguish absent data from invalid data and intentional empty collections. Migration must not silently "repair" invalid credits, notes or references by discarding the original values. Preserve note IDs, content, ordering and expansion state.

Use one shared validation/migration pipeline for local data, JSON imports and cloud loads, with explicit source-specific legacy adapters. Legacy cloud documents may have no version field; recognize their actual supported shape rather than assuming all old documents are version 3.

## 4. Multi-degree state management

Refactor `usePlanner.js` or introduce additional hooks to support independent degree state.

Required operations:

- Add a degree
- Select a degree
- Rename a degree
- Change its degree type where applicable
- Delete a degree with confirmation
- Optionally duplicate a degree if this fits cleanly
- Update modules in the active degree
- Update semesters in the active degree
- Update requirements in the active degree

All existing module-editing functionality must continue to work.

**State isolation is mandatory:** Editing degree A must never unintentionally modify degree B.

Preserve the existing undo behavior and ensure that undo/redo history, where supported, cannot accidentally apply an edit to the wrong degree.

Prevent deleting the final remaining degree without providing a safe replacement or reset flow.

Keep newly created degrees independent from the existing Informatik template.

### Undo and transient editing state

Use degree-scoped undo history for degree edits. Switching degrees is navigation and must not create undo entries, cloud writes or changes to the document. Import, cloud replacement and account changes must reset incompatible histories. Redo is not required if the application does not currently support it.

Degree-management actions must have explicit behavior: deleting a degree requires confirmation and a recoverable local snapshot/export path; undo in another degree must never recreate, delete or alter it. Global theme preferences and degree-management actions must not be accidentally restored by degree-edit undo.

Before changing the active degree, resolve open module dialogs and unsaved drafts with Save / Discard / Cancel when necessary. Saving applies to the original degree; Cancel keeps it selected. End active drag operations, clear stale selection and drag targets, and restore focus to an appropriate control.

Scope asynchronous callbacks, modal state and note expansion state by degree and entity IDs. A delayed callback originating in degree A must never write into degree B. Account changes must also invalidate pending edits and callbacks from the previous account.

## 5. Build a degree switcher

Implement a clean, modern degree-switching UI integrated into the existing header.

Example:

**Current Degree: M.Sc. Informatik ▾**

Dropdown:

- M.Sc. Informatik ✓
- B.Sc. Mathematik
- + Add Degree
- Manage Degrees

Requirements:

- Quickly switch between degrees.
- Show the selected degree clearly.
- Allow creating a new degree.
- Provide options for renaming and deleting degrees.
- Remember the currently selected degree across page reloads.
- Ensure keyboard accessibility and mobile usability.
- Preserve the existing dark/light theme support.
- Match the current StudyPlanner styling.

When there is only one degree, keep the UI unobtrusive so that the application remains as straightforward as the original single-degree version.

### Adding a new degree

Provide a small dialog requesting at least:

- Degree name
- Degree type (Bachelor, Master, Other)
- Target ECTS or a suitable initial ECTS configuration

Suggested defaults:

- Bachelor: 180 ECTS
- Master: 120 ECTS
- Other: configurable

These are initial defaults, not fixed restrictions.

Ensure the initial requirement structure and progress calculations match the configured target. Users must be able to customize requirement categories and their ECTS later.

## 6. Preserve the existing individual degree view

The current StudyPlanner interface should remain the main editing interface.

When a degree is selected, display only its:

- Semester timeline
- Modules
- Requirements
- ECTS distribution
- Progress indicators
- Average grade
- Notes

All existing features must remain functional, including:

- Drag-and-drop module reordering
- Module creation, editing and deletion
- Custom requirement categories
- Requirement colors and ordering
- Module notes
- Module status changes
- Grades
- Semester management
- Import/export
- Undo

Do not redesign the entire application unnecessarily.

The user should feel that the original planner has gained a degree-switching feature, not that it has been replaced with a different application.

## 7. Implement a Multi-Degree Dashboard

Add an overview for users who manage multiple degrees.

Suggested name: **All Degrees** or **Study Overview**.

This overview must display all configured degree programs and their individual progress.

Each degree card should contain:

- Degree title
- Degree type
- Total required ECTS
- Completed ECTS
- In-progress ECTS
- Planned ECTS
- A progress bar using the existing planned/in-progress/completed colors
- ECTS-weighted average grade, if available
- A way to open that degree's detailed planner

Example:

**M.Sc. Informatik**

54 / 120 ECTS completed

Completed: 54 | In Progress: 18 | Planned: 48

**B.Sc. Mathematik**

96 / 180 ECTS completed

Completed: 96 | In Progress: 30 | Planned: 54

Also provide a compact overall summary showing:

- Number of managed degrees
- Total configured required ECTS across degrees
- Total completed ECTS across degrees
- Total in-progress ECTS
- Total planned ECTS

Make it clear that combined ECTS are an aggregation of the individual degree plans, not necessarily a count of unique academic credits recognized across institutions.

Do not calculate a combined average grade across unrelated degrees. Grade averages must remain degree-specific.

Extract reusable progress-calculation functions rather than duplicating calculation logic between the existing `DegreeProgress` component and the new dashboard.

### Important design principle

The new dashboard should complement the current interface.

Do not replace the current semester timeline with a combined timeline.

A combined semester planner across multiple degrees is explicitly out of scope for this release.

## 8. UI/UX and responsive design

Follow the existing visual identity:

- Existing color palettes
- Rounded cards
- Existing typography
- Consistent spacing
- Existing progress bar design
- Matching hover states
- Smooth, subtle transitions

Keep the interface responsive for desktop, tablet and mobile.

Important requirements:

- Degree names must handle long text.
- Dropdowns and dialogs must remain usable on small screens.
- Confirm destructive operations.
- Clearly identify the active degree.
- Avoid unnecessary animations.
- Respect reduced-motion preferences.
- Use accessible form labels and button descriptions.
- Keep focus management and keyboard navigation functional.

Prefer integrating this functionality into reusable React components instead of creating one oversized component.

Potential components:

- `DegreeSwitcher`
- `DegreeManager`
- `CreateDegreeModal`
- `MultiDegreeOverview`
- `DegreeOverviewCard`

These names are suggestions, not hard requirements.

## 9. Extend JSON import and export

Update JSON import/export to support multiple degrees.

New exports should use version 4 and contain all degree data and appropriate global preferences.

Requirements:

- Export all degrees as one complete backup.
- Preserve individual modules, requirements, grades, notes and ordering.
- Import version 4 exports.
- Continue importing existing legacy exports.
- Validate imported data before replacing the existing state.
- Show a confirmation before overwriting existing data.
- Never silently replace a multi-degree account with only one imported degree.
- Reject unsupported future versions safely.
- Avoid interpreting malformed documents as empty study plans.

Keep the import/export process straightforward for users.

A full backup must allow restoring the complete multi-degree configuration.

### Import semantics for this release

Import means restoring a complete backup, replacing the full document in the current local/account scope after explicit confirmation. Adding or merging an imported degree is out of scope for this release.

Show the backup's degree count and titles and state how many current degrees will be replaced. A legacy single-degree backup restores one migrated degree and must explicitly warn when this replaces a multi-degree document.

Validate and migrate the entire file before changing any live state. Offer a download of the current complete backup before replacement, and retain a recoverable local pre-import snapshot. Cancel, validation failure or persistence failure must leave the current plan intact.

Import must use the existing cloud revision and serialized-save lifecycle when synchronization is ready. If cloud loading or conflict recovery is pending, retain the imported document locally and require an explicit cloud reconciliation decision before uploading it. Import must not bypass a paused sync controller.

## 10. Adapt Supabase Cloud Sync

Extend the existing cloud synchronization to handle the new multi-degree format.

Preserve the current safety architecture based on:

- Loading before saving
- Serialized writes
- Revision-based conflict detection
- Pausing synchronization after conflicts
- Explicit recovery from sync failures

Requirements:

1. Load all degrees together.
2. Save all degrees together.
3. Migrate legacy cloud data safely.
4. Preserve changes when switching between degrees.
5. Avoid stale closures overwriting newer state.
6. Avoid synchronization during incomplete migration or hydration.
7. Keep local-only usage functional.
8. Preserve JSON export even when cloud synchronization has failed.
9. Correctly isolate data between different authenticated accounts.

Pay particular attention to sign-out and sign-in with another Google account on the same browser.

One user's locally cached data must never be silently uploaded into another user's cloud account.

Use the existing Supabase RLS model where possible.

Do not introduce unnecessary backend complexity.

### Account-scoped caches and reconciliation

Separate guest data from authenticated caches. Key authenticated caches by the stable Supabase user ID, never by email, display name or active degree. Keep the theme as a global preference; keep activeDegreeId local to each guest/account scope and validate it against that scope's document.

On sign-out, show the separate guest workspace. On account change, cancel timers, dispose the previous sync controller, invalidate in-flight results and switch cache/history/UI scope before accepting edits. A missing cloud row in account B must never cause automatic upload of account A's last visible document.

An existing guest plan may be copied into an authenticated account only through an explicit action. If local and cloud documents differ, preserve both and offer a concrete choice: use cloud, or replace cloud with the local document after confirmation and a fresh revision check. Automatic merging is out of scope.

Recognize known unchanged cached cloud snapshots so ordinary sign-in does not require an unnecessary prompt. When provenance or reconciliation is uncertain, preserve both documents and pause writes.

### Older-client compatibility and release gate

The current pre-version-4 client can load a legacy plan, normalize unknown data or write a single-degree payload. A revision check prevents some concurrent writes but does not by itself enforce document-version compatibility. An older client can read a current revision and still submit an incompatible document.

Before release, audit the deployed legacy reader and writer against a version 4 document. Add a regression scenario in which a legacy writer attempts to save after migration.

Preferred protection is a server-enforced monotonic document-version rule: after an account's row becomes version 4, reject writes reverting it to an unversioned or older document. Preserve RLS, owner isolation, revision checks and serialized writes. If necessary, prepare a minimal, separately reviewed database guard/migration and rollback instructions; do not apply it to production automatically. Validate it in an isolated test environment.

Version 4 clients must safely reject future versions and pause writes without normalizing them to defaults. Explain how a user can update an outdated client.

Keeping one JSON row per account remains the chosen architecture. A server-side compatibility guard is an allowed exception to avoiding schema/backend changes when required to protect migrated data. If that guard cannot be installed, document that guaranteed protection from old writers is unavailable and treat production rollout as blocked pending an explicit user decision on the residual risk. Asking users to reload tabs is a supplementary measure, not a guarantee.

## 11. Tests and validation

Add or update automated tests for the complete feature.

Cover at least:

### Migration
- Legacy local data converts correctly.
- Existing notes, grades and colors survive.
- Old JSON exports remain supported.
- Repeated migration does not duplicate degrees.
- Unsupported versions are handled safely.

### State management
- Multiple degrees can be created.
- Degrees have unique IDs.
- Switching preserves state.
- Changes in one degree do not affect others.
- Deleting a degree does not delete unrelated data.
- Undo does not corrupt other degrees.

### Progress calculations
- ECTS are calculated independently.
- Grade averages remain degree-specific.
- Requirements exceeding 30 ECTS are valid.
- Global dashboard totals aggregate correctly.
- Excluded requirements remain excluded.

### Persistence
- Page reload preserves every degree.
- JSON export/import roundtrip preserves the full data structure.
- Cloud synchronization preserves multiple degrees.
- Concurrent sessions cannot silently overwrite each other.
- Account switching does not leak data across accounts.

### Additional safety acceptance tests
- Semester/requirement renaming preserves ID-based module associations.
- Ambiguous legacy references preserve modules through recovery or abort safely.
- Duplicate IDs in one scope are rejected; identical IDs in separate degrees remain isolated.
- The initial 180/120/custom ECTS category determines the displayed total.
- Updating, excluding or splitting categories updates the target consistently.
- Storage failures and interrupted migration cannot replace source data with partial/default state.
- Guest, account A and account B retain distinct data and active-degree selections.
- Account B with no cloud row never receives account A data automatically.
- In-flight loads/saves from a previous account cannot affect the active account.
- Differing local/cloud documents preserve both until an explicit choice.
- Invalid imports, canceled restores and failed persistence leave the current document unchanged.
- Legacy single-degree restore into a multi-degree document requires explicit replacement confirmation.
- Switching degrees alone produces no cloud save and no undo entry.
- Switching with an unsaved module/note draft supports Save / Discard / Cancel correctly.
- Switching during drag-and-drop or after a delayed callback never edits the wrong degree.
- Legacy note expansion state survives migration and cannot leak across degrees.
- Legacy-client downgrade writes are rejected by the compatibility guard in an isolated environment.
- A future-version document pauses reads/writes safely in the new client.

### Existing functionality
- Drag-and-drop still works.
- Module editing still works.
- Notes remain functional.
- Requirement configuration remains functional.
- Color palettes work.
- The original single-degree experience remains usable.

Run:

```bash
npm test
npm run build
```

Fix any failures introduced by the implementation.

If browser tests are available, run relevant UI checks as well.

Do not claim successful browser or production cloud validation unless those checks were actually performed.

## 12. Explicit non-goals

Do not implement the following features in this release:

- Cross-degree module recognition or shared modules
- Automatic credit transfer
- Combined semester timeline
- Exam calendar
- Timetable synchronization
- University-specific curriculum import
- AI-based study planning
- New account providers
- A complete UI redesign

Focus on a robust, complete and polished Multi-Degree implementation.

The architecture may accommodate these features later, but they must not delay or complicate the initial implementation unnecessarily.

## 13. Implementation strategy

Implement this as one complete feature in a dedicated branch, such as:

`feature/multi-degree-support`

Organize the work internally into these phases:

1. Analyze existing architecture and identify compatibility constraints.
2. Design the versioned data model, stable references, ECTS rules, account-scoped storage and migration. Add migration/import/cloud-compatibility tests alongside this work, including the legacy-writer release gate.
3. Refactor planner state management.
4. Build degree creation, selection and management.
5. Implement the Multi-Degree Dashboard.
6. Complete persistence, full-backup restore and Supabase reconciliation, building on the validation and compatibility work already tested with the model.
7. Integrate and polish the UI.
8. Complete automated and browser coverage, including draft switching, account isolation and compatibility protection; fix regressions. Tests must be developed throughout the earlier phases, not deferred to this step.
9. Run the full test suite and production build.
10. Review the final implementation for data-loss risks and incomplete functionality.

Do not stop after an intermediate phase.

Make pragmatic decisions independently rather than requesting confirmation for routine implementation details.

Avoid unrelated refactoring and feature additions.

Do not modify production user data, deploy to production or merge into `main` automatically.

## 14. Definition of Done

The feature is complete when the following user journey works:

1. An existing StudyPlanner user opens the updated application.
2. Their previous single-degree plan is still present with all data.
3. They create a second degree, e.g. B.Sc. Mathematik.
4. They configure its requirements and add modules.
5. They switch back to M.Sc. Informatik.
6. The original Informatik plan is unchanged.
7. They switch between both degrees repeatedly without data loss.
8. They open the global overview and see both degree progress bars.
9. Every degree reports its own ECTS and average grade correctly.
10. They reload the browser and both degrees remain intact.
11. They export all degrees as one JSON file.
12. They import that file and restore the full configuration.
13. They sign in with their Google account and both degrees synchronize safely.
14. On another device, the same account can retrieve both degrees.
15. All existing StudyPlanner functionality continues to work.
16. Renaming requirements or semesters preserves module membership.
17. Degree switching with an open edit dialog cannot lose drafts or update the wrong degree.
18. Signing out and switching between two test accounts never transfers data without an explicit action.
19. Restoring a legacy backup clearly confirms replacement of all existing degrees.
20. Compatibility protection prevents an older client from overwriting a migrated version 4 document, verified in an isolated environment before production rollout.

## Final deliverables

After implementation, provide:

- A summary of the architectural changes.
- A list of added and modified files.
- An explanation of the legacy migration behavior.
- The new degree-management workflow.
- A description of how the cloud sync handles multiple degrees.
- Automated test results and build results.
- Any limitations or remaining risks, including older-client compatibility evidence, storage-failure recovery and account-switch validation.
- Instructions for reviewing and testing the feature manually.

If GitHub permissions allow it, create a Pull Request for review.

**The expected result is a fully functioning Multi-Degree StudyPlanner, not only a proposal, prototype or partial implementation.**