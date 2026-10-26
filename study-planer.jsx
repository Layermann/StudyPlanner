import usePlanner from './hooks/usePlanner';
import useCloudSync from './hooks/useCloudSync';
import DegreeProgress from './components/DegreeProgress';
import AppearancePanel from './components/AppearancePanel';
import ModuleModal from './components/modules/ModuleModal';
import ContainerAnalytics from './components/requirements/ContainerAnalytics';
import AddSemesterCard from './components/semesters/AddSemesterCard';
import InlineEditable from './components/InlineEditable';
import SemesterColumn from './components/semesters/SemesterColumn';
import { DEFAULT_SEMESTERS, moveModuleToPosition, moveRequirementToPosition, resequenceModules, sortModulesForDisplay, isValidCredits, parseNumberInput } from './planner-model.mjs';
import { IS_DEMO } from './planner-config.mjs';
import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { BookOpen, GraduationCap, Cloud, LogOut } from 'lucide-react';
import { supabase } from './supabaseClient';
import { normalizeColor, requirementColor } from './planner-preferences.mjs';

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

export default function StudyPlaner() {
  const planner = usePlanner();
  const {
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
    addModule: addPlannerModule,
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
  } = planner;
  const [isAppearanceOpen, setIsAppearanceOpen] = useState(false);
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
  const { isSyncing, syncError, lastSavedAt, reloadCloud } = useCloudSync({ client: supabase, owner: session?.user?.id ?? null, enabled: !IS_DEMO, planner });
  const fileInputRef = useRef(null);
  const googleButtonRef = useRef(null);
  const googleNonceRef = useRef(null);
  const previousModulePositionsRef = useRef(new Map());
  const previousRequirementPositionsRef = useRef(new Map());
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

  const highestRemovableSemester = semesters.length > DEFAULT_SEMESTERS.length ? semesters[semesters.length - 1] : null;

  const closeModal = () => {
    setIsFormOpen(false);
    setModalInitialSemester(null);
  };

  const addModule = (newModule) => {
    addPlannerModule(newModule);
    closeModal();
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

      {isAppearanceOpen && <AppearancePanel theme={theme} onThemeChange={setTheme} />}
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
              {syncError && <button type="button" className="cloud-logout-btn" onClick={reloadCloud}>Cloud neu laden</button>}
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

      <DegreeProgress modules={orderedModules} requirements={requirements} />

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
