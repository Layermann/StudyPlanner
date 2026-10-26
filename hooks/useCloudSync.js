import { useState, useEffect, useRef } from 'react';
import { createPlanSync } from '../plan-sync.mjs';

export default function useCloudSync({ client: supabase, owner: cloudOwner, enabled = true, planner }) {
  const { theme, plannerTitle, semesters, requirements, modules, currentSnapshotRef, applyCloudPlan } = planner;
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState(null);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [initialSyncDone, setInitialSyncDone] = useState(false);
  const lastCloudPayloadRef = useRef(null);
  const cloudSyncRef = useRef(null);
  const [cloudReload, setCloudReload] = useState(0);
  const [readyCloudSync, setReadyCloudSync] = useState(null);

  useEffect(() => {
    setInitialSyncDone(false);
    setReadyCloudSync(null);
    setSyncError(null);
    setLastSavedAt(null);
    lastCloudPayloadRef.current = null;
    if (!cloudOwner || !supabase || !enabled) {
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
          const normalizedPayload = applyCloudPlan(data.data);
          setLastSavedAt(data.updated_at);
          lastCloudPayloadRef.current = JSON.stringify(normalizedPayload);
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
  }, [cloudOwner, cloudReload, supabase, enabled, applyCloudPlan, currentSnapshotRef]);

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

  const reloadCloud = () => {
    if (window.confirm('Cloud-Plan neu laden? Der lokale Stand wird ersetzt. Bitte zuvor mit Export JSON sichern.')) {
      setCloudReload(value => value + 1);
    }
  };

  return { isSyncing, syncError, lastSavedAt, reloadCloud };
}
