import React, { useState, useMemo, useEffect, useRef, useLayoutEffect } from 'react';
import { Trash2, CheckCircle2, BookOpen, GraduationCap, Eye, EyeOff, Cloud, LogOut } from 'lucide-react';
import { supabase } from './supabaseClient';
import { createPlanSync } from './plan-sync.mjs';
import { PALETTES, normalizeTheme, normalizeColor, normalizeNotes, requirementColor, contrastInk } from './planner-preferences.mjs';

const groupBy = (array, keyFn) => {
  return array.reduce((result, item) => {
    const key = keyFn(item);
    if (!result[key]) {
      result[key] = [];
    }
    result[key].push(item);
    return result;
  }, {});
};

const IS_DEMO = import.meta.env.DEV && new URLSearchParams(location.search).has('demo');
const KEY_PREFIX = IS_DEMO ? 'demo:' : '';
const THEME_STORAGE_KEY = KEY_PREFIX + 'studyPlannerTheme';
const STORAGE_KEY = KEY_PREFIX + 'studyPlannerModulesMScInformatik';
const SEMESTER_STORAGE_KEY = KEY_PREFIX + 'studyPlannerSemestersMScInformatik';
const TITLE_STORAGE_KEY = KEY_PREFIX + 'studyPlannerTitleMScInformatik';
const REQUIREMENTS_STORAGE_KEY = KEY_PREFIX + 'studyPlannerRequirementsMScInformatik';
const DEFAULT_SEMESTERS = ['Semester 1', 'Semester 2', 'Semester 3', 'Semester 4'];
const DEFAULT_TITLE = 'Study Planner - Master of Science Informatik';
const DEFAULT_REQUIREMENTS = [
  { id: 'req-tmg-inf', title: 'TMG INF', requiredCredits: 6 },
  { id: 'req-minf', title: 'MINF', requiredCredits: 24 },
  { id: 'req-hauptseminar', title: 'Hauptseminar', requiredCredits: 3 },
  { id: 'req-schluesselqualifikation', title: 'Schluesselqualifikation', requiredCredits: 3 },
  { id: 'req-vertiefungslinie', title: 'Vertiefungslinie', requiredCredits: 24 },
  { id: 'req-ergaenzende', title: 'Ergaenzende Spezialisierungsmodule', requiredCredits: 30 },
  { id: 'req-masterarbeit', title: 'Masterarbeit', requiredCredits: 30 },
];
const STATUSES = ['Planned', 'In Progress', 'Completed'];
const VALID_GRADES = ['1.0', '1.3', '1.7', '2.0', '2.3', '2.7', '3.0', '3.3', '3.7', '4.0'];
const DEFAULT_CREDITS_BY_CONTAINER = {
  'TMG INF': 6,
  MINF: 6,
  Hauptseminar: 3,
  Schluesselqualifikation: 3,
  Vertiefungslinie: 6,
  'Ergaenzende Spezialisierungsmodule': 6,
  Masterarbeit: 30,
};

const defaultContainerTitles = DEFAULT_REQUIREMENTS.map((requirement) => requirement.title);

const getDefaultCreditsForContainer = (container) => DEFAULT_CREDITS_BY_CONTAINER[container] ?? 6;

const createGoogleNonce = async () => {
  const randomBytes = crypto.getRandomValues(new Uint8Array(32));
  const nonce = btoa(String.fromCharCode(...randomBytes));
  const encodedNonce = new TextEncoder().encode(nonce);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encodedNonce);
  const hashedNonce = Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

  return { nonce, hashedNonce };
};

const normalizeSemesterList = (semesterList) => {
  if (!Array.isArray(semesterList) || semesterList.length === 0) {
    return DEFAULT_SEMESTERS;
  }

  return semesterList
    .filter((semester) => typeof semester === 'string' && semester.trim())
    .map((semester) => semester.trim());
};

const parseNumberInput = (value) => Number(String(value).replace(',', '.').trim());

const isValidCredits = (value) => {
  const normalized = String(value).replace(',', '.').trim();
  if (!normalized) {
    return false;
  }

  const parsed = parseNumberInput(normalized);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 30;
};

