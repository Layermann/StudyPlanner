import { normalizeNotes } from './planner-preferences.mjs';

export const IS_DEMO = import.meta.env.DEV && new URLSearchParams(location.search).has('demo');
export const KEY_PREFIX = IS_DEMO ? 'demo:' : '';
export const THEME_STORAGE_KEY = KEY_PREFIX + 'studyPlannerTheme';
export const STORAGE_KEY = KEY_PREFIX + 'studyPlannerModulesMScInformatik';
export const SEMESTER_STORAGE_KEY = KEY_PREFIX + 'studyPlannerSemestersMScInformatik';
export const TITLE_STORAGE_KEY = KEY_PREFIX + 'studyPlannerTitleMScInformatik';
export const REQUIREMENTS_STORAGE_KEY = KEY_PREFIX + 'studyPlannerRequirementsMScInformatik';
export const DEMO_MODULES = [
  ['Theoretische Informatik', 'Semester 1', 'TMG INF', 'Completed', 6, 1.7],
  ['Machine Learning', 'Semester 1', 'MINF', 'Completed', 6, 1.3],
  ['Advanced Algorithms', 'Semester 1', 'MINF', 'In Progress', 6, ''],
  ['Reinforcement Learning', 'Semester 2', 'Vertiefungslinie', 'In Progress', 6, ''],
  ['Hauptseminar: KI', 'Semester 2', 'Hauptseminar', 'Planned', 3, ''],
  ['Distributed Systems', 'Semester 3', 'Ergaenzende Spezialisierungsmodule', 'Planned', 6, ''],
  ['Masterarbeit', 'Semester 4', 'Masterarbeit', 'Planned', 30, ''],
].map(([name, semester, container, status, credits, grade], i) => ({
  id: `demo-${i}`, name, semester, container, status, credits, grade, order: i,
  notes: normalizeNotes(i === 3 ? { title: 'Prüfung & Materialien', text: 'Übungsblatt 4 bis Freitag bearbeiten.\nLiteratur: Sutton & Barto, Kapitel 6.\nSprechstunde am Dienstag: Fragen zu Q-Learning.', color: '#a78bfa', expanded: true } : null),
}));

