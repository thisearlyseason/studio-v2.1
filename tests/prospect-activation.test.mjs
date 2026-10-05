import assert from 'node:assert/strict';
import test from 'node:test';

import { isProspectActivated } from '../src/lib/prospect-activation.ts';

test('only active and committed recruiting profiles unlock the Scout Portal', () => {
  assert.equal(isProspectActivated({ status: 'active' }), true);
  assert.equal(isProspectActivated({ status: 'committed' }), true);
  assert.equal(isProspectActivated({ status: 'hidden' }), false);
  assert.equal(isProspectActivated({ status: 'draft' }), false);
  assert.equal(isProspectActivated(undefined), false);
});

test('legacy player activation flags are not a second source of truth', () => {
  assert.equal(isProspectActivated({ status: 'hidden', recruitingProfileEnabled: true }), false);
  assert.equal(isProspectActivated({ status: 'active', recruitingProfileEnabled: false }), true);
});
