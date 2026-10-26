import React from 'react';

export default function AddSemesterCard({ nextSemesterLabel, onAddSemester }) {
  return (
    <button type="button" className="semester-col add-semester-card" onClick={onAddSemester}>
      <div className="add-semester-content">
        <span className="add-semester-plus">+</span>
        <span className="add-semester-label">{nextSemesterLabel}</span>
      </div>
    </button>
  );
}
