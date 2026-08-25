import { execFile } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import { ROUTE_SCENARIOS } from './scenario-contracts.mjs';

const DEFAULT_WRAPPER = '/Users/tylerans/.codex/skills/playwright/scripts/playwright_cli.sh';
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_OUTPUT_BYTES = 1_048_576;
const CLIENT_INTERNALS = new WeakMap();
const PROTECTED_RENDER_SENTINELS = Object.freeze(Object.values(ROUTE_SCENARIOS).map(value => value.visibleSentinel));
const TERMINAL_SENTINELS = Object.freeze([
  'Sign In',
  'The email or password is incorrect, or this account is unavailable.',
]);
const OBSERVED_RENDER_SENTINELS = Object.freeze([...PROTECTED_RENDER_SENTINELS, ...TERMINAL_SENTINELS]);

const INSTALL_RECORDER_SOURCE = String.raw`async (page) => {
  // phase9:install
  const cleanUrl = value => {
    if (value === 'about:blank') return value;
    try {
      const parsed = new URL(value);
      if (['data:', 'blob:', 'javascript:', 'file:'].includes(parsed.protocol)) return parsed.protocol;
      if (!['http:', 'https:'].includes(parsed.protocol)) return 'opaque:';
      return parsed.origin + parsed.pathname;
    } catch {
      return 'invalid:';
    }
  };
  const boundedPush = (state, key, value) => {
    if (state[key].length >= 1000) {
      state.overflow += 1;
      return;
    }
    state[key].push(value);
  };
  if (!page.__phase9EvidenceRecorder) {
    const state = {
      pageId: 'phase9-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2),
      sequence: 0,
      requests: [],
      listeners: [],
      renders: [],
      responses: [],
      pageErrors: [],
      appConsoleErrors: [],
      requestFailures: [],
      overflow: 0,
    };
    page.__phase9EvidenceRecorder = state;
    page.on('request', request => {
      let initiatingFrameUrl = 'unattributed:';
      try {
        initiatingFrameUrl = cleanUrl(request.frame()?.url() ?? 'about:blank');
      } catch {
        state.overflow += 1;
      }
      const signal = {
        url: cleanUrl(request.url()),
        method: request.method(),
        resourceType: request.resourceType(),
        initiatingFrameUrl,
      };
      boundedPush(state, 'requests', signal);
      if (/google\.firestore\.v1\.Firestore\/Listen|\/Listen\/channel/i.test(request.url())) {
        boundedPush(state, 'listeners', signal);
      }
    });
    page.on('response', response => boundedPush(state, 'responses', {
      url: cleanUrl(response.url()),
      status: response.status(),
    }));
    page.on('pageerror', () => boundedPush(state, 'pageErrors', 'PAGE_ERROR'));
    page.on('console', message => {
      if (message.type() === 'error') boundedPush(state, 'appConsoleErrors', 'APPLICATION_CONSOLE_ERROR');
    });
    page.on('requestfailed', request => boundedPush(state, 'requestFailures', {
      url: cleanUrl(request.url()),
      signature: 'REQUEST_FAILED',
    }));
    await page.exposeFunction('__phase9RecordRender', signal => {
      if (!signal || typeof signal.path !== 'string' || typeof signal.sentinel !== 'string') return;
      boundedPush(state, 'renders', { path: signal.path, sentinel: signal.sentinel });
    });
    await page.addInitScript(() => {
      const initialize = () => {
        if (globalThis.__phase9RenderObserverInstalled) return;
        globalThis.__phase9RenderObserverInstalled = true;
        globalThis.__phase9VisibleSentinels = () => {
          const known = ${JSON.stringify(OBSERVED_RENDER_SENTINELS)};
          const visible = element => {
            if (!element) return false;
            for (let current = element; current; current = current.parentElement) {
              if (current.hidden || current.getAttribute('aria-hidden') === 'true') return false;
              const style = getComputedStyle(current);
              if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || Number(style.opacity) === 0) return false;
            }
            const rect = element.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          };
          const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
          const found = new Set();
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            if (!visible(node.parentElement)) continue;
            for (const sentinel of known) if ((node.nodeValue || '').includes(sentinel)) found.add(sentinel);
          }
          return known.filter(sentinel => found.has(sentinel));
        };
        const sample = () => {
          if (!document.body) return;
          for (const sentinel of globalThis.__phase9VisibleSentinels()) {
            void globalThis.__phase9RecordRender({ path: location.pathname, sentinel });
          }
        };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sample, { once: true });
        else sample();
        new MutationObserver(sample).observe(document.documentElement, {
          childList: true, subtree: true, characterData: true, attributes: true,
          attributeFilter: ['style', 'class', 'hidden', 'aria-hidden'],
        });
      };
      initialize();
    });
    await page.evaluate(() => {
      if (globalThis.__phase9RenderObserverInstalled) return;
      globalThis.__phase9RenderObserverInstalled = true;
      globalThis.__phase9VisibleSentinels = () => {
        const known = ${JSON.stringify(OBSERVED_RENDER_SENTINELS)};
        const visible = element => {
          if (!element) return false;
          for (let current = element; current; current = current.parentElement) {
            if (current.hidden || current.getAttribute('aria-hidden') === 'true') return false;
            const style = getComputedStyle(current);
            if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || Number(style.opacity) === 0) return false;
          }
          const rect = element.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        };
        const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
        const found = new Set();
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          if (!visible(node.parentElement)) continue;
          for (const sentinel of known) if ((node.nodeValue || '').includes(sentinel)) found.add(sentinel);
        }
        return known.filter(sentinel => found.has(sentinel));
      };
      const sample = () => {
        if (!document.body) return;
        for (const sentinel of globalThis.__phase9VisibleSentinels()) {
          void globalThis.__phase9RecordRender({ path: location.pathname, sentinel });
        }
      };
      sample();
      new MutationObserver(sample).observe(document.documentElement, {
        childList: true, subtree: true, characterData: true, attributes: true,
        attributeFilter: ['style', 'class', 'hidden', 'aria-hidden'],
      });
    });
  }
  return { pageId: page.__phase9EvidenceRecorder.pageId };
}`;

