import { useState, useEffect, useRef } from 'react';
import { createPlanSync } from '../plan-sync.mjs';
import { readDocument } from '../multi-degree.mjs';
import { reconciliation, serializePlan } from '../planner-storage.mjs';

export default function useCloudSync({ client, owner, enabled = true, planner, debounceMs = 1500 }) {
  const { document, scope, getWorkspace, applyCloudPlan, markSynced } = planner;
  const available = !!planner.workspace;
  const [status, setStatus] = useState({ scope, syncing: false, error: null, saved: null, choice: null });
  const [reload, setReload] = useState(0);
  const controller = useRef(null);
  const lastSaved = useRef(null);
  const ready = useRef(false);
  const permission = useRef(null);
  const [readyTick, setReadyTick] = useState(0);
  const currentScope = useRef(scope); currentScope.current = scope;
  const isActive = sync => controller.current === sync && currentScope.current === scope;
  const update = patch => setStatus(previous => ({ ...(previous.scope === scope ? previous : { scope, saved: null }), ...patch, scope }));
  useEffect(() => {
    ready.current = false; lastSaved.current = null;
    setStatus({ scope, syncing: false, error: null, saved: null, choice: null });
    if (!owner || !client || !enabled || !getWorkspace()) return;
    const sync = createPlanSync(client, owner); controller.current = sync;
    const initial = serializePlan(getWorkspace().document);
    let canceled = false;
    update({ syncing: true });
    (async () => {
      try {
        const row = await sync.load();
        if (canceled || !isActive(sync)) return;
        const local = getWorkspace();
        if (!local || serializePlan(local.document) !== initial) throw new Error('Während des Ladens wurde lokal bearbeitet. Bitte exportieren und erneut laden.');
        const remote = row ? readDocument(row.data) : null;
        const decision = reconciliation(local, remote);
        const approval = permission.current; permission.current = null;
        if (decision === 'conflict' || decision === 'confirm-local') {
          if (!approval || approval.scope !== scope || approval.remote !== (remote ? serializePlan(remote) : null) || approval.local !== serializePlan(local.document)) {
            update({ choice: { remote, local: local.document }, error: null, saved: row?.updated_at ?? null }); return;
          }
          // Explicitly approved local replacement, still subject to the fresh revision read.
          lastSaved.current = remote ? serializePlan(remote) : null;
        } else if (remote) {
          if (decision === 'cloud') applyCloudPlan(remote);
          else markSynced(serializePlan(remote));
          lastSaved.current = serializePlan(remote);
        }
        ready.current = true; update({ saved: row?.updated_at ?? null }); setReadyTick(value => value + 1);
      } catch (error) {
        if (!canceled && isActive(sync)) { sync.dispose(); update({ error: `Cloud-Speichern pausiert: ${error.message}. Der lokale Stand bleibt exportierbar.` }); }
      } finally { if (!canceled && isActive(sync)) update({ syncing: false }); }
    })();
    return () => { canceled = true; ready.current = false; sync.dispose(); if (controller.current === sync) controller.current = null; };
  }, [scope, owner, client, enabled, available, reload, getWorkspace, applyCloudPlan, markSynced]);

  useEffect(() => {
    const sync = controller.current;
    if (!owner || !enabled || !sync || !ready.current || !document) return;
    const snapshot = serializePlan(document);
    if (snapshot === lastSaved.current) return;
    const timer = setTimeout(async () => {
      if (!isActive(sync) || !ready.current) return;
      update({ syncing: true });
      try {
        const saved = await sync.save(document);
        if (!isActive(sync)) return;
        if (!markSynced(snapshot)) throw new Error('Cloud gespeichert, lokaler Cache konnte nicht aktualisiert werden');
        lastSaved.current = snapshot; update({ saved: saved.updated_at, error: null });
      } catch (error) {
        if (isActive(sync)) { ready.current = false; update({ error: error.code === 'conflict' ? 'In einer anderen Sitzung geändert. Speichern ist pausiert. Exportiere deinen Stand und lade die Cloud neu.' : `Speichern pausiert: ${error.message}. Exportiere deinen lokalen Stand.` }); }
      } finally { if (isActive(sync)) update({ syncing: false }); }
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [document, scope, owner, enabled, readyTick, markSynced, debounceMs]);

  const visible = status.scope === scope ? status : {};
  const chooseCloud = () => {
    if (!visible.choice?.remote) return;
    if (!window.confirm('Cloud-Stand verwenden? Der lokale Stand wird als Wiederherstellungspunkt gesichert.')) return;
    try { applyCloudPlan(visible.choice.remote); setReload(value => value + 1); } catch (error) { update({ error: error.message }); }
  };
  const chooseLocal = () => {
    const local = getWorkspace();
    if (!local || !visible.choice || !window.confirm('Den vollständigen Cloud-Plan durch den lokalen Stand ersetzen? Vorher bei Bedarf beide Stände exportieren.')) return;
    permission.current = { scope, remote: visible.choice.remote ? serializePlan(visible.choice.remote) : null, local: serializePlan(local.document) };
    setReload(value => value + 1);
  };
  return {
    isSyncing: visible.syncing, syncError: visible.error, lastSavedAt: visible.saved,
    cloudChoice: visible.choice, chooseCloud, chooseLocal,
    reloadCloud: () => setReload(value => value + 1),
  };
}
