import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { observeCalendarResponse } from '../scripts/qa/certification/local/calendar-response-observation.mjs';

test('ICS response observation runs without URL globals in the actual serialized CLI callback', () => {
  const observe = vm.runInNewContext(`(${observeCalendarResponse.toString()})`);
  const response = (url, navigation = false, method = 'POST', status = 200) => ({
    url: () => url, request: () => ({ isNavigationRequest: () => navigation, method: () => method }), status: () => status,
  });
  const base = 'http://127.0.0.1:9001';
  assert.deepEqual(JSON.parse(JSON.stringify(observe(response(`${base}/api/calendar/feed?private=discard#fragment`), base, 'ics-console'))),
    { tag: 'ics-console', method: 'POST', pathname: '/api/calendar/feed', status: 200 });
  assert.deepEqual(JSON.parse(JSON.stringify(observe(response(`${base}/calendar`, true, 'GET'), base, 'ics-network'))),
    { tag: 'ics-network', method: 'GET', pathname: '/calendar', status: 200 });
  assert.equal(observe(response(`${base}.example.test/api/calendar/feed`), base, 'ics-console'), null);
  assert.equal(observe(response('http://127.0.0.1:9002/api/calendar/feed'), base, 'ics-console'), null);
  assert.equal(observe(response(`${base}/api/unrelated`), base, 'ics-console'), null);
});

test('the sandbox-safe observer captures only the exact supplied Event action or RSVP route', () => {
  const observe = vm.runInNewContext(`(${observeCalendarResponse.toString()})`);
  const base = 'http://127.0.0.1:9001';
  for (const pathname of ['/api/teams/events/action', '/api/teams/rsvp']) {
    const response = { url: () => `${base}${pathname}?discard=value`, status: () => 200,
      request: () => ({ isNavigationRequest: () => false, method: () => 'POST' }) };
    assert.deepEqual(JSON.parse(JSON.stringify(observe(response, base, 'event', pathname))),
      { tag: 'event', method: 'POST', pathname, status: 200 });
    assert.equal(observe(response, base, 'event', '/api/calendar/feed'), null);
  }
});
