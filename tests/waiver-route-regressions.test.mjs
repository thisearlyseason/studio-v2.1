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

test('global waiver editor constrains the actual dialog shell to the mobile viewport', async () => {
  const club = await source('../src/app/(dashboard)/club/page.tsx');
  const start = club.indexOf('{/* Deploy Protocol Dialog */}');
  const end = club.indexOf('{/* Organization seat release */}', start);
  const dialog = club.slice(start, end);
  assert.match(dialog, /max-h-\[calc\(100dvh-2rem\)\]/);
  assert.match(dialog, /flex-1 min-h-0 overflow-y-auto/);
});

test('waiver lifecycle responsive evidence separates dialog bounds from page overflow diagnostics', async () => {
  const audit = await source('../scripts/qa/run-phase2-emulator-audit.mjs');
  const start = audit.indexOf('async function observeWaiverLifecycleDialog()');
  const end = audit.indexOf('async function observeWaiverSignatureDialogs(', start);
  const workflow = audit.slice(start, end);
  assert.match(workflow, /overflowElements/);
  assert.match(workflow, /dialog\.waitFor\([\s\S]*page\.waitForTimeout\(250\);[\s\S]*measurements\.push\(\{viewport:\{width:1440,height:900\}/);
  assert.match(workflow, /Waiver waiver-responsive: actual global waiver dialog fits exact desktop and mobile viewports/);
  assert.match(workflow, /Waiver waiver-responsive: global waiver surface has no horizontal viewport overflow/);
  const signatureStart = audit.indexOf('async function observeWaiverSignatureDialogs(');
  const signatureEnd = audit.indexOf('async function runWaiverSignatureWorkflowAudit()', signatureStart);
  const signatureWorkflow = audit.slice(signatureStart, signatureEnd);
  assert.match(signatureWorkflow, /dialog\.waitFor\([\s\S]*page\.waitForTimeout\(250\);[\s\S]*measurements\.push\(\{viewport:\{width:1440,height:900\}/);
  assert.match(signatureWorkflow, /\.\.\/\.\.\/following-sibling::button\[contains\(normalize-space\(\.\),"Review & Sign"\)\]/);
  assert.match(signatureWorkflow, /\.\.\/following-sibling::\*\/\/button\[contains\(normalize-space\(\.\),"Execute Document"\)\]/);
  assert.match(signatureWorkflow, /following-sibling::button\[contains\(normalize-space\(\.\),"Review & Sign"\)\]/);
  assert.match(signatureWorkflow, /interactionFailure/);
  assert.match(signatureWorkflow, /elementFromPoint/);
  assert.match(signatureWorkflow, /dismissTransientDialogs/);
});
