import test from 'node:test';
import assert from 'node:assert/strict';
import { createDegree, initialDocument, readDocument, validateDocument, degreeView, modulesFromView, degreeStats, replaceDegree } from '../multi-degree.mjs';
import { loadWorkspace, saveWorkspace, workspaceKey, backupKey, reconciliation } from '../planner-storage.mjs';
import { isValidCredits, isValidRequirementCredits } from '../planner-model.mjs';
const clone = value => structuredClone(value);
const legacy = () => ({ version: 3, theme: 'midnight', plannerTitle: 'My MSc', semesters: ['Year 1', 'Year 2'], requirements: [{ id: 'r1', title: 'Core', requiredCredits: 120, color: '#123456' }], modules: [{ id: 'm1', name: 'Algorithms', semester: 'Year 2', container: 'Core', status: 'Completed', credits: 6, grade: 1.7, order: 2, notes: { title: 'Exam', text: 'Keep\nall of this', expanded: true, color: '#abcdef', size: 'large' } }] });
class Storage {
  values = new Map(); fail = false;
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { if (this.fail) throw new Error('quota'); this.values.set(key, value); }
  get length() { return this.values.size; } key(index) { return [...this.values.keys()][index]; }
}

test('legacy migration is deterministic and preserves all study and note data', () => {
  const old = legacy(); const original = clone(old); const next = readDocument(old);
  assert.deepEqual(next, readDocument(old)); assert.deepEqual(old, original);
  const d = next.degrees[0]; const m = d.modules[0];
  assert.equal(d.title, old.plannerTitle); assert.equal(d.requirements[0].requiredCredits, 120);
  assert.equal(d.requirements[0].color, '#123456'); assert.equal(m.grade, 1.7); assert.equal(m.order, 2);
  assert.equal(m.semesterId, d.semesters[1].id); assert.equal(m.requirementId, 'r1');
  assert.equal(m.notes[0].expanded, true); assert.equal(m.notes[0].text, 'Keep\nall of this');
  assert.equal(m.notes[0].color, '#abcdef'); assert.equal(m.notes[0].size, 'large');
  delete old.version; assert.deepEqual(readDocument(old), next);
});

test('multi-degree backup roundtrip is lossless including duplicate module IDs across degrees', () => {
  const document = readDocument(legacy()); const other = clone(document.degrees[0]); other.id = 'other'; other.title = 'Other'; document.degrees.push(other);
  assert.deepEqual(readDocument(JSON.parse(JSON.stringify(document))), document);
  const next = replaceDegree(document, other.id, degree => ({ ...degree, title: 'Changed' }));
  assert.deepEqual(next.degrees[0], document.degrees[0]); assert.equal(next.degrees[1].title, 'Changed');
});

test('invalid imports and future versions are rejected instead of becoming defaults', () => {
  for (const value of [null, {}, [], { version: 5, degrees: [] }, { modules: [], semesters: [], requirements: [] }]) assert.throws(() => readDocument(value));
  for (const mutate of [
    d => d.degrees.push(clone(d.degrees[0])),
    d => d.degrees[0].modules.push(clone(d.degrees[0].modules[0])),
    d => { d.degrees[0].modules[0].requirementId = 'missing'; },
    d => { d.degrees[0].modules[0].notes[0].text = 4; },
    d => { d.degrees[0].requirements[0].requiredCredits = 0; },
    d => { d.degrees[0].semesters.push(clone(d.degrees[0].semesters[0])); },
  ]) { const d = readDocument(legacy()); mutate(d); assert.throws(() => validateDocument(d)); }
  const old = legacy(); old.modules[0].container = 'missing'; assert.throws(() => readDocument(old), /Unmatched/);
  old.modules[0].credits = 90; assert.throws(() => readDocument(old), /Invalid legacy module/);
});

test('IDs preserve membership after names change and UI adapters do not persist names', () => {
  const d = readDocument(legacy()).degrees[0]; const original = clone(d.modules);
  d.requirements[0].title = 'Renamed'; d.semesters[1].title = 'Renamed semester';
  const view = degreeView(d); assert.equal(view.modules[0].container, 'Renamed'); assert.equal(view.modules[0].semester, 'Renamed semester');
  assert.deepEqual(modulesFromView(view.modules, d), original);
  view.modules[0].semester = d.semesters[0].title;
  assert.equal(modulesFromView(view.modules, d)[0].semesterId, d.semesters[0].id);
});

