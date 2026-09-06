import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = relative => readFile(new URL(relative, import.meta.url), 'utf8');

test('waiver lifecycle mutations are server mediated and versioned', async () => {
  const provider = await source('../src/components/providers/team-provider.tsx');
  const club = await source('../src/app/(dashboard)/club/page.tsx');
  const organizationRoute = await source('../src/app/api/organizations/waivers/route.ts');
  const teamRoute = await source('../src/app/api/teams/waivers/lifecycle/route.ts');
  assert.match(provider, /fetch\('\/api\/teams\/waivers\/lifecycle'/);
  assert.match(provider, /fetch\('\/api\/organizations\/waivers'/);
  assert.doesNotMatch(provider, /const baseId = `protocol_\$\{Date\.now\(\)\}`/);
  assert.match(club, /requestId:/);
  assert.match(organizationRoute, /export async function POST/);
  assert.match(organizationRoute, /buildWaiverVersionIdentity/);
  assert.match(organizationRoute, /waiverVersions/);
  assert.match(teamRoute, /buildWaiverVersionIdentity/);
  assert.match(teamRoute, /archived_waivers/);
});

test('participant and coach signatures use one server boundary with immutable version receipts', async () => {
  const provider = await source('../src/components/providers/team-provider.tsx');
  const participantRoute = await source('../src/app/api/teams/waivers/sign/route.ts');
  const coachRoute = await source('../src/app/api/teams/waivers/sign-coach/route.ts');
  assert.match(provider, /fetch\('\/api\/teams\/waivers\/sign-coach'/);
  assert.doesNotMatch(provider, /global_coach_\$\{waiverDocId\}_\$\{firebaseUser\.uid\}/);
  for (const route of [participantRoute, coachRoute]) {
    assert.match(route, /textHash/);
    assert.match(route, /version/);
    assert.match(route, /waiverText/);
    assert.match(route, /alreadySigned/);
    assert.match(route, /if \(existing\.exists\) return \{ state: 'existing'/);
  }
});
