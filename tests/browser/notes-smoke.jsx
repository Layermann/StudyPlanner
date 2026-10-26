import React, { act, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import ModuleNotes from '../../components/notes/ModuleNotes';

// A standalone fixture keeps the smoke test away from personal/demo plans.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const storageKey = `studyPlanner:notes-smoke:${crypto.randomUUID()}`;
const fixture = document.getElementById('fixture');
const result = document.getElementById('result');
let root;

function NotesFixture() {
  const [notes, setNotes] = useState(() => JSON.parse(localStorage.getItem(storageKey) || '[]'));
  useEffect(() => localStorage.setItem(storageKey, JSON.stringify(notes)), [notes]);
  return <ModuleNotes module={{ id: 'smoke', name: 'Smoke module', notes }} onUpdate={patch => setNotes(patch.notes)} />;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function field(label) {
  const element = fixture.querySelector(`[aria-label="${label}"]`);
  assert(element, `Missing field: ${label}`);
  return element;
}

async function click(element) {
  assert(element, 'Missing button');
  await act(async () => element.click());
}

async function change(element, value) {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value').set;
  await act(async () => {
    setter.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

async function mount() {
  root = createRoot(fixture);
  await act(async () => root.render(<NotesFixture />));
}

try {
  await mount();
  await click(field('Add note to Smoke module'));
  await change(field('Note 1 title for Smoke module'), 'First note');
  await change(field('Note 1 text for Smoke module'), 'Saved content');
  await change(field('Note 1 color for Smoke module'), '#123456');
  await change(field('Note 1 text size for Smoke module'), 'large');
  await click(field('Add note to Smoke module'));
  await change(field('Note 2 title for Smoke module'), 'Second note');

  await click(fixture.querySelector('.notes-toggle'));
  let toggles = fixture.querySelectorAll('.notes-toggle');
  assert(toggles[0].getAttribute('aria-expanded') === 'false', 'First note must collapse');
  assert(toggles[1].getAttribute('aria-expanded') === 'true', 'Second note must remain open');

  // Remount from persisted JSON rather than reusing in-memory React state.
  await act(async () => root.unmount());
  await mount();
  toggles = fixture.querySelectorAll('.notes-toggle');
  assert(toggles.length === 2, 'Both notes must survive remount');
  assert(toggles[0].getAttribute('aria-expanded') === 'false', 'Collapsed state must persist');
  assert(toggles[1].getAttribute('aria-expanded') === 'true', 'Expanded state must persist');
  await click(toggles[0]);
  assert(field('Note 1 title for Smoke module').value === 'First note', 'Title must persist');
  assert(field('Note 1 text for Smoke module').value === 'Saved content', 'Text must persist');
  assert(field('Note 1 color for Smoke module').value === '#123456', 'Color must persist');
  assert(field('Note 1 text size for Smoke module').value === 'large', 'Text size must persist');

  // The empty second note can be deleted without a confirmation dialog.
  await click(field('Delete note 2 from Smoke module'));
  assert(fixture.querySelectorAll('.notes-toggle').length === 1, 'Only the selected note must be deleted');
  assert(field('Note 1 text for Smoke module').value === 'Saved content', 'Deleting another note must preserve content');
  result.textContent = 'PASS: add, edit, independent toggles, JSON persistence and targeted deletion';
  result.style.color = 'green';
} catch (error) {
  result.textContent = `FAIL: ${error.message}`;
  result.style.color = 'red';
  console.error(error);
} finally {
  localStorage.removeItem(storageKey);
}
