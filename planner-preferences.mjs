export const PALETTES = [
  { id: 'midnight', name: 'Midnight', background: '#0b0f19', colors: ['#a5b4fc', '#67e8f9', '#f9a8d4', '#fcd34d', '#c4b5fd', '#6ee7b7', '#fda4af'] },
  { id: 'graphite', name: 'Graphite', background: '#151618', colors: ['#bcc4d3', '#9caec0', '#b6adb9', '#c4baa7', '#a8adc5', '#a5bab2', '#c1adb0'] },
  { id: 'ocean', name: 'Deep Ocean', background: '#0e1720', colors: ['#92b4d2', '#83b9c2', '#a2b2ca', '#b7bfcc', '#9aa9c7', '#94b6ae', '#b0acc1'] },
  { id: 'porcelain', name: 'Porcelain', background: '#f3f5f7', colors: ['#526583', '#4c737a', '#746780', '#807354', '#646a90', '#54776a', '#856773'] },
];
export const normalizeTheme = value => {
  const migrated = ({ forest: 'graphite', dusk: 'ocean', paper: 'porcelain' })[value] || value;
  return PALETTES.some(p => p.id === migrated) ? migrated : 'midnight';
};
export const normalizeColor = value => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value) ? value : null;
export const requirementColor = (requirement, index, theme) => normalizeColor(requirement.color) || PALETTES.find(p => p.id === normalizeTheme(theme)).colors[index % 7];
const normalizeNote = (notes, id) => ({
  id,
  title: typeof notes?.title === 'string' ? notes.title.slice(0, 80) : 'Notes',
  text: typeof notes === 'string' ? notes : typeof notes?.text === 'string' ? notes.text : '',
  color: normalizeColor(notes?.color) || '#a5b4fc',
  size: ['small', 'medium', 'large'].includes(notes?.size) ? notes.size : 'medium',
  expanded: notes?.expanded === true,
});
// Migrate the original single note without losing text or custom formatting.
export const normalizeNotes = value => {
  if (value == null) return [];
  if (!Array.isArray(value) && typeof value !== 'string' && typeof value !== 'object') return [];
  if (!Array.isArray(value) && !value.text && !value.expanded && (!value.title || value.title === 'Notes') && (!value.color || value.color === '#a5b4fc') && (!value.size || value.size === 'medium') && typeof value !== 'string') return [];
  if (value === '') return [];
  const used = new Set();
  return (Array.isArray(value) ? value : [value])
    .filter(note => note != null && (typeof note === 'object' || typeof note === 'string'))
    .map((note, index) => {
      let id = typeof note.id === 'string' && /^[a-zA-Z0-9_-]+$/.test(note.id) ? note.id : `note-${index}`;
      while (used.has(id)) id += `-${index}`;
      used.add(id);
      return normalizeNote(note, id);
    });
};
export function contrastInk(color) {
  const rgb = (normalizeColor(color) || '#a5b4fc').slice(1).match(/../g).map(v => {
    const c = parseInt(v, 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  return luminance > 0.179 ? '#000000' : '#ffffff';
}
