import React, { useState } from 'react';
import { getDefaultCreditsForContainer, STATUSES, VALID_GRADES, isValidCredits, isValidGrade, parseNumberInput } from '../../planner-model.mjs';

export default function ModuleModal({ onClose, onAdd, allSemesters, containers, initialSemester }) {
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
