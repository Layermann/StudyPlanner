import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { normalizeTheme } from '../planner-preferences.mjs';
import { DEFAULT_TITLE, DEFAULT_REQUIREMENTS, DEFAULT_SEMESTERS, normalizeRequirements, normalizeSemesterList, normalizeModules, sortModulesForDisplay, resequenceModules, groupBy, isValidCredits, parseNumberInput, normalizeGradeValue, isValidGrade, VALID_GRADES } from '../planner-model.mjs';
import { IS_DEMO, THEME_STORAGE_KEY, STORAGE_KEY, SEMESTER_STORAGE_KEY, TITLE_STORAGE_KEY, REQUIREMENTS_STORAGE_KEY, DEMO_MODULES } from '../planner-config.mjs';

export default function usePlanner() {
  const [theme, setTheme] = useState(() => normalizeTheme(localStorage.getItem(THEME_STORAGE_KEY)));
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
  const historyRef = useRef([]);
  const currentSnapshotRef = useRef(null);
  const isRestoringHistoryRef = useRef(false);
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

  const addModule = (newModule) => {
    setModules((currentModules) => resequenceModules(sortModulesForDisplay([
      ...currentModules,
      { id: Date.now().toString(), ...newModule, order: Number.MAX_SAFE_INTEGER },
    ], semesters)));
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

  const applyCloudPlan = useCallback((payload) => {
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
    historyRef.current = [];
    isRestoringHistoryRef.current = true;
    return { theme: nextTheme, plannerTitle: nextPlannerTitle, semesters: nextSemesters, requirements: nextRequirements, modules: nextModules };
  }, []);

  return {
    theme,
    setTheme,
    plannerTitle,
    setPlannerTitle,
    requirements,
    setRequirements,
    semesters,
    setSemesters,
    modules,
    setModules,
    containerTitles,
    orderedModules,
    modulesBySemester,
    modulesByContainer,
    addModule,
    deleteModule,
    updateModule,
    moveContainer,
    updateCredits,
    addSemester,
    removeSemester,
    renameSemester,
    toggleStatus,
    updateGrade,
    handleExport,
    handleImportFile,
    applyCloudPlan,
    currentSnapshotRef
  };
}