const normalizeGradeValue = (value) => {
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

const isValidGrade = (value) => {
  const normalizedGrade = normalizeGradeValue(value);
  return normalizedGrade === '' || VALID_GRADES.includes(normalizedGrade);
};
const formatGrade = (value) => normalizeGradeValue(value);

const normalizeRequirements = (savedRequirements) => {
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

const sortModulesForDisplay = (modules, semesters) => {
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

const resequenceModules = (modules) => {
  const semesterOrderCounters = {};

  return modules.map((module) => {
    const nextOrder = semesterOrderCounters[module.semester] ?? 0;
    semesterOrderCounters[module.semester] = nextOrder + 1;
    return { ...module, order: nextOrder };
  });
};

const normalizeModules = (savedModules, semesters, containerTitles) => {
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

const moveModuleToPosition = (modules, semesters, draggedModuleId, targetSemester, targetIndex = null) => {
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

const moveRequirementToPosition = (requirements, draggedRequirementId, targetIndex = null) => {
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

const DEMO_MODULES = [
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

export default function StudyPlaner() {
  const [theme, setTheme] = useState(() => normalizeTheme(localStorage.getItem(THEME_STORAGE_KEY)));
  const [isAppearanceOpen, setIsAppearanceOpen] = useState(false);
  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    document.documentElement.dataset.palette = theme;
  }, [theme]);
  const [plannerTitle, setPlannerTitle] = useState(() => localStorage.getItem(TITLE_STORAGE_KEY) || DEFAULT_TITLE);
  const [requirements, setRequirements] = useState(() => {
    const saved = localStorage.getItem(REQUIREMENTS_STORAGE_KEY);
    if (!saved) {
      return DEFAULT_REQUIREMENTS;
    }
    try {
      return normalizeRequirements(JSON.parse(saved));
    } catch (e) {
      return DEFAULT_REQUIREMENTS;
    }
  });
  const [semesters, setSemesters] = useState(() => {
    const saved = localStorage.getItem(SEMESTER_STORAGE_KEY);
    if (!saved) {
      return DEFAULT_SEMESTERS;
    }
    try {
      return normalizeSemesterList(JSON.parse(saved));
    } catch (e) {
      return DEFAULT_SEMESTERS;
    }
  });
  const [modules, setModules] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      return IS_DEMO ? DEMO_MODULES : [];
    }
    try {
      const nextRequirements = normalizeRequirements(JSON.parse(localStorage.getItem(REQUIREMENTS_STORAGE_KEY) || 'null'));
      return normalizeModules(
        JSON.parse(saved),
        normalizeSemesterList(JSON.parse(localStorage.getItem(SEMESTER_STORAGE_KEY) || 'null')),
        nextRequirements.map((requirement) => requirement.title),
      );
    } catch (e) {
      return [];
    }
  });
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [modalInitialSemester, setModalInitialSemester] = useState(null);
  const [draggedModuleId, setDraggedModuleId] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const [draggedRequirementId, setDraggedRequirementId] = useState(null);
  const [requirementDropTarget, setRequirementDropTarget] = useState(null);
  const [session, setSession] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [authFeedback, setAuthFeedback] = useState(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState(null);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [initialSyncDone, setInitialSyncDone] = useState(false);
  const fileInputRef = useRef(null);
  const googleButtonRef = useRef(null);
  const googleNonceRef = useRef(null);
  const previousModulePositionsRef = useRef(new Map());
  const previousRequirementPositionsRef = useRef(new Map());
  const historyRef = useRef([]);
  const currentSnapshotRef = useRef(null);
  const isRestoringHistoryRef = useRef(false);
  const lastCloudPayloadRef = useRef(null);
  const cloudSyncRef = useRef(null);
  const [cloudReload, setCloudReload] = useState(0);
  const [readyCloudSync, setReadyCloudSync] = useState(null);
  const cloudOwner = session?.user?.id ?? null;

  const containerTitles = useMemo(() => requirements.map((requirement) => requirement.title), [requirements]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(modules));
  }, [modules]);

  useEffect(() => {
    localStorage.setItem(TITLE_STORAGE_KEY, plannerTitle);
  }, [plannerTitle]);

  useEffect(() => {
    localStorage.setItem(SEMESTER_STORAGE_KEY, JSON.stringify(semesters));
  }, [semesters]);

  useEffect(() => {
    localStorage.setItem(REQUIREMENTS_STORAGE_KEY, JSON.stringify(requirements));
  }, [requirements]);

  useEffect(() => {
    const snapshot = JSON.stringify({ plannerTitle, semesters, requirements, modules, theme });

    if (currentSnapshotRef.current == null) {
      currentSnapshotRef.current = snapshot;
      return;
    }

    if (snapshot === currentSnapshotRef.current) {
      return;
    }

    if (isRestoringHistoryRef.current) {
      currentSnapshotRef.current = snapshot;
      isRestoringHistoryRef.current = false;
      return;
    }

    historyRef.current.push(currentSnapshotRef.current);
    if (historyRef.current.length > 100) {
      historyRef.current.shift();
    }
    currentSnapshotRef.current = snapshot;
  }, [plannerTitle, semesters, requirements, modules, theme]);

  const orderedModules = useMemo(() => sortModulesForDisplay(modules, semesters), [modules, semesters]);
  const modulesBySemester = useMemo(() => groupBy(orderedModules, (module) => module.semester), [orderedModules]);
  const modulesByContainer = useMemo(() => groupBy(orderedModules, (module) => module.container), [orderedModules]);

  useLayoutEffect(() => {
    // Only a drag/drop supplies a before-position snapshot. Editing content must
    // never animate against stale viewport coordinates from before a scroll.
    const previousPositions = previousModulePositionsRef.current;
    previousModulePositionsRef.current = new Map();
    if (!previousPositions.size || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const moduleElements = Array.from(document.querySelectorAll('.module-card[data-module-id]'));
    moduleElements.forEach(element => element.getAnimations().forEach(animation => {
      if (animation.id === 'module-reorder') animation.cancel();
    }));
    const nextPositions = new Map();

    moduleElements.forEach((element) => {
      nextPositions.set(element.dataset.moduleId, element.getBoundingClientRect());
    });

    moduleElements.forEach((element) => {
      const moduleId = element.dataset.moduleId;
      const previousPosition = previousPositions.get(moduleId);
      const nextPosition = nextPositions.get(moduleId);

      if (!previousPosition || !nextPosition) {
        return;
      }

      const deltaX = previousPosition.left - nextPosition.left;
      const deltaY = previousPosition.top - nextPosition.top;

      if (deltaX === 0 && deltaY === 0) {
        return;
      }

      element.animate(
        [
          { transform: `translate(${deltaX}px, ${deltaY}px)` },
          { transform: 'translate(0, 0)' },
        ],
        {
          id: 'module-reorder',
          duration: 240,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        },
      );
    });


  }, [orderedModules]);

  useLayoutEffect(() => {
    // Only a drag/drop supplies a before-position snapshot. Editing content must
    // never animate against stale viewport coordinates from before a scroll.
    const previousPositions = previousRequirementPositionsRef.current;
    previousRequirementPositionsRef.current = new Map();
    if (!previousPositions.size || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const requirementElements = Array.from(document.querySelectorAll('.analytics-card[data-requirement-id]'));
    requirementElements.forEach(element => element.getAnimations().forEach(animation => {
      if (animation.id === 'requirement-reorder') animation.cancel();
    }));
    const nextPositions = new Map();

    requirementElements.forEach((element) => {
      nextPositions.set(element.dataset.requirementId, element.getBoundingClientRect());
    });

    requirementElements.forEach((element) => {
      const requirementId = element.dataset.requirementId;
      const previousPosition = previousPositions.get(requirementId);
      const nextPosition = nextPositions.get(requirementId);

      if (!previousPosition || !nextPosition) {
        return;
      }

      const deltaX = previousPosition.left - nextPosition.left;
      const deltaY = previousPosition.top - nextPosition.top;

      if (deltaX === 0 && deltaY === 0) {
        return;
      }

      element.animate(
        [
          { transform: `translate(${deltaX}px, ${deltaY}px)` },
          { transform: 'translate(0, 0)' },
        ],
        {
          id: 'requirement-reorder',
          duration: 240,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        },
      );
    });


  }, [requirements]);

  const includedRequirements = requirements.filter(req => req.countTowardsTotal !== false);
  const includedContainers = new Set(includedRequirements.map(req => req.title));
  const includedModules = orderedModules.filter(module => includedContainers.has(module.container));

  const totalRequiredCredits = includedRequirements.reduce((sum, requirement) => sum + requirement.requiredCredits, 0);
  const totalEarnedCredits = includedModules.filter((module) => module.status === 'Completed').reduce((sum, module) => sum + module.credits, 0);
  const totalInProgressCredits = includedModules.filter((module) => module.status === 'In Progress').reduce((sum, module) => sum + module.credits, 0);
  const totalPlannedCredits = includedModules.filter((module) => module.status === 'Planned').reduce((sum, module) => sum + module.credits, 0);
  const totalEarnedPercentage = totalRequiredCredits > 0 ? Math.min((totalEarnedCredits / totalRequiredCredits) * 100, 100) : 0;
  const totalInProgressPercentage = totalRequiredCredits > 0 ? Math.min((totalInProgressCredits / totalRequiredCredits) * 100, 100 - totalEarnedPercentage) : 0;
  const totalPlannedPercentage = totalRequiredCredits > 0 ? Math.min((totalPlannedCredits / totalRequiredCredits) * 100, 100 - totalEarnedPercentage - totalInProgressPercentage) : 0;
  const gradedCompletedModules = includedModules.filter((module) => module.status === 'Completed' && typeof module.grade === 'number' && !Number.isNaN(module.grade));
  const weightedGradeSum = gradedCompletedModules.reduce((sum, module) => sum + (module.grade * module.credits), 0);
  const gradedCredits = gradedCompletedModules.reduce((sum, module) => sum + module.credits, 0);
  const averageGrade = gradedCredits > 0 ? (weightedGradeSum / gradedCredits).toFixed(2) : null;
  const highestRemovableSemester = semesters.length > DEFAULT_SEMESTERS.length ? semesters[semesters.length - 1] : null;

  const closeModal = () => {
    setIsFormOpen(false);
    setModalInitialSemester(null);
  };

  const addModule = (newModule) => {
    setModules((currentModules) => resequenceModules(sortModulesForDisplay([
      ...currentModules,
      { id: Date.now().toString(), ...newModule, order: Number.MAX_SAFE_INTEGER },
    ], semesters)));
    closeModal();
  };

  const deleteModule = (moduleId) => {
    setModules((currentModules) => resequenceModules(sortModulesForDisplay(
      currentModules.filter((module) => module.id !== moduleId),
      semesters,
    )));
  };

  const updateModule = (moduleId, updates) => {
    setModules((currentModules) => resequenceModules(sortModulesForDisplay(
      currentModules.map((module) => module.id === moduleId ? { ...module, ...updates } : module),
      semesters,
    )));
  };

  const moveContainer = (moduleId, newContainer) => {
    updateModule(moduleId, { container: newContainer });
  };

  const updateCredits = (moduleId, newCredits) => {
    if (!isValidCredits(newCredits)) {
      window.alert('Please enter valid ECTS between 0.5 and 30.');
      return;
    }

    updateModule(moduleId, { credits: parseNumberInput(newCredits) });
  };

  const addSemester = () => {
    setSemesters((currentSemesters) => [...currentSemesters, `Semester ${currentSemesters.length + 1}`]);
  };

  const removeSemester = (semesterToRemove) => {
    const hasModules = modules.some((module) => module.semester === semesterToRemove);
    if (hasModules) {
      window.alert('Please move or delete the modules in this semester before removing it.');
      return;
    }

    setSemesters((currentSemesters) => currentSemesters.filter((semester) => semester !== semesterToRemove));
  };

  const openAddModuleModal = (semester) => {
    setModalInitialSemester(semester);
    setIsFormOpen(true);
  };

  const startDraggingModule = (event, moduleId) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', moduleId);
    setDraggedModuleId(moduleId);
  };

  const stopDraggingModule = () => {
    setDraggedModuleId(null);
    setDropTarget(null);
  };

  const updateDropLocation = (semester, index = null) => {
    setDropTarget({ semester, index });
  };

  const dropModuleIntoSemester = (semester, index = null) => {
    if (!draggedModuleId) {
      return;
    }

    previousModulePositionsRef.current = new Map(
      Array.from(document.querySelectorAll('.module-card[data-module-id]'), element => [element.dataset.moduleId, element.getBoundingClientRect()]),
    );
    setModules((currentModules) => moveModuleToPosition(currentModules, semesters, draggedModuleId, semester, index));
    setDraggedModuleId(null);
    setDropTarget(null);
  };

  const renameSemester = (oldSemester, newSemester) => {
    const trimmedSemester = newSemester.trim();
    if (!trimmedSemester || trimmedSemester === oldSemester) {
      return;
    }

    if (semesters.includes(trimmedSemester)) {
      window.alert('A semester with this name already exists.');
      return;
    }

    const renamedSemesters = semesters.map((semester) => semester === oldSemester ? trimmedSemester : semester);
    setSemesters(renamedSemesters);
    setModules((currentModules) => resequenceModules(sortModulesForDisplay(
      currentModules.map((module) => module.semester === oldSemester ? { ...module, semester: trimmedSemester } : module),
      renamedSemesters,
    )));
  };

  const toggleStatus = (moduleId) => {
    setModules((currentModules) => currentModules.map((module) => {
      if (module.id === moduleId) {
        const nextStatus = module.status === 'Planned' ? 'In Progress' : module.status === 'In Progress' ? 'Completed' : 'Planned';
        return {
          ...module,
          status: nextStatus,
          grade: nextStatus === 'Completed' ? module.grade ?? '' : '',
        };
      }
      return module;
    }));
  };

  const updateGrade = (moduleId, newGrade) => {
    const normalizedGrade = normalizeGradeValue(newGrade);
    if (!isValidGrade(normalizedGrade)) {
      window.alert(`Please use a valid grade: ${VALID_GRADES.join(', ')}`);
      return;
    }

    setModules((currentModules) => currentModules.map((module) => {
      if (module.id !== moduleId) {
        return module;
      }

      if (normalizedGrade === '') {
        return { ...module, grade: '' };
      }
      return { ...module, grade: parseNumberInput(normalizedGrade) };
    }));
  };

  const handleExport = () => {
    const payload = {
      version: 3,
      theme,
      exportedAt: new Date().toISOString(),
      plannerTitle,
      requirements,
      semesters,
      modules: orderedModules,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'study-planner-export.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const importedData = JSON.parse(await file.text());
      const nextRequirements = normalizeRequirements(importedData?.requirements);
      const nextSemesters = normalizeSemesterList(importedData?.semesters);
      const nextModules = normalizeModules(importedData?.modules, nextSemesters, nextRequirements.map((requirement) => requirement.title));
      setTheme(normalizeTheme(importedData?.theme));
      setPlannerTitle(typeof importedData?.plannerTitle === 'string' && importedData.plannerTitle.trim() ? importedData.plannerTitle.trim() : DEFAULT_TITLE);
      setRequirements(nextRequirements);
      setSemesters(nextSemesters);
      setModules(nextModules);
    } catch (error) {
      window.alert('The selected file could not be imported.');
    } finally {
      event.target.value = '';
    }
  };

  const handleLogout = async () => {
    window.google?.accounts?.id?.disableAutoSelect();
    await supabase.auth.signOut();
    setIsSigningIn(false);
    setAuthFeedback(null);
  };

  useEffect(() => {
    if (!supabase || IS_DEMO || !isAuthReady || session) {
      return undefined;
    }

    const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!googleClientId) {
      setAuthFeedback({
        type: 'error',
        message: 'Google Login ist noch nicht konfiguriert.',
      });
      return undefined;
    }

    let canceled = false;
    let buttonContainer = null;
    const scriptSource = 'https://accounts.google.com/gsi/client';

    const initializeGoogleButton = async () => {
      if (canceled || !window.google || !googleButtonRef.current) {
        return;
      }

      const { nonce, hashedNonce } = await createGoogleNonce();
      if (canceled || !googleButtonRef.current) {
        return;
      }

      googleNonceRef.current = nonce;
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        nonce: hashedNonce,
        use_fedcm_for_prompt: true,
        callback: async (response) => {
          setIsSigningIn(true);
          setAuthFeedback(null);
          const { error } = await supabase.auth.signInWithIdToken({
            provider: 'google',
            token: response.credential,
            nonce: googleNonceRef.current,
          });

          if (error) {
            setAuthFeedback({
              type: 'error',
              message: error.message ?? 'Die Google-Anmeldung ist fehlgeschlagen.',
            });
            setIsSigningIn(false);
          }
        },
      });

      buttonContainer = googleButtonRef.current;
      buttonContainer.replaceChildren();
      window.google.accounts.id.renderButton(buttonContainer, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: 'signin_with',
        shape: 'rectangular',
        logo_alignment: 'left',
        width: 230,
      });
    };

    const existingScript = document.querySelector(`script[src="${scriptSource}"]`);
    if (window.google) {
      initializeGoogleButton();
    } else if (existingScript) {
      existingScript.addEventListener('load', initializeGoogleButton, { once: true });
    } else {
      const script = document.createElement('script');
      script.src = scriptSource;
      script.async = true;
      script.addEventListener('load', initializeGoogleButton, { once: true });
      script.addEventListener('error', () => {
        if (!canceled) {
          setAuthFeedback({
            type: 'error',
            message: 'Google Login konnte nicht geladen werden.',
          });
        }
      }, { once: true });
      document.head.appendChild(script);
    }

    return () => {
      canceled = true;
      existingScript?.removeEventListener('load', initializeGoogleButton);
      buttonContainer?.replaceChildren();
    };
  }, [isAuthReady, session]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.target.closest?.('input, textarea, select, [contenteditable=true]')) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        const previousSnapshot = historyRef.current.pop();
        if (!previousSnapshot) {
          return;
        }
        event.preventDefault();
        isRestoringHistoryRef.current = true;
        const parsedSnapshot = JSON.parse(previousSnapshot);
        setTheme(normalizeTheme(parsedSnapshot.theme));
        setPlannerTitle(parsedSnapshot.plannerTitle);
        setSemesters(parsedSnapshot.semesters);
        setRequirements(parsedSnapshot.requirements);
        setModules(parsedSnapshot.modules);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!supabase || IS_DEMO) { setIsAuthReady(true); return; }
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setSession(data.session ?? null);
        setIsSigningIn(false);
        setIsAuthReady(true);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null);
      setIsSigningIn(false);
      setIsAuthReady(true);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    setInitialSyncDone(false);
    setReadyCloudSync(null);
    setSyncError(null);
    setLastSavedAt(null);
    lastCloudPayloadRef.current = null;
    if (!cloudOwner || !supabase || IS_DEMO) {
      setIsSyncing(false);
      return;
    }

    const sync = createPlanSync(supabase, cloudOwner);
    cloudSyncRef.current = sync;
    const localSnapshotAtStart = currentSnapshotRef.current;
    let canceled = false;
    setIsSyncing(true);
    (async () => {
      try {
        const data = await sync.load();
        if (canceled) return;
        if (data && currentSnapshotRef.current !== localSnapshotAtStart) {
          throw new Error('Local edits were made while loading');
        }
        if (data) {
          const payload = data.data;
          // Do not normalize a malformed/future plan into empty defaults and save it.
          if (!Array.isArray(payload.modules) || !Array.isArray(payload.requirements) || !payload.requirements.length || !Array.isArray(payload.semesters) || !payload.semesters.length) {
            throw new Error('Invalid cloud plan structure');
          }
          const nextRequirements = normalizeRequirements(payload.requirements);
          const nextSemesters = normalizeSemesterList(payload.semesters);
          const nextModules = normalizeModules(payload.modules, nextSemesters, nextRequirements.map(req => req.title));
          const nextPlannerTitle = typeof payload.plannerTitle === 'string' && payload.plannerTitle.trim() ? payload.plannerTitle.trim() : DEFAULT_TITLE;
          const nextTheme = normalizeTheme(payload.theme);
          setTheme(nextTheme);
          setPlannerTitle(nextPlannerTitle);
          setRequirements(nextRequirements);
          setSemesters(nextSemesters);
          setModules(nextModules);
          setLastSavedAt(data.updated_at);
          lastCloudPayloadRef.current = JSON.stringify({ theme: nextTheme, plannerTitle: nextPlannerTitle, semesters: nextSemesters, requirements: nextRequirements, modules: nextModules });
          // Undo must not cross the cloud-load/account boundary.
          historyRef.current = [];
          isRestoringHistoryRef.current = true;
        }
        setReadyCloudSync(sync);
        setInitialSyncDone(true);
      } catch (error) {
        if (!canceled) {
          sync.dispose();
          setSyncError('Cloud-Plan konnte nicht sicher geladen werden. Automatisches Speichern ist pausiert; dein lokaler Stand bleibt erhalten.');
        }
      } finally {
        if (!canceled) setIsSyncing(false);
      }
    })();
    return () => {
      canceled = true;
      sync.dispose();
      if (cloudSyncRef.current === sync) cloudSyncRef.current = null;
    };
  }, [cloudOwner, cloudReload]);

  useEffect(() => {
    const sync = cloudSyncRef.current;
    if (!cloudOwner || !initialSyncDone || !sync || readyCloudSync !== sync) return;
    const payload = { theme, plannerTitle, semesters, requirements, modules };
    const serializedPayload = JSON.stringify(payload);
    if (serializedPayload === lastCloudPayloadRef.current) return;
    const timeoutId = setTimeout(async () => {
      setIsSyncing(true);
      try {
        const data = await sync.save(payload);
        if (cloudSyncRef.current !== sync) return;
        lastCloudPayloadRef.current = serializedPayload;
        setLastSavedAt(data.updated_at);
      } catch (error) {
        if (cloudSyncRef.current !== sync) return;
        setInitialSyncDone(false);
        setSyncError(error.code === 'conflict'
          ? 'Der Cloud-Plan wurde in einer anderen Sitzung geändert. Speichern ist pausiert, damit nichts überschrieben wird. Exportiere deinen lokalen Stand vor dem Neuladen.'
          : 'Cloud-Speichern fehlgeschlagen. Speichern ist pausiert; dein lokaler Stand bleibt erhalten. Exportiere ihn vor dem Neuladen.');
      } finally {
        if (cloudSyncRef.current === sync) setIsSyncing(false);
      }
    }, 1500);
    return () => clearTimeout(timeoutId);
  }, [plannerTitle, semesters, requirements, modules, theme, cloudOwner, initialSyncDone, readyCloudSync]);

  const startDraggingRequirement = (event, requirementId) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', requirementId);
    setDraggedRequirementId(requirementId);
  };

  const stopDraggingRequirement = () => {
    setDraggedRequirementId(null);
    setRequirementDropTarget(null);
  };

  const updateRequirementDropLocation = (index = null) => {
    setRequirementDropTarget(index);
  };

  const dropRequirement = (index = null) => {
    if (!draggedRequirementId) {
      return;
    }

    previousRequirementPositionsRef.current = new Map(
      Array.from(document.querySelectorAll('.analytics-card[data-requirement-id]'), element => [element.dataset.requirementId, element.getBoundingClientRect()]),
    );
    setRequirements((currentRequirements) => moveRequirementToPosition(currentRequirements, draggedRequirementId, index));
    setDraggedRequirementId(null);
    setRequirementDropTarget(null);
  };

  return (
    <div className="study-planer-layout">
      <header className="app-header">
        <div className="logo">
          <GraduationCap size={40} className="logo-icon" />
          <InlineEditable
            className="planner-title-edit"
            value={plannerTitle}
            onSave={(newTitle) => setPlannerTitle(newTitle.trim() || plannerTitle)}
          >
            <h1>{plannerTitle}</h1>
          </InlineEditable>
        </div>
        <div className="header-actions">
          <button type="button" className="secondary-btn" aria-expanded={isAppearanceOpen} aria-controls="appearance-panel" onClick={() => setIsAppearanceOpen(!isAppearanceOpen)}>◐ Appearance</button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            className="hidden-file-input"
            onChange={handleImportFile}
          />
          <button type="button" className="secondary-btn" onClick={() => fileInputRef.current?.click()}>Import JSON</button>
          <button type="button" className="secondary-btn" onClick={handleExport}>Export JSON</button>
        </div>
      </header>

      {isAppearanceOpen && <section className="appearance-panel" id="appearance-panel" aria-label="Planner appearance">
        <div><h2>Make it yours</h2><p>Choose a palette. Custom requirement colors stay as you set them.</p></div>
        <div className="palette-options">{PALETTES.map(palette => <button key={palette.id} type="button" className={`palette-option ${theme === palette.id ? 'selected' : ''}`} aria-pressed={theme === palette.id} onClick={() => setTheme(palette.id)}>
          <span className="palette-preview" style={{background: palette.background}}>{palette.colors.slice(0, 4).map(color => <i key={color} style={{background: color}} />)}</span>
          <span>{palette.name}</span>{theme === palette.id && <CheckCircle2 size={15} />}
        </button>)}</div>
      </section>}
      {(!supabase || IS_DEMO) ? <div className="local-banner"><span className="local-dot" />{IS_DEMO ? 'Local preview · Sample data · Changes stay in this browser' : 'Local planner · Automatically saved in this browser'}</div> : <section className={`cloud-panel ${session ? 'is-connected' : ''}`}>
        {!isAuthReady ? (
          <div key="auth-loading" className="cloud-panel-content">
            <div className="cloud-panel-heading">
              <div className="cloud-icon"><Cloud size={22} /></div>
              <div>
                <span className="cloud-eyebrow">Cloud-Sicherung</span>
                <h2>Anmeldung wird geprüft ...</h2>
              </div>
            </div>
          </div>
        ) : session ? (
          <div key="signed-in" className="cloud-panel-content">
            <div className="cloud-panel-heading">
              <div className="cloud-icon"><Cloud size={22} /></div>
              <div>
                <span className="cloud-eyebrow">Cloud-Sicherung aktiv</span>
                <h2>Dein Plan wird automatisch gespeichert</h2>
              </div>
            </div>
            <div className="cloud-account">
              <div className="cloud-account-details">
                <span>{session.user?.email ?? session.user?.id}</span>
                <span className={`save-status ${isSyncing ? 'is-saving' : ''} ${syncError ? 'has-error' : ''}`}>
                  <span className="save-status-dot" aria-hidden="true" />
                  {syncError
                    ? syncError
                    : isSyncing ? 'Wird gespeichert …' : lastSavedAt
                      ? `Zuletzt gespeichert: ${new Date(lastSavedAt).toLocaleString('de-DE', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}`
                      : 'Cloud-Speicherung wird eingerichtet'}
                </span>
              </div>
              {syncError && <button type="button" className="cloud-logout-btn" onClick={() => {
                if (window.confirm('Cloud-Plan neu laden? Der lokale Stand wird ersetzt. Bitte zuvor mit Export JSON sichern.')) setCloudReload(value => value + 1);
              }}>Cloud neu laden</button>}
              <button type="button" className="cloud-logout-btn" onClick={handleLogout}>
                <LogOut size={17} />
                Abmelden
              </button>
            </div>
          </div>
        ) : (
          <div key="signed-out" className="cloud-panel-content">
            <div className="cloud-panel-heading">
              <div className="cloud-icon"><Cloud size={22} /></div>
              <div>
                <span className="cloud-eyebrow">Optional anmelden</span>
                <h2>Plan geräteübergreifend sichern</h2>
                <p>Melde dich mit deinem Google-Konto an. Kein zusätzliches Passwort nötig.</p>
              </div>
            </div>
            <div className="google-login-actions">
              <div ref={googleButtonRef} className="google-button-slot" />
              <span>{isSigningIn ? 'Anmeldung wird abgeschlossen ...' : 'Dein Plan bleibt auch lokal auf diesem Gerät gespeichert.'}</span>
            </div>
            {authFeedback && (
              <p className={`auth-feedback is-${authFeedback.type}`} role="status">
                {authFeedback.message}
              </p>
            )}
          </div>
        )}
      </section>}

      <div className="overall-progress-section">
        <div className="op-header">
          <h2>Degree Progress</h2>
          <span className="fraction">{totalEarnedCredits} / {totalRequiredCredits} ECTS</span>
        </div>
        <div className="op-header">
          <h2>Current Average</h2>
          <span className="fraction">{averageGrade ?? '-'}</span>
        </div>
        <div className="progress-bar-large">
          <div className="progress-fill earned" style={{ width: `${totalEarnedPercentage}%` }} />
          <div className="progress-fill in-progress" style={{ width: `${totalInProgressPercentage}%` }} />
          <div className="progress-fill planned" style={{ width: `${totalPlannedPercentage}%` }} />
        </div>
        <div className="credit-summary" aria-label="ECTS by status" aria-live="polite">
          <div className="credit-stat planned"><span>Planned</span><strong>{totalPlannedCredits}<small>ECTS</small></strong></div>
          <div className="credit-stat in-progress"><span>In Progress</span><strong>{totalInProgressCredits}<small>ECTS</small></strong></div>
          <div className="credit-stat completed"><span>Completed</span><strong>{totalEarnedCredits}<small>ECTS</small></strong></div>
          <div className="credit-stat total"><span>Total allocated</span><strong>{totalPlannedCredits + totalInProgressCredits + totalEarnedCredits}<small>/ {totalRequiredCredits} ECTS</small></strong></div>
        </div>
        <p className="credit-summary-hint">Only included requirements count toward these totals.</p>
      </div>

      {isFormOpen && (
        <ModuleModal
          onClose={closeModal}
          onAdd={addModule}
          allSemesters={semesters}
          containers={containerTitles}
          initialSemester={modalInitialSemester}
        />
      )}

      <main className="main-content">
        <section className="timeline-section">
          <h2><BookOpen size={24} /> Semester Timeline</h2>
          <div className="timeline-grid">
            {semesters.map(sem => (
              <SemesterColumn
                key={sem}
                title={sem}
                modules={modulesBySemester[sem] || []}
                onMoveContainer={moveContainer}
                onRenameSemester={renameSemester}
                onAddModule={openAddModuleModal}
                onUpdateModule={updateModule}
                onUpdateCredits={updateCredits}
                containers={containerTitles}
                requirementColors={Object.fromEntries(requirements.map((req, i) => [req.title, requirementColor(req, i, theme)]))}
                draggedModuleId={draggedModuleId}
                dropTarget={dropTarget}
                onDragModuleStart={startDraggingModule}
                onDragModuleEnd={stopDraggingModule}
                onDragOverSemester={updateDropLocation}
                onDropModule={dropModuleIntoSemester}
                onDelete={deleteModule}
                onToggleStatus={toggleStatus}
                onUpdateGrade={updateGrade}
                canRemove={sem === highestRemovableSemester}
                onRemoveSemester={removeSemester}
              />
            ))}
            <AddSemesterCard nextSemesterLabel={`Semester ${semesters.length + 1}`} onAddSemester={addSemester} />
          </div>
        </section>

        <aside className="analytics-section">
          <h2>Degree Requirements</h2>
          {requirements.map((requirement, index) => (
            <ContainerAnalytics
              key={requirement.id}
              requirement={requirement}
              color={requirementColor(requirement, index, theme)}
              onColorChange={(color) => setRequirements(current => current.map(req => req.id === requirement.id ? { ...req, color: normalizeColor(color) } : req))}
              modules={modulesByContainer[requirement.title] || []}
              index={index}
              isDragging={draggedRequirementId === requirement.id}
              isDropTarget={requirementDropTarget === index}
              onDragStart={startDraggingRequirement}
              onDragEnd={stopDraggingRequirement}
              onDragOverAt={updateRequirementDropLocation}
              onDropAt={dropRequirement}
              onRename={(newTitle) => {
                const trimmedTitle = newTitle.trim();
                if (!trimmedTitle || trimmedTitle === requirement.title) {
                  return;
                }
                if (containerTitles.includes(trimmedTitle)) {
                  window.alert('A requirement with this title already exists.');
                  return;
                }
                setRequirements((currentRequirements) => currentRequirements.map((currentRequirement) => (
                  currentRequirement.id === requirement.id
                    ? { ...currentRequirement, title: trimmedTitle }
                    : currentRequirement
                )));
                setModules((currentModules) => resequenceModules(sortModulesForDisplay(
                  currentModules.map((module) => module.container === requirement.title ? { ...module, container: trimmedTitle } : module),
                  semesters,
                )));
              }}
              onUpdateCredits={(newCredits) => {
                if (!isValidCredits(newCredits)) {
                  window.alert('Please enter valid required ECTS between 0.5 and 30.');
                  return;
                }
                setRequirements((currentRequirements) => currentRequirements.map((currentRequirement) => (
                  currentRequirement.id === requirement.id
                    ? { ...currentRequirement, requiredCredits: parseNumberInput(newCredits) }
                    : currentRequirement
                )));
              }}
              onDelete={() => {
                if (requirements.length === 1) {
                  window.alert('At least one requirement must remain.');
                  return;
                }
                const hasModules = modules.some((module) => module.container === requirement.title);
                if (hasModules) {
                  window.alert('Please move or delete the modules in this requirement before removing it.');
                  return;
                }
                setRequirements((currentRequirements) => currentRequirements.filter((currentRequirement) => currentRequirement.id !== requirement.id));
              }}
              onToggleCount={() => {
                setRequirements((currentRequirements) => currentRequirements.map((currentRequirement) => (
                  currentRequirement.id === requirement.id
                    ? { ...currentRequirement, countTowardsTotal: currentRequirement.countTowardsTotal === false }
                    : currentRequirement
                )));
              }}
            />
          ))}
          <div
            className={`requirement-drop-zone end-zone ${requirementDropTarget === requirements.length ? 'active' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              updateRequirementDropLocation(requirements.length);
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              dropRequirement(requirements.length);
            }}
          />
          <button
            type="button"
            className="add-requirement-btn"
            onClick={() => {
              const baseTitle = 'New Requirement';
              let nextTitle = baseTitle;
              let suffix = 2;
              while (containerTitles.includes(nextTitle)) {
                nextTitle = `${baseTitle} ${suffix}`;
                suffix += 1;
              }
              setRequirements((currentRequirements) => [
                ...currentRequirements,
                { id: `req-${Date.now()}`, title: nextTitle, requiredCredits: 6 },
              ]);
            }}
          >
            + Add Requirement
          </button>
        </aside>
      </main>
    </div>
  );
}

function SemesterColumn({
  title,
  modules,
  containers,
  requirementColors,
  draggedModuleId,
  dropTarget,
  onMoveContainer,
  onRenameSemester,
  onAddModule,
  onUpdateModule,
  onUpdateCredits,
  onDragModuleStart,
  onDragModuleEnd,
  onDragOverSemester,
  onDropModule,
  onDelete,
  onToggleStatus,
  onUpdateGrade,
  canRemove,
  onRemoveSemester,
}) {
  const credits = modules.reduce((sum, m) => sum + m.credits, 0);
  const isDropActive = dropTarget?.semester === title;
  const getInsertionIndexFromPointer = (event, index) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const midpoint = bounds.top + (bounds.height / 2);
    return event.clientY < midpoint ? index : index + 1;
  };

  return (
    <div
      className={`semester-col ${isDropActive ? 'drop-active' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOverSemester(title, modules.length);
      }}
      onDrop={() => onDropModule(title, modules.length)}
    >
      <div className="semester-header">
        <InlineEditable
          className="semester-title-edit"
          value={title}
          onSave={(newTitle) => onRenameSemester(title, newTitle)}
        >
          <h3>{title}</h3>
        </InlineEditable>
        <div className="semester-header-actions">
          <button
            type="button"
            className="semester-icon-btn add-module-btn"
            onClick={() => onAddModule(title)}
            title={`Add module to ${title}`}
          >
            +
          </button>
          <span className="credits-badge">{credits} ECTS</span>
        </div>
      </div>
      {canRemove && (
        <button
          type="button"
          className="semester-delete-btn"
          onClick={() => onRemoveSemester(title)}
          title={`Remove ${title}`}
        >
          <Trash2 size={14} />
        </button>
      )}
      <div className="module-list">
        {modules.map((module, index) => (
          <React.Fragment key={module.id}>
            <div
              className={`module-drop-zone ${dropTarget?.semester === title && dropTarget?.index === index ? 'active' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDragOverSemester(title, index);
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDropModule(title, index);
              }}
            />
            <div
              data-module-id={module.id}
              className={`module-card status-${module.status.toLowerCase().replace(' ', '-')} ${draggedModuleId === module.id ? 'is-dragging' : ''}`}
              draggable
              onDragStart={(e) => onDragModuleStart(e, module.id)}
              onDragEnd={onDragModuleEnd}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDragOverSemester(title, getInsertionIndexFromPointer(e, index));
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDropModule(title, getInsertionIndexFromPointer(e, index));
              }}
            >
              <div className="module-header">
                <InlineEditable
                  className="module-title-edit"
                  value={module.name}
                  onSave={(newName) => onUpdateModule(module.id, { name: newName.trim() || module.name })}
                >
                  <h4>{module.name}</h4>
                </InlineEditable>
                <button
                  className="status-toggle"
                  onClick={() => onToggleStatus(module.id)}
                  title={`Status: ${module.status}. Click to change.`}
                >
                  {module.status === 'Completed' && <CheckCircle2 size={18} className="icon-success" />}
                  {module.status === 'In Progress' && <div className="icon-pulse" />}
                  {module.status === 'Planned' && <div className="icon-planned" />}
                </button>
              </div>
              <div className="module-meta">
                <span className="tag-container" style={{ background: requirementColors[module.container], color: contrastInk(requirementColors[module.container]) }}>{module.container}</span>
                <InlineEditable
                  className="tag-credits inline-chip-edit"
                  value={String(module.credits)}
                  inputMode="decimal"
                  onSave={(newCredits) => onUpdateCredits(module.id, newCredits)}
                >
                  <span className="tag-credits">{module.credits} ECTS</span>
                </InlineEditable>
                {module.status === 'Completed' && (
                  <InlineEditable
                    className="tag-grade inline-chip-edit"
                    value={module.grade === '' || module.grade == null ? '' : formatGrade(module.grade)}
                    inputMode="decimal"
                    placeholder="1.7"
                    onSave={(newGrade) => onUpdateGrade(module.id, newGrade)}
                  >
                    <span className={`tag-grade ${module.grade === '' || module.grade == null ? 'empty' : ''}`}>
                      {module.grade === '' || module.grade == null ? 'Grade' : `Grade: ${formatGrade(module.grade)}`}
                    </span>
                  </InlineEditable>
                )}
              </div>
              <div className="module-actions">
                <span className="semester-label">{module.semester}</span>
                <select
                  value={module.container}
                  onChange={(e) => onMoveContainer(module.id, e.target.value)}
                  className="container-select"
                >
                  {containers.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <button className="delete-btn" onClick={() => onDelete(module.id)}>
                  <Trash2 size={16} />
                </button>
              </div>
              <ModuleNotes module={module} onUpdate={updates => onUpdateModule(module.id, updates)} />
            </div>
          </React.Fragment>
        ))}
        <div
          className={`module-drop-zone end-zone ${dropTarget?.semester === title && dropTarget?.index === modules.length ? 'active' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDragOverSemester(title, modules.length);
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDropModule(title, modules.length);
          }}
        />
        {modules.length === 0 && (
          <div className={`empty-state ${isDropActive ? 'drop-active' : ''}`}>No modules planned</div>
        )}
      </div>
    </div>
  );
}

function ModuleNotes({ module, onUpdate }) {
  const notes = normalizeNotes(module.notes);
  const update = (id, patch) => onUpdate({ notes: notes.map(note => note.id === id ? { ...note, ...patch } : note) });
  const addNote = () => onUpdate({ notes: [...notes, {
    id: crypto.randomUUID(), title: `Note ${notes.length + 1}`, text: '', color: '#a5b4fc', size: 'medium', expanded: true,
  }] });
  return <section className="module-notes" aria-label={`Notes for ${module.name}`} onDragStart={e => e.stopPropagation()}>
    <div className="notes-list-heading"><span>Notes <small>{notes.length}</small></span><button type="button" className="add-note-btn" onClick={addNote} aria-label={`Add note to ${module.name}`}>+ Add note</button></div>
    {notes.map((note, index) => <div key={note.id} className="note-item" style={{ '--note-color': note.color }}>
      <button type="button" className="notes-toggle" aria-expanded={note.expanded} aria-controls={`notes-${module.id}-${note.id}`} onClick={() => update(note.id, {expanded: !note.expanded})}>
        <span aria-hidden="true">{note.expanded ? '▾' : '▸'}</span><span>{note.title || `Note ${index + 1}`}</span>
      </button>
      {note.expanded && <div id={`notes-${module.id}-${note.id}`} className="notes-body">
        <div className="notes-tools">
          <input className="notes-title" aria-label={`Note ${index + 1} title for ${module.name}`} value={note.title} placeholder="Note title" maxLength={80} onChange={e => update(note.id, {title: e.target.value})} />
          <input type="color" aria-label={`Note ${index + 1} color for ${module.name}`} value={note.color} onChange={e => update(note.id, {color: e.target.value})} />
          <select aria-label={`Note ${index + 1} text size for ${module.name}`} value={note.size} onChange={e => update(note.id, {size: e.target.value})}><option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option></select>
        </div>
        <textarea aria-label={`Note ${index + 1} text for ${module.name}`} value={note.text} onChange={e => update(note.id, {text: e.target.value})} placeholder="Deadlines, links, ideas…" rows={4} className={`note-size-${note.size}`} />
        <button type="button" className="remove-note-btn" aria-label={`Delete note ${index + 1} from ${module.name}`} onClick={() => {
          if (!note.text.trim() || window.confirm('Delete this note? You can undo with Ctrl+Z.')) onUpdate({notes: notes.filter(item => item.id !== note.id)});
        }}><Trash2 size={12} /> Delete note</button>
      </div>}
    </div>)}
  </section>;
}

function InlineEditable({ value, onSave, children, className = '', inputMode = 'text', placeholder = '' }) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftValue, setDraftValue] = useState(value);

  useEffect(() => {
    if (!isEditing) {
      setDraftValue(value);
    }
  }, [value, isEditing]);

  const finishEditing = (shouldSave) => {
    if (shouldSave) {
      onSave(draftValue);
    } else {
      setDraftValue(value);
    }
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <input
        className={`inline-edit-input ${className}`.trim()}
        type="text"
        inputMode={inputMode}
        value={draftValue}
        placeholder={placeholder}
        autoFocus
        onChange={(e) => setDraftValue(e.target.value)}
        onBlur={() => finishEditing(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            finishEditing(true);
          }
          if (e.key === 'Escape') {
            finishEditing(false);
          }
        }}
      />
    );
  }

  return (
    <div
      className={`inline-edit-display ${className}`.trim()}
      onDoubleClick={() => setIsEditing(true)}
      title="Double-click to edit"
    >
      {children}
    </div>
  );
}

