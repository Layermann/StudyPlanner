import React from 'react';
import DegreeProgress from './DegreeProgress';
import { degreeView, degreeStats } from '../multi-degree.mjs';

export default function MultiDegreeOverview({ degrees, onOpen }) {
  const totals = degrees.map(degreeStats).reduce((sum, stats) => ({ required: sum.required + stats.required, completed: sum.completed + stats.completed, inProgress: sum.inProgress + stats.inProgress, planned: sum.planned + stats.planned }), { required: 0, completed: 0, inProgress: 0, planned: 0 });
  return <section className="degree-overview" aria-labelledby="overview-title">
    <h2 id="overview-title">Alle Studiengänge</h2>
    <div className="degree-summary"><strong>{degrees.length} Studiengänge</strong><span>{totals.completed} / {totals.required} ECTS abgeschlossen</span><span>{totals.inProgress} in Bearbeitung · {totals.planned} geplant</span></div>
    <p className="helper-text">Die Summe zählt die einzelnen Pläne zusammen. Sie beschreibt keine studiengangübergreifende Anerkennung eindeutiger Leistungspunkte.</p>
    <div className="degree-grid">{degrees.map(degree => {
      const view = degreeView(degree);
      return <article className="degree-overview-card" key={degree.id}>
        <span className="cloud-eyebrow">{{ bachelor: 'Bachelor', master: 'Master', other: 'Sonstiger Abschluss' }[degree.type]}</span>
        <h3>{degree.title}</h3>
        <DegreeProgress modules={view.modules} requirements={view.requirements} />
        <button className="secondary-btn" onClick={() => onOpen(degree.id)}>Studiengang öffnen</button>
      </article>;
    })}</div>
  </section>;
}
