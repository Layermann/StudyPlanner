import React from 'react';
import { Trash2 } from 'lucide-react';

export default function NoteCard({ note, index, moduleId, moduleName, onUpdate, onDelete }) {
  const bodyId = `notes-${moduleId}-${note.id}`;
  const label = `Note ${index + 1}`;

  return (
    <div className="note-item" style={{ '--note-color': note.color }}>
      <button
        type="button"
        className="notes-toggle"
        aria-expanded={note.expanded}
        aria-controls={bodyId}
        onClick={() => onUpdate({ expanded: !note.expanded })}
      >
        <span aria-hidden="true">{note.expanded ? '▾' : '▸'}</span>
        <span>{note.title || label}</span>
      </button>
      {note.expanded && (
        <div id={bodyId} className="notes-body">
          <div className="notes-tools">
            <input
              className="notes-title"
              aria-label={`${label} title for ${moduleName}`}
              value={note.title}
              placeholder="Note title"
              maxLength={80}
              onChange={event => onUpdate({ title: event.target.value })}
            />
            <input
              type="color"
              aria-label={`${label} color for ${moduleName}`}
              value={note.color}
              onChange={event => onUpdate({ color: event.target.value })}
            />
            <select
              aria-label={`${label} text size for ${moduleName}`}
              value={note.size}
              onChange={event => onUpdate({ size: event.target.value })}
            >
              <option value="small">Small</option>
              <option value="medium">Medium</option>
              <option value="large">Large</option>
            </select>
          </div>
          <textarea
            aria-label={`${label} text for ${moduleName}`}
            value={note.text}
            onChange={event => onUpdate({ text: event.target.value })}
            placeholder="Deadlines, links, ideas…"
            rows={4}
            className={`note-size-${note.size}`}
          />
          <button type="button" className="remove-note-btn" aria-label={`Delete note ${index + 1} from ${moduleName}`} onClick={onDelete}>
            <Trash2 size={12} /> Delete note
          </button>
        </div>
      )}
    </div>
  );
}