function AddSemesterCard({ nextSemesterLabel, onAddSemester }) {
  return (
    <button type="button" className="semester-col add-semester-card" onClick={onAddSemester}>
      <div className="add-semester-content">
        <span className="add-semester-plus">+</span>
        <span className="add-semester-label">{nextSemesterLabel}</span>
      </div>
    </button>
  );
}

function ContainerAnalytics({
  requirement,
  color,
  onColorChange,
  modules,
  index,
  isDragging,
  isDropTarget,
  onDragStart,
  onDragEnd,
  onDragOverAt,
  onDropAt,
  onRename,
  onUpdateCredits,
  onDelete,
  onToggleCount,
}) {
  const { title, requiredCredits, countTowardsTotal } = requirement;
  const isIncluded = countTowardsTotal !== false;
  const getInsertionIndexFromPointer = (event) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const midpoint = bounds.top + (bounds.height / 2);
    return event.clientY < midpoint ? index : index + 1;
  };
  const earnedCredits = modules.filter(m => m.status === 'Completed').reduce((sum, m) => sum + m.credits, 0);
  const inProgressCredits = modules.filter(m => m.status === 'In Progress').reduce((sum, m) => sum + m.credits, 0);
  const plannedCredits = modules.filter(m => m.status === 'Planned').reduce((sum, m) => sum + m.credits, 0);
  const totalCredits = earnedCredits + inProgressCredits + plannedCredits;
  const overflowCredits = Math.max(totalCredits - requiredCredits, 0);

  const earnedPercentage = Math.min((earnedCredits / requiredCredits) * 100, 100);
  const inProgressPercentage = Math.min((inProgressCredits / requiredCredits) * 100, 100 - earnedPercentage);
  const plannedPercentage = Math.min((plannedCredits / requiredCredits) * 100, 100 - earnedPercentage - inProgressPercentage);

  return (
    <div className="requirement-dnd-item">
      <div
        className={`requirement-drop-zone ${isDropTarget ? 'active' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDragOverAt(index);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDropAt(index);
        }}
      />
      <div
        style={{ borderTop: `3px solid ${color}` }}
        data-requirement-id={requirement.id}
        className={`analytics-card ${overflowCredits > 0 ? 'is-overfull' : ''} ${isDragging ? 'is-dragging' : ''} ${!isIncluded ? 'is-excluded' : ''}`}
        draggable
        onDragStart={(e) => onDragStart(e, requirement.id)}
        onDragEnd={onDragEnd}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDragOverAt(getInsertionIndexFromPointer(e));
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDropAt(getInsertionIndexFromPointer(e));
        }}
      >
        <div className="requirement-color-row" onDragStart={e => e.stopPropagation()}>
          <label className="color-control"><input type="color" value={color} onChange={e => onColorChange(e.target.value)} aria-label={`Color for ${title}`} /><span>Tag color</span></label>
          {requirement.color && <button type="button" className="text-button" onClick={() => onColorChange(null)}>Use palette</button>}
        </div>
        <div className="ac-header">
          <InlineEditable className="requirement-title-edit" value={title} onSave={onRename}>
            <h3>{title}</h3>
          </InlineEditable>
          <div className="requirement-header-actions">
            <button
               type="button"
               className={`requirement-toggle-btn ${isIncluded ? 'included' : 'excluded'}`}
               onClick={onToggleCount}
               title={isIncluded ? 'Included in total progress' : 'Excluded from total progress'}
            >
               {isIncluded ? <Eye size={15} /> : <EyeOff size={15} />}
            </button>
            <InlineEditable className="requirement-credits-edit" value={String(requiredCredits)} inputMode="decimal" onSave={onUpdateCredits}>
              <span className="fraction">{totalCredits} / {requiredCredits} ECTS</span>
            </InlineEditable>
            <button type="button" className="requirement-delete-btn" onClick={onDelete} title={`Delete ${title}`}>
              <Trash2 size={15} />
            </button>
          </div>
        </div>
        <div className="progress-bar">
          <div className="progress-fill earned" style={{ width: `${earnedPercentage}%` }} />
          <div className="progress-fill in-progress" style={{ width: `${inProgressPercentage}%` }} />
          <div className="progress-fill planned" style={{ width: `${plannedPercentage}%` }} />
        </div>
        <div className="ac-legend">
          <span><span className="dot earned" /> Completed ({earnedCredits})</span>
          <span><span className="dot in-progress" /> In Progress ({inProgressCredits})</span>
          <span><span className="dot planned" /> Planned ({plannedCredits})</span>
        </div>
        {overflowCredits > 0 && (
          <div className="overflow-note">Over planned by {overflowCredits} ECTS</div>
        )}
      </div>
    </div>
  );
}

function ModuleModal({ onClose, onAdd, allSemesters, containers, initialSemester }) {
  const [name, setName] = useState('');
  const [credits, setCredits] = useState(String(getDefaultCreditsForContainer(containers[0])));
  const [semester, setSemester] = useState(initialSemester || allSemesters[0]);
  const [container, setContainer] = useState(containers[0]);
  const [status, setStatus] = useState(STATUSES[0]);
  const [grade, setGrade] = useState('');
  const [creditsTouched, setCreditsTouched] = useState(false);

  const handleContainerChange = (nextContainer) => {
    setContainer(nextContainer);
    if (!creditsTouched) {
      setCredits(String(getDefaultCreditsForContainer(nextContainer)));
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) {
      window.alert('Please enter a module name.');
      return;
    }
    if (!isValidCredits(credits)) {
      window.alert('Please enter valid ECTS between 0.5 and 30.');
      return;
    }
    if (status === 'Completed' && !isValidGrade(grade)) {
      window.alert(`Please use a valid grade: ${VALID_GRADES.join(', ')}`);
      return;
    }
    onAdd({
      name: name.trim(),
      credits: parseNumberInput(credits),
      semester,
      container,
      status,
      grade: status === 'Completed' && grade !== '' ? parseNumberInput(grade) : '',
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <h2>Add New Module</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Module Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} autoFocus required placeholder="e.g. Data Structures" />
          </div>
          <div className="form-group-row">
            <div className="form-group">
              <label>Credits (ECTS)</label>
              <input
                type="text"
                inputMode="decimal"
                value={credits}
                onChange={e => {
                  setCredits(e.target.value);
                  setCreditsTouched(true);
                }}
              />
            </div>
            <div className="form-group">
              <label>Status</label>
              <select value={status} onChange={e => setStatus(e.target.value)}>
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          {status === 'Completed' && (
            <div className="form-group">
              <label>Grade</label>
              <input
                type="text"
                inputMode="decimal"
                value={grade}
                onChange={e => setGrade(e.target.value)}
                placeholder="e.g. 1.7"
              />
              <span className="helper-text">Valid grades: {VALID_GRADES.join(', ')}</span>
            </div>
          )}
          <div className="form-group-row">
            <div className="form-group">
              <label>Semester</label>
              <select value={semester} onChange={e => setSemester(e.target.value)}>
                {allSemesters.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Container</label>
              <select value={container} onChange={e => handleContainerChange(e.target.value)}>
                {containers.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="helper-text">Suggested ECTS are filled automatically based on the selected container until you edit them yourself.</div>
          <div className="modal-actions">
            <button type="button" className="btn-cancel" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-submit">Add Module</button>
          </div>
        </form>
      </div>
    </div>
  );
}
