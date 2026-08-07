import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { hasCoachesCornerEntitlement } from '../src/lib/coaches-corner-entitlement.ts';

test('Coaches Corner follows the selected squad entitlement', () => {
  assert.equal(hasCoachesCornerEntitlement(undefined, false), false);
  assert.equal(hasCoachesCornerEntitlement({ isPro: false }, false), false);
  assert.equal(hasCoachesCornerEntitlement({ isPro: true }, false), true);
  assert.equal(hasCoachesCornerEntitlement({ isPro: false }, true), true);
});

test('other paid squads do not unlock Coaches Corner for a selected free squad', () => {
  const squads = [
    { id: 'pro-one', isPro: true },
    { id: 'pro-two', isPro: true },
    { id: 'selected-free', isPro: false },
  ];

  assert.equal(hasCoachesCornerEntitlement(squads[2], false), false);
});

test('navigation and direct Coaches Corner pages use the same entitlement gate', () => {
  const shell = fs.readFileSync('src/components/layout/Shell.tsx', 'utf8');
  const page = fs.readFileSync('src/app/(dashboard)/coaches-corner/page.tsx', 'utf8');
  const attendance = fs.readFileSync('src/app/(dashboard)/coaches-corner/attendance/page.tsx', 'utf8');
  const team = fs.readFileSync('src/app/(dashboard)/team/page.tsx', 'utf8');

  for (const source of [shell, page, attendance, team]) {
    assert.match(source, /hasCoachesCornerEntitlement/);
  }
  assert.match(page, /if \(!canAccessCoachesCorner\) return <AccessRestricted/);
  assert.match(attendance, /if \(!isStaff \|\| !canAccessCoachesCorner\)/);
});
