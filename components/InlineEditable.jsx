import React, { useState, useEffect } from 'react';

export default function InlineEditable({ value, onSave, children, className = '', inputMode = 'text', placeholder = '' }) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftValue, setDraftValue] = useState(value);

  useEffect(() => {
    if (!isEditing) {
      setDraftValue(value);
    }
  }, [value, isEditing]);

  const finishEditing = (shouldSave) => {
    if (shouldSave) {
      onSave(draftValue);
    } else {
      setDraftValue(value);
    }
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <input
        className={`inline-edit-input ${className}`.trim()}
        type="text"
        inputMode={inputMode}
        value={draftValue}
        placeholder={placeholder}
        autoFocus
        onChange={(e) => setDraftValue(e.target.value)}
        onBlur={() => finishEditing(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            finishEditing(true);
          }
          if (e.key === 'Escape') {
            finishEditing(false);
          }
        }}
      />
    );
  }

  return (
    <div
      className={`inline-edit-display ${className}`.trim()}
      onDoubleClick={() => setIsEditing(true)}
      title="Double-click to edit"
    >
      {children}
    </div>
  );
}
