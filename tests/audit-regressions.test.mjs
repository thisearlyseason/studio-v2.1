import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = path => readFile(new URL(path, import.meta.url), 'utf8');

test('event deletion waits for an explicit confirmation action', async () => {
  const dialog = await source('../src/app/(dashboard)/events/EventDetailDialog.tsx');

  assert.match(dialog, /const \[deleteConfirmationOpen, setDeleteConfirmationOpen\] = React\.useState\(false\)/);
  assert.match(dialog, /aria-label=\{`Delete \$\{event\.title\}`\}[\s\S]{0,360}onClick=\{\(\) => setDeleteConfirmationOpen\(true\)\}/);
  assert.match(dialog, /<AlertDialog open=\{deleteConfirmationOpen\}[\s\S]{0,1200}<AlertDialogCancel[\s\S]{0,600}<AlertDialogAction[\s\S]{0,240}onClick=\{\(\) => onDelete\(event\.id\)\}/);
});

test('Sports Hub uses its compact search affordance at tablet widths', async () => {
  const layout = await source('../src/components/sports-hub/SportsHubClientLayout.tsx');

  assert.match(layout, /hidden lg:flex flex-1 max-w-sm/);
  assert.match(layout, /href="\/sports-hub\/search" className="lg:hidden"/);
});

test('desktop and mobile squad switchers share a stable accessible name', async () => {
  const shell = await source('../src/components/layout/Shell.tsx');
  const labels = shell.match(/aria-label="Switch squad"/g) || [];

  assert.equal(labels.length, 3);
  assert.match(shell, /data-team-switch-id=\{team\.id\}/);
});

test('alert inbox relies on the standard dialog close control only', async () => {
  const alerts = await source('../src/components/layout/AlertOverlay.tsx');

  assert.doesNotMatch(alerts, /import \{ DialogClose \}/);
  assert.doesNotMatch(alerts, /Close broadcast inbox/);
});
