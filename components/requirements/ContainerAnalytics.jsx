import React from 'react';
import { Trash2, Eye, EyeOff } from 'lucide-react';
import InlineEditable from '../InlineEditable';

export default function ContainerAnalytics({
  requirement,
  color,
  onColorChange,
  modules,
  index,
  isDragging,
  isDropTarget,
  onDragStart,
  onDragEnd,
  onDragOverAt,
  onDropAt,
  onRename,
  onUpdateCredits,
  onDelete,
  onToggleCount,
}) {
  const { title, requiredCredits, countTowardsTotal } = requirement;
  const isIncluded = countTowardsTotal !== false;
  const getInsertionIndexFromPointer = (event) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const midpoint = bounds.top + (bounds.height / 2);
    return event.clientY < midpoint ? index : index + 1;
  };
  const earnedCredits = modules.filter(m => m.status === 'Completed').reduce((sum, m) => sum + m.credits, 0);
  const inProgressCredits = modules.filter(m => m.status === 'In Progress').reduce((sum, m) => sum + m.credits, 0);
  const plannedCredits = modules.filter(m => m.status === 'Planned').reduce((sum, m) => sum + m.credits, 0);
  const totalCredits = earnedCredits + inProgressCredits + plannedCredits;
  const overflowCredits = Math.max(totalCredits - requiredCredits, 0);

  const earnedPercentage = Math.min((earnedCredits / requiredCredits) * 100, 100);
  const inProgressPercentage = Math.min((inProgressCredits / requiredCredits) * 100, 100 - earnedPercentage);
  const plannedPercentage = Math.min((plannedCredits / requiredCredits) * 100, 100 - earnedPercentage - inProgressPercentage);

  return (
    <div className="requirement-dnd-item">
      <div
        className={`requirement-drop-zone ${isDropTarget ? 'active' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDragOverAt(index);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDropAt(index);
        }}
      />
      <div
        style={{ borderTop: `3px solid ${color}` }}
        data-requirement-id={requirement.id}
        className={`analytics-card ${overflowCredits > 0 ? 'is-overfull' : ''} ${isDragging ? 'is-dragging' : ''} ${!isIncluded ? 'is-excluded' : ''}`}
        draggable
        onDragStart={(e) => onDragStart(e, requirement.id)}
        onDragEnd={onDragEnd}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDragOverAt(getInsertionIndexFromPointer(e));
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDropAt(getInsertionIndexFromPointer(e));
        }}
      >
        <div className="requirement-color-row" onDragStart={e => e.stopPropagation()}>
          <label className="color-control"><input type="color" value={color} onChange={e => onColorChange(e.target.value)} aria-label={`Color for ${title}`} /><span>Tag color</span></label>
          {requirement.color && <button type="button" className="text-button" onClick={() => onColorChange(null)}>Use palette</button>}
        </div>
        <div className="ac-header">
          <InlineEditable className="requirement-title-edit" value={title} onSave={onRename}>
            <h3>{title}</h3>
          </InlineEditable>
          <div className="requirement-header-actions">
            <button
               type="button"
               className={`requirement-toggle-btn ${isIncluded ? 'included' : 'excluded'}`}
               onClick={onToggleCount}
               title={isIncluded ? 'Included in total progress' : 'Excluded from total progress'}
            >
               {isIncluded ? <Eye size={15} /> : <EyeOff size={15} />}
            </button>
            <InlineEditable className="requirement-credits-edit" value={String(requiredCredits)} inputMode="decimal" onSave={onUpdateCredits}>
              <span className="fraction">{totalCredits} / {requiredCredits} ECTS</span>
            </InlineEditable>
            <button type="button" className="requirement-delete-btn" onClick={onDelete} title={`Delete ${title}`}>
              <Trash2 size={15} />
            </button>
          </div>
        </div>
        <div className="progress-bar">
          <div className="progress-fill earned" style={{ width: `${earnedPercentage}%` }} />
          <div className="progress-fill in-progress" style={{ width: `${inProgressPercentage}%` }} />
          <div className="progress-fill planned" style={{ width: `${plannedPercentage}%` }} />
        </div>
        <div className="ac-legend">
          <span><span className="dot earned" /> Completed ({earnedCredits})</span>
          <span><span className="dot in-progress" /> In Progress ({inProgressCredits})</span>
          <span><span className="dot planned" /> Planned ({plannedCredits})</span>
        </div>
        {overflowCredits > 0 && (
          <div className="overflow-note">Over planned by {overflowCredits} ECTS</div>
        )}
      </div>
    </div>
  );
}
