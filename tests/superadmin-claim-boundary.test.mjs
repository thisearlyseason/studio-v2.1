import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('client quota elevation depends on the trusted claim state', async () => {
  const source = await readFile(
    new URL('../src/components/providers/team-provider.tsx', import.meta.url),
    'utf8',
  );

  assert.match(source, /if \(isSuperAdmin\) \{\s*limit = Math\.max\(limit, 100\)/);
  assert.doesNotMatch(source, /rawData\.role === 'superadmin'/);
});
