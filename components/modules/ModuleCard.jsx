import React from 'react';
import { Trash2, CheckCircle2 } from 'lucide-react';
import { contrastInk } from '../../planner-preferences.mjs';
import { formatGrade } from '../../planner-model.mjs';
import InlineEditable from '../InlineEditable';
import ModuleNotes from '../notes/ModuleNotes';

export default function ModuleCard({
  module,
  containers,
  requirementColors,
  isDragging,
  title,
  onDragModuleStart,
  onDragModuleEnd,
  onDragOverSemester,
  onDropModule,
  getInsertionIndexFromPointer,
  onUpdateModule,
  onToggleStatus,
  onUpdateCredits,
  onUpdateGrade,
  onMoveContainer,
  onDelete,
}) {
  return (
    <div
      data-module-id={module.id}
      className={`module-card status-${module.status.toLowerCase().replace(' ', '-')} ${isDragging ? 'is-dragging' : ''}`}
      draggable
      onDragStart={(e) => onDragModuleStart(e, module.id)}
      onDragEnd={onDragModuleEnd}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onDragOverSemester(title, getInsertionIndexFromPointer(e));
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onDropModule(title, getInsertionIndexFromPointer(e));
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
  );
}