const MARK_SOURCE = String.raw`async (page) => {
  // phase9:mark
  const state = page.__phase9EvidenceRecorder;
  if (!state) throw new Error('SIGNAL_RECORDER_NOT_ARMED');
  state.sequence += 1;
  return {
    pageId: state.pageId,
    sequence: state.sequence,
    requests: state.requests.length,
    listeners: state.listeners.length,
    responses: state.responses.length,
    pageErrors: state.pageErrors.length,
    appConsoleErrors: state.appConsoleErrors.length,
    requestFailures: state.requestFailures.length,
    overflow: state.overflow,
    renders: state.renders.length,
  };
}`;

const sampleSource = mark => String.raw`async (page) => {
  // phase9:sample
  const mark = ${JSON.stringify(mark)};
  const state = page.__phase9EvidenceRecorder;
  if (!state || state.pageId !== mark.pageId || state.sequence !== mark.sequence) {
    throw new Error('SIGNAL_WINDOW_PAGE_MISMATCH');
  }
  const render = await page.evaluate(() => {
    const text = document.body?.innerText || '';
    return {
      loadingVisible: /(^|\\s)loading(\\s|$)/i.test(text),
      path: location.pathname,
      sentinels: globalThis.__phase9VisibleSentinels?.() || [],
    };
  });
  const renderHistory = state.renders.slice(mark.renders);
  const protectedSentinels = ${JSON.stringify(PROTECTED_RENDER_SENTINELS)};
  const cookies = await page.context().cookies();
  return {
    pageId: state.pageId,
    terminalReached: true,
    loadingVisible: render.loadingVisible,
    finalUrl: page.url(),
    finalPath: render.path,
    visibleSentinels: render.sentinels,
    sessionPresent: cookies.some(cookie => /session|auth/i.test(cookie.name)),
    protectedRender: renderHistory.some(item => protectedSentinels.includes(item.sentinel)),
    renderSignals: renderHistory,
    protectedRequests: state.requests.slice(mark.requests),
    protectedListenerStarts: state.listeners.slice(mark.listeners),
    relevantHttpResults: state.responses.slice(mark.responses),
    pageErrors: state.pageErrors.slice(mark.pageErrors),
    appConsoleErrors: state.appConsoleErrors.slice(mark.appConsoleErrors),
    unexpectedRequestFailures: state.requestFailures.slice(mark.requestFailures),
    overflow: state.overflow - mark.overflow,
    renderPath: render.path,
    renderSentinel: render.sentinels[0] || '',
  };
}`;

