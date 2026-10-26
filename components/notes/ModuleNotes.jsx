import React from 'react';
import { normalizeNotes } from '../../planner-preferences.mjs';
import NoteCard from './NoteCard';

export default function ModuleNotes({ module, onUpdate }) {
  const notes = normalizeNotes(module.notes);
  const updateNote = (id, patch) => {
    onUpdate({ notes: notes.map(note => note.id === id ? { ...note, ...patch } : note) });
  };
  const addNote = () => {
    onUpdate({ notes: [...notes, {
      id: crypto.randomUUID(),
      title: `Note ${notes.length + 1}`,
      text: '',
      color: '#a5b4fc',
      size: 'medium',
      expanded: true,
    }] });
  };
  const deleteNote = (note) => {
    if (!note.text.trim() || window.confirm('Delete this note? You can undo with Ctrl+Z.')) {
      onUpdate({ notes: notes.filter(item => item.id !== note.id) });
    }
  };

  return (
    <section className="module-notes" aria-label={`Notes for ${module.name}`} onDragStart={event => event.stopPropagation()}>
      <div className="notes-list-heading">
        <span>Notes <small>{notes.length}</small></span>
        <button type="button" className="add-note-btn" onClick={addNote} aria-label={`Add note to ${module.name}`}>
          + Add note
        </button>
      </div>
      {notes.map((note, index) => (
        <NoteCard
          key={note.id}
          note={note}
          index={index}
          moduleId={module.id}
          moduleName={module.name}
          onUpdate={patch => updateNote(note.id, patch)}
          onDelete={() => deleteNote(note)}
        />
      ))}
    </section>
  );
}
