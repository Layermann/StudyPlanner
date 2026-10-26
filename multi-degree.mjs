import { DEFAULT_REQUIREMENTS, DEFAULT_SEMESTERS, DEFAULT_TITLE, STATUSES, isValidCredits, isValidRequirementCredits, isValidGrade, parseNumberInput } from './planner-model.mjs';
import { normalizeTheme, normalizeNotes, normalizeColor } from './planner-preferences.mjs';

export const VERSION = 4;
export const uid = () => crypto.randomUUID();
const clone = value => JSON.parse(JSON.stringify(value));
const requireValue = (condition, message) => { if (!condition) throw new Error(message); };
const text = value => typeof value === 'string' && value.trim().length > 0;
const unique = (items, label) => {
  requireValue(Array.isArray(items), `Invalid ${label}`);
  requireValue(items.every(item => item && text(item.id)), `Missing ${label} ID`);
  requireValue(new Set(items.map(item => item.id)).size === items.length, `Duplicate ${label} IDs`);
};

export function createDegree(title, type = 'other', credits = 120) {
  requireValue(text(title) && ['bachelor', 'master', 'other'].includes(type) && isValidRequirementCredits(credits), 'Enter a name, degree type and positive ECTS target.');
  return { id: uid(), title: title.trim(), type, semesters: [{ id: uid(), title: 'Semester 1' }], requirements: [{ id: uid(), title: 'Studienleistungen', requiredCredits: parseNumberInput(credits), countTowardsTotal: true, color: null }], modules: [] };
}

function validateNotes(notes) {
  unique(notes, 'note');
  requireValue(notes.every(note => typeof note.title === 'string' && typeof note.text === 'string' && typeof note.expanded === 'boolean' && ['small', 'medium', 'large'].includes(note.size) && normalizeColor(note.color)), 'Invalid notes');
}

export function validateDocument(value) {
  requireValue(value && value.version === VERSION, 'Unsupported plan version. Update the application before opening this plan.');
  requireValue(typeof value.theme === 'string' && normalizeTheme(value.theme) === value.theme, 'Invalid theme');
  unique(value.degrees, 'degree');
  requireValue(value.degrees.length > 0, 'At least one degree is required');
  for (const degree of value.degrees) {
    requireValue(text(degree.title) && ['bachelor', 'master', 'other'].includes(degree.type), 'Invalid degree');
    unique(degree.semesters, 'semester'); unique(degree.requirements, 'requirement'); unique(degree.modules, 'module');
    requireValue(degree.semesters.length > 0 && degree.requirements.length > 0, 'A degree needs a semester and a requirement');
    for (const items of [degree.semesters, degree.requirements]) {
      requireValue(items.every(item => text(item.title)), 'Invalid title');
      requireValue(new Set(items.map(item => item.title)).size === items.length, 'Duplicate titles within a degree');
    }
    requireValue(degree.requirements.every(req => typeof req.requiredCredits === 'number' && isValidRequirementCredits(req.requiredCredits) && typeof req.countTowardsTotal === 'boolean' && (req.color === null || normalizeColor(req.color))), 'Invalid requirement credits or appearance');
    requireValue(Number.isFinite(degree.requirements.reduce((sum, req) => sum + req.requiredCredits, 0)), 'ECTS total is too large');
    for (const module of degree.modules) {
      requireValue(text(module.name) && degree.semesters.some(sem => sem.id === module.semesterId) && degree.requirements.some(req => req.id === module.requirementId), 'Invalid module references');
      requireValue(typeof module.credits === 'number' && isValidCredits(module.credits) && STATUSES.includes(module.status) && isValidGrade(module.grade) && (module.grade === '' || typeof module.grade === 'number') && Number.isSafeInteger(module.order) && module.order >= 0, 'Invalid module credits, status, grade or ordering');
      validateNotes(module.notes);
    }
  }
  return clone({ version: VERSION, theme: value.theme, degrees: value.degrees });
}

