import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  eventsStorageKey,
  loadScopedEvents,
  loadScopedTodos,
  scopedLastTeamKey,
  todosStorageKey,
} from '../src/app/schedule-app/storage.ts';

function storageWith(entries = {}) {
  const values = new Map(Object.entries(entries));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); },
  };
}

test('schedule companion keys isolate every user and team', () => {
  assert.notEqual(todosStorageKey('user-a'), todosStorageKey('user-b'));
  assert.notEqual(eventsStorageKey('user-a', 'team-a'), eventsStorageKey('user-a', 'team-b'));
  assert.notEqual(eventsStorageKey('user-a', 'team-a'), eventsStorageKey('user-b', 'team-a'));
  assert.notEqual(scopedLastTeamKey('user-a'), scopedLastTeamKey('user-b'));
});

test('a different profile cannot read legacy or another profile todo data', () => {
  const storage = storageWith({
    squad_schedule_todos: JSON.stringify([{ id: 'legacy-secret', text: 'private', dueDate: '2026-09-04', completed: false, createdAt: 'x' }]),
    [todosStorageKey('user-a')]: JSON.stringify([{ id: 'a-secret', text: 'private', dueDate: '2026-09-04', completed: false, createdAt: 'x' }]),
  });

  assert.deepEqual(loadScopedTodos(storage, 'user-b'), []);
});

test('corrupt or wrong-shaped scoped data is rejected safely', () => {
  const storage = storageWith({
    [todosStorageKey('user-a')]: '{broken',
    [eventsStorageKey('user-a', 'team-a')]: JSON.stringify({ event: 'not-an-array' }),
  });

  assert.deepEqual(loadScopedTodos(storage, 'user-a'), []);
  assert.deepEqual(loadScopedEvents(storage, 'user-a', 'team-a'), []);
});

test('valid scoped entries remain available offline to the same profile', () => {
  const todo = { id: 'todo-1', text: 'Bring cones', dueDate: '2026-09-04', completed: false, createdAt: '2026-09-03T00:00:00.000Z' };
  const event = { id: 'event-1', title: 'Practice', date: '2026-09-05', eventType: 'practice' };
  const storage = storageWith({
    [todosStorageKey('user-a')]: JSON.stringify([todo]),
    [eventsStorageKey('user-a', 'team-a')]: JSON.stringify([event]),
  });

  assert.deepEqual(loadScopedTodos(storage, 'user-a'), [todo]);
  assert.deepEqual(loadScopedEvents(storage, 'user-a', 'team-a'), [event]);
});

test('service worker keeps the public schedule shell available offline', async () => {
  const worker = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
  const page = await readFile(new URL('../src/app/schedule-app/page.tsx', import.meta.url), 'utf8');
  assert.match(worker, /SCHEDULE_SHELL_URL\s*=\s*['"]\/schedule-app['"]/);
  assert.match(worker, /SHELL_URLS\s*=\s*\[\s*SCHEDULE_SHELL_URL/);
  assert.match(worker, /cache\.put\(SCHEDULE_SHELL_URL, response\.clone\(\)\)/);
  assert.match(worker, /requestedUrl\.pathname\.startsWith\(['"]\/_next\/static\/['"]\)/);
  assert.doesNotMatch(page, /navigator\.serviceWorker\.register/);
});
