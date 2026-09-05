const VIEWPORTS = Object.freeze({
  desktop: Object.freeze({ width: 1440, height: 900 }),
  mobile: Object.freeze({ width: 390, height: 844 }),
});

function safeLabel(value) {
  return String(value || 'session')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'session';
}

function redactText(value, secrets) {
  let output = String(value || '');
  for (const secret of secrets.filter(Boolean)) output = output.replaceAll(secret, '[redacted]');
  return output
    .replace(/\b(?:password|token|cookie|authorization)=\S+/gi, '[redacted]')
    .replace(/Bearer\s+\S+/gi, '[redacted]');
}

function safePath(value, baseUrl) {
  try {
    const url = new URL(value, baseUrl);
    return url.pathname;
  } catch {
    return '[invalid-path]';
  }
}

function normalizeObservation(raw, baseUrl) {
  return {
    requestedPath: safePath(raw.requestedPath, baseUrl),
    actualPath: safePath(raw.actualPath, baseUrl),
    status: Number(raw.status || 0),
    fitsViewport: raw.fitsViewport === true,
    applicationErrors: Array.isArray(raw.applicationErrors) ? raw.applicationErrors.map(String) : [],
    consoleErrors: Array.isArray(raw.consoleErrors) ? raw.consoleErrors.map(String) : [],
    failedResponses: Array.isArray(raw.failedResponses) ? raw.failedResponses.map(response => ({
      method: String(response.method || 'GET').toUpperCase(),
      path: safePath(response.url || response.path, baseUrl),
      status: Number(response.status || 0),
    })) : [],
    redirects: Array.isArray(raw.redirects) ? raw.redirects.map(redirect => ({
      from: safePath(redirect.from, baseUrl),
      to: safePath(redirect.to, baseUrl),
      status: Number(redirect.status || 0),
    })) : [],
  };
}

export function createBrowserClient({
  cliPath,
  run,
  baseUrl,
  runId,
  artifactsDir,
  emailForAlias,
  secretForAlias,
}) {
  if (!cliPath) throw new Error('Browser client requires a Playwright CLI path.');
  const baseOrigin = parseLoopbackHttpOrigin(baseUrl, 'Browser client loopback base URL');
  const prefix = `cert-${safeLabel(runId)}-identity`;
  const sessions = new Set();
  const knownSecrets = [];
  let closed = false;

  const sessionName = label => `${prefix}-${safeLabel(label)}`;

  async function invoke(session, args, { sensitive = false } = {}) {
    try {
      return await run({ command: cliPath, session, args, sensitive, artifactsDir });
    } catch (error) {
      throw new Error(redactText(error instanceof Error ? error.message : error, knownSecrets));
    }
  }

  async function login(alias, expectedPath, { label = alias, browser = 'chrome' } = {}) {
    const session = sessionName(label);
    const email = emailForAlias(alias);
    const secret = secretForAlias(alias);
    knownSecrets.push(email, secret);
    sessions.add(session);
    await invoke(session, ['open', `${baseOrigin}/login`, '--browser', browser], { sensitive: true });
    const code = `async page => {
      await page.getByLabel('Email Address').fill(${JSON.stringify(email)});
      await page.locator('#password').fill(${JSON.stringify(secret)});
      await page.getByRole('button', { name: 'Sign In' }).click();
      await page.waitForFunction(expected => window.location.pathname === expected, ${JSON.stringify(expectedPath)}, { timeout: 15000 });
      return { actualPath: new URL(page.url()).pathname, status: 200 };
    }`;
    const raw = JSON.parse(await invoke(session, ['run-code', code], { sensitive: true }));
    if (safePath(raw.actualPath, baseOrigin) !== expectedPath) {
      throw new Error(`Login for ${alias} expected ${expectedPath} but reached ${safePath(raw.actualPath, baseOrigin)}.`);
    }
    return session;
  }

  async function observe(session, {
    path,
    viewport = 'desktop',
    expectedPath = path,
    allowStatuses = [],
  }) {
    const destination = resolveLoopbackUrl(path, baseOrigin);
    const expectedDestination = resolveLoopbackUrl(expectedPath, baseOrigin, 'Expected browser path');
    const size = VIEWPORTS[viewport];
    if (!size) throw new Error(`Unknown browser viewport ${viewport}.`);
    const code = `async page => {
      const consoleErrors = [];
      const applicationErrors = [];
      const failedResponses = [];
      const redirects = [];
      const onConsole = message => { if (message.type() === 'error') consoleErrors.push(message.text()); };
      const onPageError = error => consoleErrors.push(error.message);
      const onResponse = response => {
        if (response.status() >= 400) failedResponses.push({ method: response.request().method(), url: response.url(), status: response.status() });
        const prior = response.request().redirectedFrom();
        if (prior) redirects.push({ from: prior.url(), to: response.url(), status: response.status() });
      };
      page.on('console', onConsole);
      page.on('pageerror', onPageError);
      page.on('response', onResponse);
      try {
        await page.setViewportSize({ width: ${size.width}, height: ${size.height} });
        const response = await page.goto(${JSON.stringify(destination.href)});
        await page.waitForFunction(expected => window.location.pathname === expected, ${JSON.stringify(expectedDestination.pathname)}, { timeout: 15000 });
        if (await page.getByText(/Application error: a client-side exception/).count()) applicationErrors.push('Application error boundary');
        return {
          requestedPath: ${JSON.stringify(destination.pathname)},
          actualPath: new URL(page.url()).pathname,
          status: response ? response.status() : 0,
          fitsViewport: await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
          applicationErrors,
          consoleErrors,
          failedResponses,
          redirects,
        };
      } finally {
        page.off('console', onConsole);
        page.off('pageerror', onPageError);
        page.off('response', onResponse);
      }
    }`;
    const result = normalizeObservation(JSON.parse(await invoke(session, ['run-code', code])), baseOrigin);
    if (result.actualPath !== expectedDestination.pathname) throw new Error(`Browser expected path ${expectedDestination.pathname} but reached ${result.actualPath}.`);
    if (!result.fitsViewport) throw new Error(`Browser observed horizontal overflow at ${result.actualPath}.`);
    if (result.applicationErrors.length > 0) throw new Error(`Browser observed an application error at ${result.actualPath}.`);
    if (result.consoleErrors.length > 0) throw new Error(`Browser observed a console error at ${result.actualPath}.`);
    for (const response of result.failedResponses) {
      if (!allowStatuses.includes(response.status)) {
        throw new Error(`Browser observed unallowlisted HTTP ${response.status} at ${response.path}.`);
      }
    }
    return Object.freeze(result);
  }

  async function closeAll() {
    if (closed && sessions.size === 0) return;
    const failures = [];
    for (const session of [...sessions].reverse()) {
      try {
        await invoke(session, ['close']);
        sessions.delete(session);
      } catch (error) {
        failures.push({ session, error });
      }
    }
    closed = sessions.size === 0;
    if (failures.length > 0) {
      throw new Error(`Browser failed to close ${failures.length} owned browser session(s); retry is required.`);
    }
  }

  return Object.freeze({ sessionName, login, observe, closeAll });
}
import { parseLoopbackHttpOrigin, resolveLoopbackUrl } from './boundary.mjs';
