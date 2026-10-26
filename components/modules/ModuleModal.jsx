import React, { useState } from 'react';
import PlannerDialog from '../PlannerDialog';
import { getDefaultCreditsForContainer, STATUSES, VALID_GRADES, isValidCredits, isValidGrade, parseNumberInput } from '../../planner-model.mjs';

export default function ModuleModal({ onClose, onAdd, allSemesters, containers, initialSemester, formRef, degrees = [], activeDegreeId, onSwitchDegree }) {
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
    <PlannerDialog title="Add New Module" onClose={onClose}>
      <div className="module-form-content">
        {degrees.length > 1 && <label>Studiengang wechseln<select aria-label="Studiengang im Modulformular" value={activeDegreeId} onChange={event => onSwitchDegree(event.target.value)}>{degrees.map(degree => <option key={degree.id} value={degree.id}>{degree.title}</option>)}</select></label>}
        <form ref={formRef} onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="module-name">Module Name</label>
            <input id="module-name" type="text" value={name} onChange={e => setName(e.target.value)} autoFocus required placeholder="e.g. Data Structures" />
          </div>
          <div className="form-group-row">
            <div className="form-group">
              <label htmlFor="module-credits">Credits (ECTS)</label>
              <input
                id="module-credits" type="text"
                inputMode="decimal"
                value={credits}
                onChange={e => {
                  setCredits(e.target.value);
                  setCreditsTouched(true);
                }}
              />
            </div>
            <div className="form-group">
              <label htmlFor="module-status">Status</label>
              <select id="module-status" value={status} onChange={e => setStatus(e.target.value)}>
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          {status === 'Completed' && (
            <div className="form-group">
              <label htmlFor="module-grade">Grade</label>
              <input
                id="module-grade" type="text"
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
              <label htmlFor="module-semester">Semester</label>
              <select id="module-semester" value={semester} onChange={e => setSemester(e.target.value)}>
                {allSemesters.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="module-container">Container</label>
              <select id="module-container" value={container} onChange={e => handleContainerChange(e.target.value)}>
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
    </PlannerDialog>
  );
}
