import assert from 'node:assert/strict';
import test from 'node:test';
import * as guardModule from '../src/lib/server-request-guards.ts';

const { getTrustedAppOrigin, isTrustedRequestOrigin } = guardModule;

test('Stripe return URLs ignore a forged request origin', () => {
  const prior = process.env.NEXT_PUBLIC_APP_URL;
  process.env.NEXT_PUBLIC_APP_URL = 'https://www.thesquad.pro';
  try {
    const forgedRequest = { headers: new Headers({ origin: 'https://evil.example' }) };
    assert.equal(getTrustedAppOrigin(forgedRequest), 'https://www.thesquad.pro');

    const realRequest = { headers: new Headers({ origin: 'https://www.thesquad.pro' }) };
    assert.equal(getTrustedAppOrigin(realRequest), 'https://www.thesquad.pro');
  } finally {
    if (prior === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = prior;
  }
});

test('state-changing request origin guard rejects alternate loopback ports and malformed origins', () => {
  const prior = process.env.NEXT_PUBLIC_APP_URL;
  process.env.NEXT_PUBLIC_APP_URL = 'http://127.0.0.1:9001';
  try {
    assert.equal(isTrustedRequestOrigin({ headers: new Headers() }), true);
    assert.equal(isTrustedRequestOrigin({ headers: new Headers({ origin: 'http://127.0.0.1:9001' }) }), true);
    assert.equal(isTrustedRequestOrigin({ headers: new Headers({ origin: 'http://127.0.0.1:9002' }) }), false);
    assert.equal(isTrustedRequestOrigin({ headers: new Headers({ origin: 'http://localhost:9001' }) }), false);
    assert.equal(isTrustedRequestOrigin({ headers: new Headers({ origin: 'not a URL' }) }), false);
  } finally {
    if (prior === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = prior;
  }
});