// Explicit legacy adapter: never run malformed or future data through defaulting normalizers.
export function readDocument(value) {
  requireValue(value && typeof value === 'object' && !Array.isArray(value), 'Invalid plan document');
  if (value.version === VERSION) return validateDocument(value);
  requireValue(value.version == null || [1, 2, 3].includes(value.version), 'Unsupported plan version. Update the application.');
  requireValue(Array.isArray(value.modules) && Array.isArray(value.semesters) && value.semesters.length > 0 && Array.isArray(value.requirements) && value.requirements.length > 0, 'Invalid legacy plan');
  const semesters = value.semesters.map((title, index) => { requireValue(text(title), 'Invalid legacy semester'); return { id: `semester-${index}`, title: title.trim() }; });
  requireValue(new Set(semesters.map(sem => sem.title)).size === semesters.length, 'Ambiguous legacy semesters; original data retained');
  const requirements = value.requirements.map((req, index) => {
    requireValue(req && text(req.title) && isValidRequirementCredits(req.requiredCredits), 'Invalid legacy requirement');
    requireValue(req.color == null || normalizeColor(req.color), 'Invalid legacy requirement color');
    return { ...req, id: req.id ? String(req.id) : `requirement-${index}`, title: req.title.trim(), requiredCredits: parseNumberInput(req.requiredCredits), countTowardsTotal: req.countTowardsTotal !== false, color: normalizeColor(req.color) };
  });
  requireValue(new Set(requirements.map(req => req.title)).size === requirements.length, 'Ambiguous legacy requirements; original data retained');
  const modules = value.modules.map((module, index) => {
    requireValue(module && text(module.name) && isValidCredits(module.credits) && STATUSES.includes(module.status) && isValidGrade(module.grade ?? ''), 'Invalid legacy module; original data retained');
    const semester = semesters.find((sem, i) => value.semesters[i] === module.semester);
    const requirement = requirements.find((req, i) => value.requirements[i].title === module.container);
    // Aborting preserves the complete original rather than guessing membership.
    requireValue(semester && requirement, 'Unmatched legacy module reference; original data retained. Correct the source or restore a valid backup.');
    requireValue(module.notes == null || typeof module.notes === 'string' || typeof module.notes === 'object', 'Invalid legacy notes');
    const originalNotes = module.notes == null ? [] : Array.isArray(module.notes) ? module.notes : [module.notes];
    requireValue(originalNotes.every(note => typeof note === 'string' || (note && typeof note === 'object' && !Array.isArray(note) && (note.text == null || typeof note.text === 'string') && (note.title == null || typeof note.title === 'string') && (note.color == null || normalizeColor(note.color)) && (note.size == null || ['small', 'medium', 'large'].includes(note.size)) && (note.expanded == null || typeof note.expanded === 'boolean'))), 'Invalid legacy notes; original data retained');
    const notes = normalizeNotes(module.notes);
    // The old editor limited display titles; migration must not truncate source text.
    notes.forEach((note, i) => {
      const original = originalNotes[i];
      if (text(original?.id)) note.id = original.id;
      if (typeof original?.title === 'string') note.title = original.title;
    });
    return { ...module, id: module.id ? String(module.id) : `module-${index}`, semesterId: semester.id, requirementId: requirement.id, credits: parseNumberInput(module.credits), grade: module.grade == null || module.grade === '' ? '' : parseNumberInput(module.grade), order: Number.isSafeInteger(module.order) && module.order >= 0 ? module.order : index, notes };
  }).map(({ semester, container, ...module }) => module);
  return validateDocument({ version: VERSION, theme: normalizeTheme(value.theme), degrees: [{ id: 'legacy-degree', title: text(value.plannerTitle) ? value.plannerTitle : DEFAULT_TITLE, type: 'master', semesters, requirements, modules }] });
}

export function initialDocument(theme = 'midnight', modules = []) {
  return readDocument({ version: 3, theme, plannerTitle: DEFAULT_TITLE, semesters: DEFAULT_SEMESTERS, requirements: DEFAULT_REQUIREMENTS, modules });
}

// Compatibility boundary for the existing single-degree editing components.
// Persisted relationships always use IDs; names exist only in the derived view.
export function degreeView(degree) {
  return { plannerTitle: degree.title, semesters: degree.semesters.map(sem => sem.title), requirements: degree.requirements, modules: degree.modules.map(module => ({ ...module, semester: degree.semesters.find(sem => sem.id === module.semesterId).title, container: degree.requirements.find(req => req.id === module.requirementId).title })) };
}
export function modulesFromView(modules, degree, previous = degree.modules) {
  return modules.map(module => {
    const old = previous.find(item => item.id === module.id);
    const semesterId = degree.semesters.find(sem => sem.title === module.semester)?.id ?? old?.semesterId;
    const requirementId = degree.requirements.find(req => req.title === module.container)?.id ?? old?.requirementId;
    const { semester, container, ...data } = module;
    return { ...data, semesterId, requirementId, notes: data.notes ?? [] };
  });
}

export function degreeStats(degree) {
  const included = degree.requirements.filter(req => req.countTowardsTotal !== false);
  const ids = new Set(included.map(req => req.id));
  const modules = degree.modules.filter(module => ids.has(module.requirementId));
  const sum = status => modules.filter(module => module.status === status).reduce((total, module) => total + module.credits, 0);
  const graded = modules.filter(module => module.status === 'Completed' && typeof module.grade === 'number');
  const gradedCredits = graded.reduce((total, module) => total + module.credits, 0);
  return { required: included.reduce((total, req) => total + req.requiredCredits, 0), completed: sum('Completed'), inProgress: sum('In Progress'), planned: sum('Planned'), average: gradedCredits ? graded.reduce((total, module) => total + module.grade * module.credits, 0) / gradedCredits : null };
}

export function viewStats(modules, requirements) {
  return degreeStats({ requirements, modules: modules.map(module => ({ ...module, requirementId: requirements.find(req => req.title === module.container)?.id })) });
}

export function replaceDegree(document, id, update) {
  requireValue(document.degrees.some(degree => degree.id === id), 'Degree no longer exists');
  return validateDocument({ ...document, degrees: document.degrees.map(degree => degree.id === id ? update(clone(degree)) : degree) });
}
