import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/app/(dashboard)/events/page.tsx', import.meta.url), 'utf8');

test('event creation preserves the date selected in the calendar instead of converting it through UTC', () => {
  const createHandler = source.slice(source.indexOf('const handleCreateEvent = async () =>'), source.indexOf('const resetForm = () =>'));
  assert.match(createHandler, /date: newDate,/);
  assert.match(createHandler, /endDate: newEndDate \|\| newDate,/);
  assert.doesNotMatch(createHandler, /new Date\(`\$\{newDate\}T\$\{newTime/);
});
