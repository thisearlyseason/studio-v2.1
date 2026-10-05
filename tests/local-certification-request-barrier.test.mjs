import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isLocalAuditBarrierEnabled,
  readCertificationBarrierHeaders,
} from '../src/lib/local-certification-request-barrier.ts';

test('request barrier is disabled outside the explicit local audit environment', () => {
  assert.equal(isLocalAuditBarrierEnabled({ AUDIT_LOCAL_REQUEST_BARRIER: '1', NODE_ENV: 'production' }), false);
  assert.equal(isLocalAuditBarrierEnabled({ AUDIT_LOCAL_REQUEST_BARRIER: '0', NODE_ENV: 'development' }), false);
  assert.equal(isLocalAuditBarrierEnabled({ AUDIT_LOCAL_REQUEST_BARRIER: '1', NODE_ENV: 'development' }), true);
});

test('request barrier accepts only a bounded opaque id and named participant', () => {
  assert.deepEqual(readCertificationBarrierHeaders(new Headers({
    'x-certification-barrier': 'rsvp-race_a1',
    'x-certification-barrier-participant': 'owner',
  })), { barrierId: 'rsvp-race_a1', participant: 'owner' });
  assert.equal(readCertificationBarrierHeaders(new Headers({
    'x-certification-barrier': 'bad/value',
    'x-certification-barrier-participant': 'owner',
  })), null);
});
