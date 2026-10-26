import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { normalizeTheme } from '../planner-preferences.mjs';
import { IS_DEMO, KEY_PREFIX, THEME_STORAGE_KEY, DEMO_MODULES } from '../planner-config.mjs';
import { groupBy, sortModulesForDisplay, resequenceModules, isValidCredits, isValidGrade, parseNumberInput } from '../planner-model.mjs';
import { createDegree, degreeView, modulesFromView, readDocument, replaceDegree, uid } from '../multi-degree.mjs';
import { loadWorkspace, saveWorkspace, workspaceKey, backupKey, serializePlan } from '../planner-storage.mjs';

const unavailableStorage = {
  getItem() { throw new Error('Browser storage is unavailable'); },
  setItem() { throw new Error('Browser storage is unavailable'); },
  get length() { return 0; },
};
const browserStorage = () => {
  try { return window.localStorage; } catch { return unavailableStorage; }
};

export function downloadJSON(value, filename = 'study-planner-export.json') {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function usePlanner(owner = null, options = {}) {
  const storage = options.storage ?? browserStorage();
  const prefix = options.prefix ?? KEY_PREFIX;
  const scope = workspaceKey(prefix, owner);
  const load = () => {
    try {
      const workspace = loadWorkspace(storage, prefix, owner, storage.getItem(THEME_STORAGE_KEY), options.demoModules ?? (IS_DEMO ? DEMO_MODULES : null));
      return { scope, workspace, raw: storage.getItem(scope), error: null };
    } catch (error) { return { scope, workspace: null, error: `Lokale Daten konnten nicht sicher geladen werden: ${error.message}` }; }
  };
  const [state, setState] = useState(load);
  const [storageError, setStorageError] = useState(null);
  const [viewRevision, setViewRevision] = useState(0);
  // Reset during render, before children can receive data belonging to another account.
  let current = state;
  if (state.scope !== scope) { current = load(); setState(current); }
  const ref = useRef(current); ref.current = current;
  const history = useRef(new Map());
  const workspace = current.workspace;
  const document = workspace?.document;
  const active = document?.degrees.find(degree => degree.id === workspace.activeDegreeId);
  const view = active ? degreeView(active) : { plannerTitle: '', semesters: [], requirements: [], modules: [] };
  const epochRef = useRef(0);
  const lastScope = useRef(scope);
  if (lastScope.current !== scope) { lastScope.current = scope; epochRef.current++; history.current.clear(); }
  const epoch = epochRef.current;
  const currentSnapshotRef = useRef(null);
  currentSnapshotRef.current = document ? serializePlan(document) : null;

  const commit = useCallback((transform, backup = false) => {
    const before = ref.current;
    if (before.scope !== scope || !before.workspace) return false;
    try {
      if (storage.getItem(scope) !== before.raw) {
        throw new Error('Der lokale Plan wurde in einem anderen Tab geändert. Exportiere diesen Stand und lade die Seite neu');
      }
      const next = transform(before.workspace);
      if (next === before.workspace) return true;
      saveWorkspace(storage, scope, next, backup);
      const state = { ...before, workspace: next, raw: JSON.stringify(next) };
      ref.current = state; currentSnapshotRef.current = serializePlan(next.document); setState(state); setStorageError(null);
      return true;
    } catch (error) { setStorageError(`Speichern fehlgeschlagen. Die Änderung wurde nicht übernommen: ${error.message}. Bitte exportiere deinen Stand.`); return false; }
  }, [scope, storage]);

  const edit = transform => {
    if (epochRef.current !== epoch || ref.current.scope !== scope || ref.current.workspace?.activeDegreeId !== active?.id) return false;
    const before = ref.current.workspace.document.degrees.find(degree => degree.id === active.id);
    let changed = false;
    const success = commit(saved => {
      const document = replaceDegree(saved.document, active.id, transform);
      if (serializePlan(document) === serializePlan(saved.document)) return saved;
      changed = true;
      return { ...saved, dirty: true, document };
    });
    if (success && changed) {
      const entries = history.current.get(active.id) ?? [];
      entries.push(before); if (entries.length > 100) entries.shift(); history.current.set(active.id, entries);
    }
    return success;
  };
  const setModules = update => edit(degree => {
    const modules = degreeView(degree).modules;
    return { ...degree, modules: modulesFromView(typeof update === 'function' ? update(modules) : update, degree) };
  });
  const setRequirements = update => edit(degree => ({ ...degree, requirements: (typeof update === 'function' ? update(degree.requirements) : update).map(req => ({ ...req, color: req.color ?? null, countTowardsTotal: req.countTowardsTotal !== false })) }));
  const setSemesters = update => edit(degree => {
    const names = degree.semesters.map(sem => sem.title);
    return { ...degree, semesters: (typeof update === 'function' ? update(names) : update).map(title => degree.semesters.find(sem => sem.title === title) ?? { id: uid(), title }) };
  });
  const setTheme = theme => {
    const normalized = normalizeTheme(theme);
    if (commit(saved => ({ ...saved, dirty: true, document: { ...saved.document, theme: normalized } }))) {
      try { storage.setItem(THEME_STORAGE_KEY, normalized); } catch { /* Full document remains authoritative. */ }
    }
  };
  useEffect(() => {
    document && (window.document.documentElement.dataset.palette = document.theme);
  }, [document?.theme]);

  const selectDegree = id => {
    if (ref.current.scope !== scope || epochRef.current !== epoch || !ref.current.workspace?.document.degrees.some(degree => degree.id === id)) return false;
    if (ref.current.workspace.activeDegreeId === id) return true;
    const success = commit(saved => ({ ...saved, activeDegreeId: id }));
    if (success) { epochRef.current++; setViewRevision(value => value + 1); }
    return success;
  };
  const addDegree = (title, type, credits) => {
    if (ref.current.scope !== scope || epochRef.current !== epoch) return false;
    const degree = createDegree(title, type, credits);
    if (commit(saved => ({ ...saved, dirty: true, activeDegreeId: degree.id, document: { ...saved.document, degrees: [...saved.document.degrees, degree] } }))) { epochRef.current++; setViewRevision(value => value + 1); return true; }
    return false;
  };
  const deleteDegree = id => {
    if (ref.current.scope !== scope || epochRef.current !== epoch || ref.current.workspace.document.degrees.length < 2 || !ref.current.workspace.document.degrees.some(degree => degree.id === id)) return false;
    const success = commit(saved => ({ ...saved, dirty: true, activeDegreeId: saved.activeDegreeId === id ? saved.document.degrees.find(degree => degree.id !== id).id : saved.activeDegreeId, document: { ...saved.document, degrees: saved.document.degrees.filter(degree => degree.id !== id) } }), true);
    if (success) { epochRef.current++; history.current.clear(); setViewRevision(value => value + 1); } return success;
  };
  const updateDegree = (title, type = active.type) => {
    if (ref.current.scope !== scope || epochRef.current !== epoch) return false;
    const saved = commit(workspace => ({ ...workspace, dirty: true, document: replaceDegree(workspace.document, active.id, degree => ({ ...degree, title, type })) }));
    if (saved) history.current.delete(active.id);
    return saved;
  };
  const updateModule = (id, updates) => setModules(modules => modules.map(module => module.id === id ? { ...module, ...updates } : module));
  const removeSemester = title => {
    if (view.semesters.length <= 1) return false;
    if (view.modules.some(module => module.semester === title)) {
      window.alert('Please move or delete the modules in this semester before removing it.');
      return false;
    }
    return setSemesters(names => names.filter(name => name !== title));
  };
  const renameSemester = (old, title) => {
    title = title.trim();
    if (!title || title === old) return false;
    if (view.semesters.includes(title)) {
      window.alert('A semester with this name already exists.');
      return false;
    }
    return edit(degree => ({ ...degree, semesters: degree.semesters.map(sem => sem.title === old ? { ...sem, title } : sem) }));
  };
  const applyCloudPlan = useCallback(payload => {
    const next = readDocument(payload);
    const success = commit(saved => ({ ...saved, document: next, activeDegreeId: next.degrees.some(degree => degree.id === saved.activeDegreeId) ? saved.activeDegreeId : next.degrees[0].id, dirty: false, baseline: serializePlan(next) }), true);
    if (!success) throw new Error('Local cloud cache could not be saved');
    epochRef.current++; history.current.clear(); setViewRevision(value => value + 1);
    return next;
  }, [commit]);
  const markSynced = useCallback(snapshot => commit(saved => ({ ...saved, baseline: snapshot, dirty: serializePlan(saved.document) !== snapshot })), [commit]);
  const getWorkspace = useCallback(() => ref.current.scope === scope ? ref.current.workspace : null, [scope]);
  const handleExport = () => document && downloadJSON({ ...document, exportedAt: new Date().toISOString() });
  const handleImportFile = async event => {
    const input = event.target; const file = input.files?.[0]; input.value = '';
    if (!file || !document) return;
    const capturedEpoch = epochRef.current;
    try {
      const next = readDocument(JSON.parse(await file.text()));
      if (ref.current.scope !== scope || epochRef.current !== capturedEpoch) throw new Error('Workspace changed. Please import again.');
      if (!window.confirm(`Vollständiges Backup wiederherstellen? ${next.degrees.length} Studiengänge (${next.degrees.map(degree => degree.title).join(', ')}) ersetzen ALLE ${document.degrees.length} aktuellen Studiengänge. Auch ein altes Backup ersetzt den gesamten Plan.`)) return;
      if (window.confirm('Den aktuellen Stand vor dem Ersetzen zusätzlich als JSON herunterladen?')) handleExport();
      if (commit(saved => ({ ...saved, dirty: true, document: next, activeDegreeId: next.degrees[0].id }), true)) { epochRef.current++; history.current.clear(); setViewRevision(value => value + 1); }
    } catch (error) { window.alert(`Import nicht durchgeführt: ${error.message}`); }
  };
  const recoverFromFile = async event => {
    const input = event.target;
    const file = input.files?.[0]; input.value = '';
    if (!file || ref.current.scope !== scope || ref.current.workspace) return;
    try {
      const next = readDocument(JSON.parse(await file.text()));
      if (ref.current.scope !== scope || ref.current.workspace) return;
      if (!window.confirm('Diesen gültigen Plan statt der unlesbaren lokalen Daten laden? Die bisherigen Rohdaten werden vor dem Ersetzen gesichert.')) return;
      const workspace = { document: next, activeDegreeId: next.degrees[0].id, dirty: true, baseline: null };
      saveWorkspace(storage, scope, workspace, true);
      const state = { scope, workspace, raw: JSON.stringify(workspace), error: null }; ref.current = state; setState(state);
      epochRef.current++; history.current.clear(); setViewRevision(value => value + 1);
    } catch (error) { window.alert(`Wiederherstellung nicht durchgeführt: ${error.message}`); }
  };
  const restoreRecovery = () => {
    try {
      const raw = storage.getItem(backupKey(scope));
      if (!raw) throw new Error('Kein Wiederherstellungspunkt vorhanden.');
      const recovered = JSON.parse(raw); const next = readDocument(recovered.document);
      if (!window.confirm('Den letzten lokalen Wiederherstellungspunkt laden? Der aktuelle Stand wird vorher gesichert. Cloud-Speichern bleibt bei einem Konflikt pausiert.')) return;
      if (commit(saved => ({ ...saved, document: next, dirty: true, activeDegreeId: next.degrees[0].id }), true)) { epochRef.current++; history.current.clear(); setViewRevision(value => value + 1); }
    } catch (error) { window.alert(error.message); }
  };
  const exportRecovery = () => {
    const values = {};
    // Export only this scope, plus legacy guest keys when appropriate.
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key === scope || key.startsWith(`${scope}:`) || (!owner && [ 'studyPlannerModulesMScInformatik', 'studyPlannerSemestersMScInformatik', 'studyPlannerTitleMScInformatik', 'studyPlannerRequirementsMScInformatik' ].some(suffix => key === prefix + suffix))) values[key] = storage.getItem(key);
    }
    downloadJSON(values, 'study-planner-recovery.json');
  };
  const undo = () => {
    if (ref.current.scope !== scope || epochRef.current !== epoch || ref.current.workspace?.activeDegreeId !== active?.id) return;
    const entries = history.current.get(active?.id); if (!entries?.length) return;
    const previous = entries[entries.length - 1];
    if (commit(saved => ({ ...saved, dirty: true, document: replaceDegree(saved.document, active.id, () => previous) }))) entries.pop();
  };
  useEffect(() => {
    const onKeyDown = event => {
      if (event.target.closest?.('input, textarea, select, [contenteditable=true]')) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); undo(); }
    };
    window.addEventListener('keydown', onKeyDown); return () => window.removeEventListener('keydown', onKeyDown);
  });
  const orderedModules = useMemo(() => sortModulesForDisplay(view.modules, view.semesters), [active]);
  return {
    ...view, document, scope, owner, activeDegreeId: active?.id, degrees: document?.degrees ?? [], workspace,
    viewKey: `${scope}:${active?.id}:${viewRevision}`, storageError: current.error || storageError, blocked: !workspace,
    getWorkspace, markSynced, applyCloudPlan, currentSnapshotRef,
    selectDegree, addDegree, deleteDegree, updateDegree,
    theme: document?.theme ?? 'midnight', setTheme, setPlannerTitle: title => updateDegree(title), setModules, setRequirements, setSemesters,
    containerTitles: view.requirements.map(req => req.title), orderedModules,
    modulesBySemester: groupBy(orderedModules, module => module.semester), modulesByContainer: groupBy(orderedModules, module => module.container),
    addModule: module => setModules(modules => resequenceModules(sortModulesForDisplay([...modules, { id: uid(), ...module, notes: [], order: Number.MAX_SAFE_INTEGER }], view.semesters))),
    deleteModule: id => setModules(modules => resequenceModules(sortModulesForDisplay(modules.filter(module => module.id !== id), view.semesters))), updateModule,
    moveContainer: (id, container) => updateModule(id, { container }),
    updateCredits: (id, value) => { if (isValidCredits(value)) updateModule(id, { credits: parseNumberInput(value) }); else window.alert('Enter module ECTS greater than 0 and at most 30.'); },
    updateGrade: (id, value) => { if (isValidGrade(value)) updateModule(id, { grade: value === '' ? '' : parseNumberInput(value) }); else window.alert('Please enter a valid grade.'); },
    toggleStatus: id => setModules(modules => modules.map(module => module.id !== id ? module : { ...module, status: module.status === 'Planned' ? 'In Progress' : module.status === 'In Progress' ? 'Completed' : 'Planned', grade: module.status === 'In Progress' ? module.grade : '' })),
    addSemester: () => setSemesters(names => { let n = names.length + 1; while (names.includes(`Semester ${n}`)) n++; return [...names, `Semester ${n}`]; }),
    removeSemester, renameSemester,
    handleExport, handleImportFile, recoverFromFile, restoreRecovery, exportRecovery, undo,
  };
}
