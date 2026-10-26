import React from 'react';
import { Trash2 } from 'lucide-react';
import InlineEditable from '../InlineEditable';
import ModuleCard from '../modules/ModuleCard';

export default function SemesterColumn({
  title,
  modules,
  containers,
  requirementColors,
  draggedModuleId,
  dropTarget,
  onMoveContainer,
  onRenameSemester,
  onAddModule,
  onUpdateModule,
  onUpdateCredits,
  onDragModuleStart,
  onDragModuleEnd,
  onDragOverSemester,
  onDropModule,
  onDelete,
  onToggleStatus,
  onUpdateGrade,
  canRemove,
  onRemoveSemester,
}) {
  const credits = modules.reduce((sum, m) => sum + m.credits, 0);
  const isDropActive = dropTarget?.semester === title;
  const getInsertionIndexFromPointer = (event, index) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const midpoint = bounds.top + (bounds.height / 2);
    return event.clientY < midpoint ? index : index + 1;
  };

  return (
    <div
      className={`semester-col ${isDropActive ? 'drop-active' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOverSemester(title, modules.length);
      }}
      onDrop={() => onDropModule(title, modules.length)}
    >
      <div className="semester-header">
        <InlineEditable
          className="semester-title-edit"
          value={title}
          onSave={(newTitle) => onRenameSemester(title, newTitle)}
        >
          <h3>{title}</h3>
        </InlineEditable>
        <div className="semester-header-actions">
          <button
            type="button"
            className="semester-icon-btn add-module-btn"
            onClick={() => onAddModule(title)}
            title={`Add module to ${title}`}
          >
            +
          </button>
          <span className="credits-badge">{credits} ECTS</span>
        </div>
      </div>
      {canRemove && (
        <button
          type="button"
          className="semester-delete-btn"
          onClick={() => onRemoveSemester(title)}
          title={`Remove ${title}`}
        >
          <Trash2 size={14} />
        </button>
      )}
      <div className="module-list">
        {modules.map((module, index) => (
          <React.Fragment key={module.id}>
            <div
              className={`module-drop-zone ${dropTarget?.semester === title && dropTarget?.index === index ? 'active' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDragOverSemester(title, index);
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDropModule(title, index);
              }}
            />
            <ModuleCard
              module={module}
              containers={containers}
              requirementColors={requirementColors}
              isDragging={draggedModuleId === module.id}
              title={title}
              onDragModuleStart={onDragModuleStart}
              onDragModuleEnd={onDragModuleEnd}
              onDragOverSemester={onDragOverSemester}
              onDropModule={onDropModule}
              getInsertionIndexFromPointer={event => getInsertionIndexFromPointer(event, index)}
              onUpdateModule={onUpdateModule}
              onToggleStatus={onToggleStatus}
              onUpdateCredits={onUpdateCredits}
              onUpdateGrade={onUpdateGrade}
              onMoveContainer={onMoveContainer}
              onDelete={onDelete}
            />
          </React.Fragment>
        ))}
        <div
          className={`module-drop-zone end-zone ${dropTarget?.semester === title && dropTarget?.index === modules.length ? 'active' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDragOverSemester(title, modules.length);
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDropModule(title, modules.length);
          }}
        />
        {modules.length === 0 && (
          <div className={`empty-state ${isDropActive ? 'drop-active' : ''}`}>No modules planned</div>
        )}
      </div>
    </div>
  );
}
