# StudyPlaner

React/Vite study planner with semester planning, ECTS totals, independent module
notes, JSON import/export and optional Supabase cloud storage.

## Local development

Use Node 22.12+ (Node 20.19+ is also supported by this Vite version).

```sh
npm ci
npm run dev
```

Open the URL printed by Vite. In development, `/?demo=1` provides sample data with
separate browser storage and cloud sync disabled. Demo edits survive a reload.
The ordinary URL uses the regular local plan and optional cloud configuration.

To enable cloud login locally, copy `.env.example` to `.env.local`, fill in the
project's public Supabase URL/publishable key and Google client ID, then restart
Vite. Google login must allow the local origin. Never use a service-role key.

## Validation

```sh
npm test
npm run build
```

With Vite running, open `/tests/browser/notes.html` for the notes browser smoke
test. It checks adding, editing, independent toggles, restoration from persisted
JSON and deleting a single note. It uses its own temporary storage key and removes
that key afterward. The page reports PASS or FAIL.

If a restricted Windows environment prevents the Node test runner from spawning
child processes, run the same tests directly:

```sh
node tests/plan-sync.test.mjs
node tests/planner-preferences.test.mjs
```

These checks do not validate production authentication or Supabase RLS.
See `CLOUD-SYNC.md` for the live-test procedure and sync limitations.

## Code layout

- `study-planer.jsx`: page composition, authentication UI and drag/drop coordination.
- `components/`: notes, module cards/modal, semester columns, requirements,
  ECTS summary, appearance controls and shared inline editing.
- `hooks/usePlanner.js`: local plan state, persistence, edits, import/export and undo.
- `hooks/useCloudSync.js`: cloud loading/saving lifecycle and user-facing sync status.
- `plan-sync.mjs`: Supabase operations, revision conflicts and write serialization.
- `planner-model.mjs`: pure normalization, validation and ordering rules.
- `planner-preferences.mjs`: palettes, custom colors and legacy-note normalization.
- `planner-config.mjs`: browser storage keys and development demo data.
- `supabase/schema.sql`: database schema and access policies.

## Deployment

A push to `main` starts `.github/workflows/deploy-pages.yml`: install dependencies,
run tests, build, then deploy the generated `dist` artifact to GitHub Pages.
The workflow receives its public browser configuration from repository secrets.
Local builds without that configuration run in local-only mode.
