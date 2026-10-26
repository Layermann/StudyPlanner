import React, { useState } from 'react';
import PlannerDialog from './PlannerDialog';

export default function DegreeSwitcher({ planner, onSelect, onOverview, onAction }) {
  const [mode, setMode] = useState(null);
  const active = planner.degrees.find(degree => degree.id === planner.activeDegreeId);
  const [name, setName] = useState(''); const [type, setType] = useState('master'); const [credits, setCredits] = useState('120'); const [error, setError] = useState(null);
  const open = mode => { setMode(mode); setError(null); setName(mode === 'edit' ? active.title : ''); setType(mode === 'edit' ? active.type : 'master'); setCredits('120'); };
  return <nav className="degree-navigation" aria-label="Studiengänge">
    <label className="degree-select-label">Aktiver Studiengang<select id="degree-switcher" value={planner.activeDegreeId} onChange={event => onSelect(event.target.value)}>{planner.degrees.map(degree => <option key={degree.id} value={degree.id}>{degree.title}</option>)}</select></label>
    <div className="degree-navigation-actions">
      <button className="secondary-btn" onClick={() => open('create')}>+ Studiengang</button>
      <button className="secondary-btn" onClick={() => open('edit')}>Verwalten</button>
      {planner.degrees.length > 1 && <button className="secondary-btn" onClick={onOverview}>Alle Studiengänge</button>}
    </div>
    {mode && <PlannerDialog title={mode === 'create' ? 'Studiengang hinzufügen' : 'Studiengang verwalten'} onClose={() => setMode(null)}>
      <form onSubmit={event => {
        event.preventDefault();
        try {
          if (!name.trim()) throw new Error('Bitte einen Namen eingeben.');
          onAction(() => {
            const saved = mode === 'create' ? planner.addDegree(name, type, credits) : planner.updateDegree(name.trim(), type);
            if (saved) setMode(null);
          });
        } catch (error) { setError(error.message); }
      }}>
        <label>Studiengangname<input autoFocus required value={name} onChange={event => setName(event.target.value)} /></label>
        <label>Abschluss<select value={type} onChange={event => { setType(event.target.value); setCredits(event.target.value === 'bachelor' ? '180' : event.target.value === 'master' ? '120' : ''); }}><option value="bachelor">Bachelor</option><option value="master">Master</option><option value="other">Sonstiger</option></select></label>
        {mode === 'create' && <><label>ECTS-Ziel<input required inputMode="decimal" value={credits} onChange={event => setCredits(event.target.value)} /></label><p className="helper-text">Das Ziel wird als Kategorie „Studienleistungen“ angelegt. Danach bestimmen die eingeschlossenen Kategorien die Gesamt-ECTS.</p></>}
        {error && <p role="alert">{error}</p>}
        <div className="modal-actions"><button type="button" className="btn-cancel" onClick={() => setMode(null)}>Abbrechen</button><button type="submit" className="btn-submit">{mode === 'create' ? 'Anlegen' : 'Speichern'}</button></div>
      </form>
      {mode === 'edit' && <div className="degree-danger"><button className="secondary-btn" disabled={planner.degrees.length === 1} onClick={() => {
        if (window.confirm(`„${active.title}“ mit allen Modulen löschen? Ein lokaler Wiederherstellungspunkt wird gespeichert.`)) onAction(() => { if (planner.deleteDegree(active.id)) setMode(null); });
      }}>Studiengang löschen</button>{planner.degrees.length === 1 && <p className="helper-text">Der letzte Studiengang bleibt erhalten.</p>}</div>}
    </PlannerDialog>}
  </nav>;
}
