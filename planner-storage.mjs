import { VERSION, createDegree, initialDocument, readDocument, validateDocument } from './multi-degree.mjs';
import { normalizeTheme } from './planner-preferences.mjs';

export const workspaceKey = (prefix, owner) => `${prefix}studyPlanner:v4:${owner ? `account:${owner}` : 'guest'}`;
export const backupKey = key => `${key}:recovery`;
export const serializePlan = document => JSON.stringify(document);
export function saveWorkspace(storage, key, workspace, backup = false) {
  validateDocument(workspace.document);
  if (!workspace.document.degrees.some(degree => degree.id === workspace.activeDegreeId)) throw new Error('Invalid active degree');
  const serialized = JSON.stringify(workspace);
  if (backup) {
    const previous = storage.getItem(key);
    if (previous) {
      // Keep earlier recovery points too: a subsequent cloud reload must not
      // destroy the only copy of the local document the user just replaced.
      storage.setItem(`${backupKey(key)}:${crypto.randomUUID()}`, previous);
      storage.setItem(backupKey(key), previous);
    }
  }
  // One write commits the whole document, migration marker and provenance.
  storage.setItem(key, serialized);
}

export function loadWorkspace(storage, prefix, owner, theme, demoModules = null) {
  const key = workspaceKey(prefix, owner);
  const raw = storage.getItem(key);
  if (raw != null) {
    const saved = JSON.parse(raw);
    const document = readDocument(saved.document);
    return { ...saved, document, activeDegreeId: document.degrees.some(degree => degree.id === saved.activeDegreeId) ? saved.activeDegreeId : document.degrees[0].id };
  }
  let document;
  let migrated = false;
  const source = {};
  if (!owner) {
    const keys = { modules: 'studyPlannerModulesMScInformatik', semesters: 'studyPlannerSemestersMScInformatik', plannerTitle: 'studyPlannerTitleMScInformatik', requirements: 'studyPlannerRequirementsMScInformatik' };
    for (const [field, suffix] of Object.entries(keys)) source[field] = storage.getItem(prefix + suffix);
    if (Object.values(source).some(value => value !== null)) {
      const defaults = initialDocument(theme);
      const old = {
        version: 3, theme,
        plannerTitle: source.plannerTitle ?? defaults.degrees[0].title,
        modules: source.modules === null ? [] : JSON.parse(source.modules),
        semesters: source.semesters === null ? defaults.degrees[0].semesters.map(sem => sem.title) : JSON.parse(source.semesters),
        requirements: source.requirements === null ? defaults.degrees[0].requirements : JSON.parse(source.requirements),
      };
      document = readDocument(old);
      migrated = true;
      storage.setItem(`${key}:legacy-source`, JSON.stringify(source));
    }
  }
  if (!document) document = demoModules && !owner ? initialDocument(theme, demoModules) : { version: VERSION, theme: normalizeTheme(theme), degrees: [createDegree('Mein Studium', 'other', 120)] };
  const workspace = { document, activeDegreeId: document.degrees[0].id, dirty: migrated, baseline: null, migration: migrated ? 'legacy-to-v4' : null };
  saveWorkspace(storage, key, workspace);
  return workspace;
}

export function reconciliation(local, remote) {
  if (!remote) return local.dirty ? 'confirm-local' : 'ready';
  const cloud = serializePlan(remote);
  if (serializePlan(local.document) === cloud) return 'equal';
  if (!local.dirty) return 'cloud';
  // Even a known baseline does not authorize replacing divergent documents.
  return 'conflict';
}
