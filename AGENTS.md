# Working on StudyPlaner

- Install with `npm ci`; start with `npm run dev`.
- Run `npm test` and `npm run build` for changes to planner behavior.
- For UI changes, also check the affected flow in the browser.
- `/?demo=1` in development uses separate sample-data storage and disables cloud sync.
- `/tests/browser/notes.html` runs the isolated notes browser smoke test through Vite.
- Preserve existing JSON exports, storage keys, legacy notes and note expansion state.
- Keep local plan state/persistence in `hooks/usePlanner.js` and cloud lifecycle in `hooks/useCloudSync.js`.
- Keep revision checks, load-before-save and serialized writes in `plan-sync.mjs`; do not replace them with blind upserts.
- See `CLOUD-SYNC.md` for cloud guarantees, limitations and the optional live-test procedure.
- Use public browser configuration from `.env.example`; never commit credentials or service-role keys.
- GitHub Pages builds `dist` from source on a push to `main`; deployment is a separate user-requested action.
- Make focused changes and avoid unrelated refactors or new dependencies.