const cleanUrl = value => {
  if (value === 'about:blank') return value;
  try {
    const parsed = new URL(value);
    if (['data:', 'blob:', 'javascript:', 'file:'].includes(parsed.protocol)) return parsed.protocol;
    if (!['http:', 'https:'].includes(parsed.protocol)) return 'opaque:';
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return 'invalid:';
  }
};

const NON_PROTECTED_API_PATHS = new Set([
  '/api/auth/session',
  '/api/contact',
  '/api/email/reset-password',
  '/api/health',
  '/api/newsletter/subscribe',
  '/api/newsletter/unsubscribe',
]);

export function isProtectedResource(signal) {
  if (!signal || typeof signal !== 'object' || signal.resourceType === 'document') return false;
  let target;
  let frame;
  try {
    target = new URL(signal.url);
    frame = new URL(signal.initiatingFrameUrl);
  } catch {
    return false;
  }
  if (!['http:', 'https:'].includes(target.protocol)) return false;
  if (target.hostname === 'firestore.googleapis.com') {
    return /\/documents(?::(?:runQuery|batchGet)|\/|$)|google\.firestore\.v1\.Firestore\/(?:Listen|RunQuery|BatchGetDocuments|Commit)/i.test(target.pathname);
  }
  if (target.origin !== frame.origin) return false;
  if (!target.pathname.startsWith('/api/')) return false;
  return !NON_PROTECTED_API_PATHS.has(target.pathname);
}

const count = value => Array.isArray(value) ? value.length : Number.isInteger(value) && value >= 0 ? value : 0;

const sanitizeWindow = value => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Signal sample must be an object.');
  const booleanFields = ['terminalReached', 'loadingVisible', 'sessionPresent', 'protectedRender'];
  const stringFields = ['pageId', 'finalUrl', 'finalPath', 'renderPath', 'renderSentinel'];
  const arrayFields = [
    'visibleSentinels', 'renderSignals', 'protectedRequests', 'protectedListenerStarts',
    'relevantHttpResults', 'pageErrors', 'appConsoleErrors', 'unexpectedRequestFailures',
  ];
  const complete = booleanFields.every(field => typeof value[field] === 'boolean')
    && stringFields.every(field => typeof value[field] === 'string')
    && arrayFields.every(field => Array.isArray(value[field]))
    && Number.isInteger(value.overflow) && value.overflow >= 0;
  if (!complete) throw new Error('Recorder must return a complete signal sample.');
  if (value.visibleSentinels.some(item => typeof item !== 'string')) throw new Error('Recorder must return a complete signal sample.');
  const requests = Array.isArray(value.protectedRequests) ? value.protectedRequests.map(item => ({
    url: cleanUrl(item?.url),
    method: typeof item?.method === 'string' ? item.method : 'UNKNOWN',
    resourceType: typeof item?.resourceType === 'string' ? item.resourceType : 'unknown',
    initiatingFrameUrl: cleanUrl(item?.initiatingFrameUrl),
    ...(Number.isInteger(item?.status) ? { status: item.status } : {}),
  })) : [];
  const http = Array.isArray(value.relevantHttpResults) ? value.relevantHttpResults.map(item => ({
    url: cleanUrl(item?.url),
    status: Number.isInteger(item?.status) ? item.status : 0,
  })) : [];
  const listeners = Array.isArray(value.protectedListenerStarts) ? value.protectedListenerStarts.map(item => ({
    url: cleanUrl(item?.url),
    method: typeof item?.method === 'string' ? item.method : 'UNKNOWN',
    resourceType: typeof item?.resourceType === 'string' ? item.resourceType : 'unknown',
    initiatingFrameUrl: cleanUrl(item?.initiatingFrameUrl),
  })) : [];
  const renderSignals = Array.isArray(value.renderSignals) ? value.renderSignals.map(item => ({
    path: typeof item?.path === 'string' ? item.path : '',
    sentinel: typeof item?.sentinel === 'string' ? item.sentinel : '',
  })) : [];
  const protectedListeners = listeners.filter(isProtectedResource);
  return {
    pageId: typeof value.pageId === 'string' ? value.pageId : '',
    terminalReached: value.terminalReached === true,
    loadingVisible: value.loadingVisible === true,
    finalUrl: cleanUrl(value.finalUrl),
    finalPath: typeof value.finalPath === 'string' ? value.finalPath : '',
    visibleSentinels: Array.isArray(value.visibleSentinels) ? value.visibleSentinels.filter(item => typeof item === 'string') : [],
    sessionPresent: value.sessionPresent === true,
    protectedRender: renderSignals.some(signal => PROTECTED_RENDER_SENTINELS.includes(signal.sentinel)),
    renderSignals,
    protectedRequests: requests.filter(isProtectedResource).length,
    requestSignals: requests,
    protectedListenerStarts: protectedListeners.length,
    listenerSignals: protectedListeners,
    relevantHttpResults: http,
    pageErrors: count(value.pageErrors),
    appConsoleErrors: count(value.appConsoleErrors),
    unexpectedRequestFailures: count(value.unexpectedRequestFailures),
    overflow: count(value.overflow),
    renderPath: typeof value.renderPath === 'string' ? value.renderPath : '',
    renderSentinel: typeof value.renderSentinel === 'string' ? value.renderSentinel : '',
  };
};

