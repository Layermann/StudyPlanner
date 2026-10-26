import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import { PALETTES } from '../planner-preferences.mjs';

export default function AppearancePanel({ theme, onThemeChange }) {
  return (
<section className="appearance-panel" id="appearance-panel" aria-label="Planner appearance">
        <div><h2>Make it yours</h2><p>Choose a palette. Custom requirement colors stay as you set them.</p></div>
        <div className="palette-options">{PALETTES.map(palette => <button key={palette.id} type="button" className={`palette-option ${theme === palette.id ? 'selected' : ''}`} aria-pressed={theme === palette.id} onClick={() => onThemeChange(palette.id)}>
          <span className="palette-preview" style={{background: palette.background}}>{palette.colors.slice(0, 4).map(color => <i key={color} style={{background: color}} />)}</span>
          <span>{palette.name}</span>{theme === palette.id && <CheckCircle2 size={15} />}
        </button>)}</div>
      </section>
  );
}
