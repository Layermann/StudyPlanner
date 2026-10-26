import { normalizeColor, normalizeNotes } from './planner-preferences.mjs';

export const groupBy = (array, keyFn) => {
  return array.reduce((result, item) => {
    const key = keyFn(item);
    if (!result[key]) {
      result[key] = [];
    }
    result[key].push(item);
    return result;
  }, {});
};

export const DEFAULT_SEMESTERS = ['Semester 1', 'Semester 2', 'Semester 3', 'Semester 4'];
export const DEFAULT_TITLE = 'Study Planner - Master of Science Informatik';
export const DEFAULT_REQUIREMENTS = [
  { id: 'req-tmg-inf', title: 'TMG INF', requiredCredits: 6 },
  { id: 'req-minf', title: 'MINF', requiredCredits: 24 },
  { id: 'req-hauptseminar', title: 'Hauptseminar', requiredCredits: 3 },
  { id: 'req-schluesselqualifikation', title: 'Schluesselqualifikation', requiredCredits: 3 },
  { id: 'req-vertiefungslinie', title: 'Vertiefungslinie', requiredCredits: 24 },
  { id: 'req-ergaenzende', title: 'Ergaenzende Spezialisierungsmodule', requiredCredits: 30 },
  { id: 'req-masterarbeit', title: 'Masterarbeit', requiredCredits: 30 },
];
export const STATUSES = ['Planned', 'In Progress', 'Completed'];
export const VALID_GRADES = ['1.0', '1.3', '1.7', '2.0', '2.3', '2.7', '3.0', '3.3', '3.7', '4.0'];
export const DEFAULT_CREDITS_BY_CONTAINER = {
  'TMG INF': 6,
  MINF: 6,
  Hauptseminar: 3,
  Schluesselqualifikation: 3,
  Vertiefungslinie: 6,
  'Ergaenzende Spezialisierungsmodule': 6,
  Masterarbeit: 30,
};

export const defaultContainerTitles = DEFAULT_REQUIREMENTS.map((requirement) => requirement.title);

export const getDefaultCreditsForContainer = (container) => DEFAULT_CREDITS_BY_CONTAINER[container] ?? 6;

export const normalizeSemesterList = (semesterList) => {
  if (!Array.isArray(semesterList) || semesterList.length === 0) {
    return DEFAULT_SEMESTERS;
  }

  return semesterList
    .filter((semester) => typeof semester === 'string' && semester.trim())
    .map((semester) => semester.trim());
};

export const parseNumberInput = (value) => Number(String(value).replace(',', '.').trim());

export const isValidCredits = (value) => {
  const normalized = String(value).replace(',', '.').trim();
  if (!normalized) {
    return false;
  }

  const parsed = parseNumberInput(normalized);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 30;
};

export const normalizeGradeValue = (value) => {
  const normalizedValue = String(value).replace(',', '.').trim();
  if (normalizedValue === '') {
    return '';
  }

  const numericValue = Number(normalizedValue);
  if (!Number.isFinite(numericValue)) {
    return normalizedValue;
  }

  return VALID_GRADES.find((grade) => Number(grade) === numericValue) ?? normalizedValue;
};

export const isValidGrade = (value) => {
  const normalizedGrade = normalizeGradeValue(value);
  return normalizedGrade === '' || VALID_GRADES.includes(normalizedGrade);
};
export const formatGrade = (value) => normalizeGradeValue(value);

export const normalizeRequirements = (savedRequirements) => {
  if (!Array.isArray(savedRequirements) || savedRequirements.length === 0) {
    return DEFAULT_REQUIREMENTS;
  }

  return savedRequirements
    .filter((requirement) => requirement && typeof requirement.title === 'string' && requirement.title.trim())
    .map((requirement, index) => ({
      id: requirement.id ? String(requirement.id) : `req-${Date.now()}-${index}`,
      title: requirement.title.trim(),
      requiredCredits: isValidCredits(requirement.requiredCredits) ? parseNumberInput(requirement.requiredCredits) : 6,
      countTowardsTotal: requirement.countTowardsTotal !== false,
      color: normalizeColor(requirement.color),
    }));
};

