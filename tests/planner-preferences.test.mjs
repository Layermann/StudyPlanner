import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeNotes, normalizeTheme, normalizeColor, requirementColor, contrastInk, PALETTES } from '../planner-preferences.mjs';

test('legacy single notes migrate without losing text, appearance or expanded state', () => {
  const notes = normalizeNotes({title:'Exam',text:'One\nTwo',color:'#123456',size:'large',expanded:true});
  assert.equal(notes.length,1);
  assert.deepEqual(notes[0], {id:'note-0',title:'Exam',text:'One\nTwo',color:'#123456',size:'large',expanded:true});
  assert.equal(normalizeNotes('Old plain-text note')[0].text,'Old plain-text note');
  assert.deepEqual(normalizeNotes(null),[]);
});

test('multiple notes preserve independent state across JSON roundtrip', () => {
  const notes=normalizeNotes([{id:'a',text:'First',expanded:false},{id:'b',text:'Second',expanded:true}]);
  assert.deepEqual(normalizeNotes(JSON.parse(JSON.stringify(notes))),notes);
  assert.equal(notes[0].expanded,false);
  assert.equal(notes[1].expanded,true);
});

test('duplicate note identifiers are repaired without losing notes', () => {
  const notes=normalizeNotes([{id:'same',text:'First'},{id:'same',text:'Second'},null]);
  assert.equal(notes.length,2);
  assert.equal(new Set(notes.map(note=>note.id)).size,2);
});

test('custom tag colors survive all palette choices and invalid values fall back', () => {
  for (const palette of PALETTES) assert.equal(requirementColor({color:'#123456'},0,palette.id),'#123456');
  assert.equal(normalizeTheme('forest'),'graphite');
  assert.equal(normalizeTheme('unknown'),'midnight');
  assert.equal(normalizeColor('url(example)'),null);
  assert.equal(contrastInk('#ffffff'),'#000000');
  assert.equal(contrastInk('#000000'),'#ffffff');
});
