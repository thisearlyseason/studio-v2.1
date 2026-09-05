import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('team membership projections prefer the squad name over the member identity name', async () => {
  const source = await readFile(new URL('../src/components/providers/team-provider.tsx', import.meta.url), 'utf8');
  const projection = source.match(/const teamsRaw = useMemo[\s\S]*?\n  \}\), \[teamsData, generateTeamCode\]\);/)?.[0] || '';
  assert.match(projection, /name: m\.teamName \|\| m\.name \|\| 'Squad'/);
  assert.doesNotMatch(projection, /name: m\.name \|\| m\.teamName/);
});
