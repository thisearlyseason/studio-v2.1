import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createNativeAuthLimiter } from '../src/lib/native-auth/rate-limit.ts';
test('untrusted forwarded headers and user agent cannot evade a source bucket', async () => {
  const calls = [];
  const limiter = createNativeAuthLimiter(async (...args) => { calls.push(args); return null; }, false);
  for (const address of ['1.2.3.4', '5.6.7.8']) await limiter.publicLimit(new Request('https://store.test', { headers: { 'x-forwarded-for': address, 'User-Agent': address } }), 'start');
  assert.deepEqual(calls[0], calls[2]);
  assert.deepEqual(calls[1], calls[3]);
  assert.equal(calls[0][2], 10);
  assert.equal(calls[1][2], 300);
  assert.equal(JSON.stringify(calls).includes('1.2.3.4'), false);
});
test('Vercel ingress addresses are hashed and completion is UID-limited', async () => {
  const calls = [];
  const limiter = createNativeAuthLimiter(async (...args) => { calls.push(args); return null; }, true);
  await limiter.publicLimit(new Request('https://store.test', { headers: { 'x-forwarded-for': '1.2.3.4' } }), 'redeem');
  await limiter.publicLimit(new Request('https://store.test', { headers: { 'x-forwarded-for': '5.6.7.8' } }), 'redeem');
  assert.notEqual(calls[0][0], calls[1][0]);
  assert.equal(JSON.stringify(calls).includes('1.2.3.4'), false);
  await limiter.beforeComplete('qa-user');
  assert.equal(calls[2][2], 10);
  assert.equal(calls[2][3], 300000);
});
test('rate store denial and outage never permit the operation', async () => {
  const deny = createNativeAuthLimiter(async () => new Response(null, { status: 429 }), false);
  await assert.rejects(deny.beforeComplete('qa-user'), { code: 'rate_limited' });
  const failed = createNativeAuthLimiter(async () => { throw new Error('sensitive database information'); }, false);
  await assert.rejects(failed.beforeComplete('qa-user'), error => error.code === 'unavailable' && !String(error).includes('sensitive'));
});
