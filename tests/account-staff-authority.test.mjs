import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = path => readFile(new URL(path, import.meta.url), 'utf8');

test('team notifications and email use the shared server staff authority check', async () => {
  const [notify, email, authority] = await Promise.all([
    source('../src/app/api/notify/route.ts'),
    source('../src/app/api/email/send/route.ts'),
    source('../src/lib/server-team-access.ts'),
  ]);

  assert.match(notify, /getTeamAuthority/);
  assert.match(notify, /authority\?\.isStaff/);
  assert.match(email, /getTeamAuthority/);
  assert.match(email, /authority\?\.isStaff/);
  assert.match(authority, /isStaffMember/);
});

test('unsupported root tournament writes are closed while supported tournaments remain team events', async () => {
  const [rules, tournamentPage] = await Promise.all([
    source('../firestore.rules'),
    source('../src/app/(dashboard)/manage-tournaments/manage-tournaments-page-content.tsx'),
  ]);

  assert.match(rules, /match \/tournaments\/\{hubId\}[\s\S]*allow create, update, delete: if isSuperAdmin\(\)/);
  assert.match(tournamentPage, /eventType: 'tournament'/);
  assert.match(tournamentPage, /return await addEvent\(eventPayload\)/);
});