const defaultExecute = (argv, options) => new Promise(resolve => {
  const [file, ...args] = argv;
  execFile(file, args, {
    cwd: options.cwd,
    env: options.env,
    timeout: options.timeoutMs,
    maxBuffer: options.maxOutputBytes,
    encoding: 'utf8',
  }, (error, stdout = '', stderr = '') => {
    resolve({
      stdout,
      stderr,
      exitCode: error ? (Number.isInteger(error.code) ? error.code : null) : 0,
      timedOut: Boolean(error?.killed && error?.signal),
    });
  });
});

export function createPlaywrightCliClient({
  execute = defaultExecute,
  wrapperPath = DEFAULT_WRAPPER,
  cwd = process.cwd(),
  env = process.env,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  if (typeof execute !== 'function') throw new Error('Playwright CLI execute transport must be a function.');
  if (typeof wrapperPath !== 'string' || wrapperPath.length === 0) throw new Error('Playwright CLI wrapper path is required.');
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) throw new Error('Playwright CLI timeout must be a positive integer.');
  const opened = new Set();
  const currentTabs = new Map();
  const tabCounts = new Map();
  const armedTabs = new Set();
  const tabKey = session => `${session}:${currentTabs.get(session) ?? 0}`;

  const command = async (args, session, { parseNestedJson = false } = {}) => {
    const sessionArgs = session ? [`-s=${session}`] : [];
    const argv = [wrapperPath, ...sessionArgs, ...args, '--json'];
    let output;
    try {
      output = await execute(argv, { cwd, env, timeoutMs, maxOutputBytes: MAX_OUTPUT_BYTES });
    } catch {
      throw new Error('Playwright CLI transport failed.');
    }
    if (!output || output.timedOut === true) throw new Error('Playwright CLI command timed out.');
    if (output.exitCode !== 0) throw new Error('Playwright CLI command returned a nonzero exit status.');
    let parsed;
    try {
      parsed = JSON.parse(output.stdout);
    } catch {
      throw new Error('Playwright CLI response must be valid JSON.');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Playwright CLI response has an invalid JSON envelope.');
    }
    if (Object.hasOwn(parsed, 'isError') && typeof parsed.isError !== 'boolean') {
      throw new Error('Playwright CLI response has an invalid JSON envelope.');
    }
    if (parsed.isError === true) throw new Error('Playwright CLI reported an error.');
    const result = Object.hasOwn(parsed, 'result') ? parsed.result : parsed;
    if (!parseNestedJson || typeof result !== 'string') return result;
    try {
      return JSON.parse(result);
    } catch {
      throw new Error('Playwright run-code result must be valid JSON.');
    }
  };

  const executeRunCode = async (session, source) => {
    if (typeof source !== 'string' || !/^\s*async\s*\(\s*page\s*\)\s*=>/.test(source)) {
      throw new Error('Playwright run-code requires a direct async page function source.');
    }
    try {
      new Function(`"use strict"; return (${source});`);
    } catch {
      throw new Error('Playwright run-code payload failed to compile locally.');
    }
    return command(['run-code', source], session, { parseNestedJson: true });
  };

  const openBlank = async session => {
    if (!opened.has(session)) {
      await command(['open', 'about:blank', '--browser', 'chrome'], session);
      opened.add(session);
      currentTabs.set(session, 0);
      tabCounts.set(session, 1);
    }
  };
  const installRecorder = async session => {
    await executeRunCode(session, INSTALL_RECORDER_SOURCE);
    armedTabs.add(tabKey(session));
  };
  const client = {
    async goto(session, url) {
      if (!armedTabs.has(tabKey(session))) throw new Error('Signal recorder must be armed before navigation.');
      return command(['goto', url], session);
    },
    async runCode(session, source) {
      if (!armedTabs.has(tabKey(session))) throw new Error('Signal recorder must be armed before run-code.');
      return executeRunCode(session, source);
    },
    async captureSignalWindow({ session, action, terminal }) {
      if (!armedTabs.has(tabKey(session))) throw new Error('Signal recorder must be armed before an action window.');
      const mark = await executeRunCode(session, MARK_SOURCE);
      await action();
      await terminal();
      const result = await executeRunCode(session, sampleSource(mark));
      if (!result || result.pageId !== mark.pageId) throw new Error('Action window must sample the same page as its pre-action mark.');
      const sample = sanitizeWindow(result);
      return sample;
    },
    async tabNew(session, url = 'about:blank') {
      if (url !== 'about:blank') throw new Error('A new tab must open on about:blank before recorder arming.');
      const result = await command(['tab-new', url], session);
      const index = tabCounts.get(session) ?? 1;
      tabCounts.set(session, index + 1);
      currentTabs.set(session, index);
      return result;
    },
    async tabSelect(session, index) {
      if (!Number.isInteger(index) || index < 0 || index >= (tabCounts.get(session) ?? 0)) {
        throw new Error('Tab selection requires a known tab index.');
      }
      const result = await command(['tab-select', String(index)], session);
      currentTabs.set(session, index);
      return result;
    },
    listBrowsers: async () => command(['list']),
    closeAllBrowsers: async () => command(['close-all']),
  };
  CLIENT_INTERNALS.set(client, { executeRunCode, installRecorder, openBlank });
  return client;
}