export const sortModulesForDisplay = (modules, semesters) => {
  const semesterIndex = new Map(semesters.map((semester, index) => [semester, index]));
  return [...modules].sort((a, b) => {
    const aSemester = semesterIndex.get(a.semester) ?? Number.MAX_SAFE_INTEGER;
    const bSemester = semesterIndex.get(b.semester) ?? Number.MAX_SAFE_INTEGER;
    if (aSemester !== bSemester) {
      return aSemester - bSemester;
    }
    if ((a.order ?? 0) !== (b.order ?? 0)) {
      return (a.order ?? 0) - (b.order ?? 0);
    }
    return String(a.id).localeCompare(String(b.id));
  });
};

export const resequenceModules = (modules) => {
  const semesterOrderCounters = {};

  return modules.map((module) => {
    const nextOrder = semesterOrderCounters[module.semester] ?? 0;
    semesterOrderCounters[module.semester] = nextOrder + 1;
    return { ...module, order: nextOrder };
  });
};

export const normalizeModules = (savedModules, semesters, containerTitles) => {
  if (!Array.isArray(savedModules)) {
    return [];
  }

  return resequenceModules(sortModulesForDisplay(savedModules.map((module, index) => {
    const container = containerTitles.includes(module?.container) ? module.container : containerTitles[0];
    const semester = semesters.includes(module?.semester) ? module.semester : semesters[0];
    const status = STATUSES.includes(module?.status) ? module.status : STATUSES[0];
    const credits = isValidCredits(module?.credits) ? parseNumberInput(module.credits) : getDefaultCreditsForContainer(container);
    const grade = status === 'Completed' && isValidGrade(module?.grade) && module?.grade !== ''
      ? parseNumberInput(module.grade)
      : '';

    return {
      id: module?.id ? String(module.id) : `${Date.now()}-${index}`,
      name: typeof module?.name === 'string' && module.name.trim() ? module.name.trim() : 'Untitled Module',
      semester,
      container,
      status,
      credits,
      grade,
      order: typeof module?.order === 'number' ? module.order : index,
      notes: normalizeNotes(module?.notes),
    };
  }), semesters));
};

export const moveModuleToPosition = (modules, semesters, draggedModuleId, targetSemester, targetIndex = null) => {
  const groupedModules = groupBy(sortModulesForDisplay(modules, semesters), (module) => module.semester);
  let draggedModule = null;

  const cleanedGroups = semesters.reduce((result, semester) => {
    result[semester] = (groupedModules[semester] || []).filter((module) => {
      if (module.id === draggedModuleId) {
        draggedModule = module;
        return false;
      }
      return true;
    });
    return result;
  }, {});

  if (!draggedModule) {
    return modules;
  }

  const nextTargetModules = [...(cleanedGroups[targetSemester] || [])];
  const insertionIndex = targetIndex == null ? nextTargetModules.length : Math.max(0, Math.min(targetIndex, nextTargetModules.length));
  nextTargetModules.splice(insertionIndex, 0, { ...draggedModule, semester: targetSemester });
  cleanedGroups[targetSemester] = nextTargetModules;

  return resequenceModules(
    semesters.flatMap((semester) => cleanedGroups[semester] || []),
  );
};

export const moveRequirementToPosition = (requirements, draggedRequirementId, targetIndex = null) => {
  const currentIndex = requirements.findIndex((requirement) => requirement.id === draggedRequirementId);
  if (currentIndex === -1) {
    return requirements;
  }

  const nextRequirements = [...requirements];
  const [draggedRequirement] = nextRequirements.splice(currentIndex, 1);
  const insertionIndex = targetIndex == null ? nextRequirements.length : Math.max(0, Math.min(targetIndex, nextRequirements.length));
  nextRequirements.splice(insertionIndex, 0, draggedRequirement);
  return nextRequirements;
};

