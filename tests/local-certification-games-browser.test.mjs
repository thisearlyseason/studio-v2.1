import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';

const moduleUrl = new URL('../scripts/qa/certification/local/games-browser.mjs', import.meta.url);
const load = () => import(moduleUrl).catch(error => { if (error.code === 'ERR_MODULE_NOT_FOUND') return {}; throw error; });

test('Games browser capture retains exact same-origin score writes and removes its listeners', async () => {
  const { createGamesBrowserObserver } = await load();
  assert.equal(typeof createGamesBrowserObserver, 'function', 'Games needs real browser response evidence');
  const page = new EventEmitter();
  const observer = createGamesBrowserObserver(page, { baseUrl: 'http://127.0.0.1:9001' });
  observer.start('games-zero-score-edit');
  const request = { url: () => 'http://127.0.0.1:9001/api/teams/games?private=value', method: () => 'POST', postData: () => '{"teamId":"team-a","gameId":"game-a","myScore":0,"opponentScore":0}' };
  page.emit('request', request);
  observer.start('games-form-clear');
  page.emit('response', { request: () => request, url: request.url, status: () => 200 });
  const foreign = { ...request, url: () => 'http://127.0.0.1:90010/api/teams/games' };
  page.emit('request', foreign);
  page.emit('response', { request: () => foreign, url: foreign.url, status: () => 500 });
  const result = observer.finish();
  assert.deepEqual(result.observedResponses.map(item => item.tag), ['games-zero-score-edit', 'games-console', 'games-responsive']);
  assert.ok(result.observedResponses.every(item => item.status === 200 && item.pathname === '/api/teams/games'));
  assert.deepEqual(result.failedResponses, []);
  assert.ok(!JSON.stringify(result).includes('private'));
  assert.equal(page.listenerCount('request') + page.listenerCount('response') + page.listenerCount('console') + page.listenerCount('pageerror'), 0);
});

const validObservation = () => ({
  scoreEdit: { status: 200, teamId: 'team-a', gameId: 'game-a', myScore: 0, opponentScore: 0 },
  reloadedValues: ['0', '0'],
  freshFormValues: { opponent: '', scores: ['', ''] },
  consoleErrors: [], failedResponses: [],
  bounds: [
    { viewport: { width: 1440, height: 900 }, pageWidth: 1440, boxes: { dialog: { x: 460, y: 10, width: 520, height: 800 }, us: { x: 470, y: 100, width: 100, height: 60 }, them: { x: 590, y: 100, width: 100, height: 60 }, submit: { x: 470, y: 700, width: 500, height: 60 } } },
    { viewport: { width: 390, height: 844 }, pageWidth: 390, boxes: { dialog: { x: 10, y: 10, width: 370, height: 824 }, us: { x: 20, y: 100, width: 120, height: 60 }, them: { x: 160, y: 100, width: 120, height: 60 }, submit: { x: 20, y: 700, width: 350, height: 60 } } },
  ],
});

test('Games browser observations require an exact write, reload persistence, empty new form and both viewports', async () => {
  const { validateGamesBrowserObservation } = await load();
  assert.equal(typeof validateGamesBrowserObservation, 'function', 'Games browser evidence must validate score, form and viewport observations');
  const identity = { teamId: 'team-a', gameId: 'game-a' };
  assert.equal(validateGamesBrowserObservation(validObservation(), identity), true);
  for (const [label, corrupt] of [
    ['wrong game', value => { value.scoreEdit.gameId = 'other-game'; }],
    ['failed write', value => { value.scoreEdit.status = 500; }],
    ['no persisted edit', value => { value.reloadedValues = ['2', '4']; }],
    ['stale form', value => { value.freshFormValues.opponent = 'Old Opponent'; }],
    ['missing desktop', value => { value.bounds.shift(); }],
    ['offscreen score input', value => { value.bounds[1].boxes.us.x = 400; }],
    ['missing score control', value => { delete value.bounds[1].boxes.us; }],
    ['console failure', value => { value.consoleErrors.push('Unhandled failure'); }],
  ]) {
    const value = validObservation(); corrupt(value);
    assert.throws(() => validateGamesBrowserObservation(value, identity), undefined, label);
  }
});