export async function installSignalRecorder(client, session) {
  const internals = CLIENT_INTERNALS.get(client);
  if (!internals) throw new Error('Signal recorder requires a Playwright CLI client.');
  await internals.openBlank(session);
  const current = await internals.executeRunCode(session, `async (page) => {
    // phase9:verify-about-blank
    return { url: page.url() };
  }`);
  if (current?.url !== 'about:blank') throw new Error('Signal recorder requires the exact current tab to be about:blank.');
  return internals.installRecorder(session);
}

export async function closeAndVerifyBrowsers(client) {
  await client.closeAllBrowsers();
  const result = await client.listBrowsers();
  if (!result || !Array.isArray(result.browsers)) throw new Error('Browser list response is incomplete.');
  if (result.browsers.length !== 0) throw new Error('Browser sessions remain after close-all.');
  return { browsers: [] };
}

async function smoke() {
  const client = createPlaywrightCliClient({});
  const { observeAction } = await import('./signal-window.mjs');
  try {
    await installSignalRecorder(client, 'phase9-offline-smoke');
    const order = [];
    const first = await observeAction({
      client,
      session: 'phase9-offline-smoke',
      stage: 'first-tab',
      terminal: async () => order.push('terminal'),
      action: async () => {
        order.push('action');
        await client.runCode('phase9-offline-smoke', 'async (page) => page.evaluate(() => { document.body.textContent = "Family Overview"; })');
      },
    });
    if (order.join(',') !== 'action,terminal' || !first.protectedRender || first.renderSignals[0]?.sentinel !== 'Family Overview') {
      throw new Error('Offline smoke did not preserve pre-action signal ordering.');
    }
    await client.tabNew('phase9-offline-smoke', 'about:blank');
    await installSignalRecorder(client, 'phase9-offline-smoke');
    const second = await observeAction({
      client,
      session: 'phase9-offline-smoke',
      stage: 'second-tab',
      terminal: async () => {},
      action: async () => {},
    });
    if (!first.pageId || !second.pageId || first.pageId === second.pageId) throw new Error('Offline smoke did not isolate tab marks.');
    let cliErrorRejected = false;
    try {
      await client.runCode('phase9-offline-smoke', 'async (page) => { throw new Error("EXPECTED_OFFLINE_SMOKE_FAILURE"); }');
    } catch {
      cliErrorRejected = true;
    }
    if (!cliErrorRejected) throw new Error('Offline smoke did not reject a CLI error.');
  } finally {
    await closeAndVerifyBrowsers(client);
  }
  process.stdout.write(`${JSON.stringify({ ok: true, origin: 'about:blank', browsers: 0 })}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href && process.argv[2] === 'smoke') {
  const origin = process.argv[3] === '--origin' ? process.argv[4] : undefined;
  if (origin !== 'about:blank') throw new Error('Offline smoke permits only about:blank.');
  await smoke();
}
