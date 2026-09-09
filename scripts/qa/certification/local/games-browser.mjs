// Serialized into the existing Playwright CLI sandbox by the Games audit.
export function createGamesBrowserObserver(page, { baseUrl }) {
  let tag;
  const started = new WeakMap();
  const observedResponses = [], consoleErrors = [], failedResponses = [];
  const onRequest = request => {
    if (!tag || !request.url().startsWith(`${baseUrl}/`)) return;
    const pathname = request.url().slice(baseUrl.length).split(/[?#]/, 1)[0];
    if (!['/games', '/api/teams/games'].includes(pathname)) return;
    started.set(request, { tag, pathname, method: request.method(), startedAt: new Date().toISOString() });
  };
  const onResponse = response => {
    const request = started.get(response.request());
    if (!request) return;
    const status = response.status();
    if (status >= 400) failedResponses.push({ pathname: request.pathname, status });
    for (const caseTag of new Set([request.tag, 'games-console', 'games-responsive'])) {
      observedResponses.push({ ...request, tag: caseTag, status, completedAt: new Date().toISOString() });
    }
  };
  const onConsole = message => { if (message.type() === 'error') consoleErrors.push(message.text()); };
  const onPageError = error => consoleErrors.push(error.message);
  page.on('request', onRequest); page.on('response', onResponse); page.on('console', onConsole); page.on('pageerror', onPageError);
  return {
    start(nextTag) { tag = nextTag; },
    finish() {
      page.off('request', onRequest); page.off('response', onResponse); page.off('console', onConsole); page.off('pageerror', onPageError);
      return { observedResponses, consoleErrors, failedResponses };
    },
  };
}

export function validateGamesBrowserObservation(value, { teamId, gameId }) {
  const edit = value.scoreEdit;
  if (edit?.status !== 200 || edit.teamId !== teamId || edit.gameId !== gameId || edit.myScore !== 0 || edit.opponentScore !== 0) {
    throw new Error('Games browser must capture the exact run-owned zero-score edit.');
  }
  if (JSON.stringify(value.reloadedValues) !== '["0","0"]') throw new Error('Games zero-score edit did not persist after reload.');
  if (value.freshFormValues?.opponent !== '' || JSON.stringify(value.freshFormValues.scores) !== '["",""]') throw new Error('Games new score form retained prior values.');
  if (value.consoleErrors.length || value.failedResponses.length) throw new Error('Games browser emitted console or request failures.');
  if (!value.bounds.some(row => row.viewport.width === 1440 && row.viewport.height === 900) ||
      !value.bounds.some(row => row.viewport.width === 390 && row.viewport.height === 844)) throw new Error('Games bounds require both exact viewports.');
  for (const row of value.bounds) {
    const { width, height } = row.viewport;
    if (row.pageWidth > width || ['dialog', 'us', 'them', 'submit'].some(name => {
      const box = row.boxes[name];
      return !box || box.width <= 0 || box.height <= 0 || box.x < -0.5 || box.y < -0.5 || box.x + box.width > width + 0.5 || box.y + box.height > height + 0.5;
    })) throw new Error('Games score dialog or control exceeds viewport bounds.');
  }
  return true;
}