test('new degrees have unique identities and independent customizable ECTS', () => {
  const a = createDegree('Bachelor', 'bachelor', 180); const b = createDegree('Master', 'master', 120);
  assert.notEqual(a.id, b.id); assert.notEqual(a.requirements[0].id, b.requirements[0].id);
  assert.equal(degreeStats(a).required, 180); assert.equal(degreeStats(b).required, 120);
  assert.deepEqual(a.modules, []); assert.equal(a.requirements.length, 1);
  assert.equal(a.requirements[0].title, 'Studienleistungen');
  assert.equal(isValidCredits(180), false); assert.equal(isValidRequirementCredits(180), true);
  for (const invalid of ['', 0, -1, Infinity, 'no']) assert.throws(() => createDegree('Other', 'other', invalid));
});

test('degree calculations keep grades independent and excluded credits out', () => {
  const a = readDocument(legacy()).degrees[0]; const b = createDegree('Bachelor', 'bachelor', 180);
  b.modules = [{ ...clone(a.modules[0]), semesterId: b.semesters[0].id, requirementId: b.requirements[0].id, credits: 12, grade: 3 }];
  assert.equal(degreeStats(a).average, 1.7); assert.equal(degreeStats(b).average, 3);
  a.modules.push({ ...clone(a.modules[0]), id: 'm2', status: 'In Progress', grade: '', credits: 9 });
  a.modules.push({ ...clone(a.modules[0]), id: 'm3', status: 'Planned', grade: '', credits: 3 });
  assert.deepEqual(degreeStats(a), { required: 120, completed: 6, inProgress: 9, planned: 3, average: 1.7 });
  a.requirements[0].countTowardsTotal = false;
  assert.deepEqual(degreeStats(a), { required: 0, completed: 0, inProgress: 0, planned: 0, average: null });
});

test('local legacy migration retains keys, source backup and marker and reloads once', () => {
  const storage = new Storage(); const old = legacy();
  for (const [field, suffix] of Object.entries({ modules:'Modules', semesters:'Semesters', requirements:'Requirements', plannerTitle:'Title' })) storage.setItem(`studyPlanner${suffix}MScInformatik`, field === 'plannerTitle' ? old[field] : JSON.stringify(old[field]));
  const before = new Map(storage.values); const workspace = loadWorkspace(storage, '', null, 'midnight');
  for (const [key, value] of before) assert.equal(storage.getItem(key), value);
  assert.equal(workspace.migration, 'legacy-to-v4'); assert.equal(workspace.dirty, true);
  assert.ok(storage.getItem(`${workspaceKey('', null)}:legacy-source`));
  assert.deepEqual(loadWorkspace(storage, '', null, 'midnight'), workspace);
});

test('guest and account caches cannot leak data, including a missing cloud plan', () => {
  const storage = new Storage(); const guest = loadWorkspace(storage, '', null, 'midnight');
  guest.document.degrees[0].title = 'Guest'; guest.dirty = true; saveWorkspace(storage, workspaceKey('', null), guest);
  const a = loadWorkspace(storage, '', 'alice', 'midnight'); a.document.degrees[0].title = 'Private A'; a.dirty = true; saveWorkspace(storage, workspaceKey('', 'alice'), a);
  const b = loadWorkspace(storage, '', 'bob', 'midnight'); assert.equal(b.dirty, false); assert.notEqual(b.document.degrees[0].title, 'Private A');
  assert.equal(reconciliation(b, null), 'ready'); assert.equal(reconciliation(a, null), 'confirm-local');
  assert.equal(loadWorkspace(storage, '', null, 'midnight').document.degrees[0].title, 'Guest');
  assert.notEqual(workspaceKey('demo:', 'alice'), workspaceKey('', 'alice'));
});

test('storage failures preserve the old complete document and recovery points survive later replacements', () => {
  const storage = new Storage(); const key = workspaceKey('', null); const original = loadWorkspace(storage, '', null, 'midnight'); const saved = storage.getItem(key);
  const next = clone(original); next.document.degrees.push(createDegree('Second', 'other', 60));
  storage.fail = true; assert.throws(() => saveWorkspace(storage, key, next, true)); assert.equal(storage.getItem(key), saved);
  storage.fail = false; saveWorkspace(storage, key, next, true); saveWorkspace(storage, key, original, true);
  assert.ok([...storage.values.entries()].some(([k,v]) => k.startsWith(`${backupKey(key)}:`) && v === saved));
  storage.setItem(key, '{bad'); assert.throws(() => loadWorkspace(storage, '', null, 'midnight')); assert.equal(storage.getItem(key), '{bad');
});

test('reconciliation never silently replaces differing dirty local or cloud data', () => {
  const local = { document: initialDocument(), dirty: true }; const remote = initialDocument(); remote.degrees[0].title = 'Cloud';
  assert.equal(reconciliation(local, remote), 'conflict'); assert.equal(reconciliation(local, local.document), 'equal');
  assert.equal(reconciliation({ ...local, dirty: false }, remote), 'cloud');
  assert.equal(reconciliation(local, null), 'confirm-local');
});
