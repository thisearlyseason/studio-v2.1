import { execFile } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import {
  LANDING_SENTINELS, PENDING_UNAVAILABLE_SENTINEL, PROTECTED_PAGE_HEADINGS,
  RESOURCE_TARGET_KINDS,
  SESSION_COOKIE_NAME, STAGING_ORIGIN, STAGING_PROJECT_ID, validateResourceSignal,
} from './scenario-contracts.mjs';
import { assertRunId } from '../../qa-fixtures/manifest.mjs';

const DEFAULT_WRAPPER = '/Users/tylerans/.codex/skills/playwright/scripts/playwright_cli.sh';
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_OUTPUT_BYTES = 1_048_576;
const MAX_SIGNAL_COUNT = 1000;
const CLIENT_INTERNALS = new WeakMap();
const HEADING_SENTINELS = Object.freeze([...new Set(LANDING_SENTINELS)]);
const STATUS_SENTINELS = Object.freeze([PENDING_UNAVAILABLE_SENTINEL]);

const classifyFixtureResourceScopesValue = (signal, runId, alias, stagingOrigin, stagingProjectId) => {
  const evidenceToScope = {
    'self-user-document': 'self-account',
    'self-memberships-document': 'self-account',
    'self-memberships-query': 'self-account',
    'self-parent-players-query': 'self-account',
    'join-admin-patch': 'join-admin-lookup',
    'fixture-team-a-document': 'tenant-team-a',
    'fixture-team-a-query': 'tenant-team-a',
    'fixture-team-b-document': 'tenant-team-b',
    'fixture-team-b-query': 'tenant-team-b',
    'fixture-league-document': 'tenant-league',
    'fixture-league-query': 'tenant-league',
    'other-tenant-resource': 'tenant-other',
    'foreign-user-resource': 'foreign-account',
    'foreign-player-resource': 'foreign-account',
    'plans-reference-data': 'non-tenant',
    'firestore-transport-control': 'transport-control',
    'unscoped-resource': 'unscoped',
  };
  const evidenceOrder = Object.keys(evidenceToScope);
  const scopeOrder = [
    'self-account', 'join-admin-lookup', 'tenant-team-a', 'tenant-team-b', 'tenant-league',
    'tenant-other', 'foreign-account', 'non-tenant', 'transport-control', 'unscoped',
  ];
  const evidence = new Set();
  const add = value => evidence.add(value);
  const unknown = () => add('unscoped-resource');
  const result = () => {
    const scopeEvidence = evidenceOrder.filter(value => evidence.has(value));
    if (scopeEvidence.length === 0) scopeEvidence.push('unscoped-resource');
    const resourceScopes = scopeOrder.filter(scope => scopeEvidence.some(item => evidenceToScope[item] === scope));
    return { scopeEvidence, resourceScopes };
  };

  if (!signal || typeof signal !== 'object' || typeof signal.url !== 'string') {
    unknown();
    return result();
  }
  let target;
  try {
    target = new URL(signal.url);
  } catch {
    unknown();
    return result();
  }
  if (
    target.origin === stagingOrigin
    && target.pathname === '/api/schools/admins'
    && signal.method === 'PATCH'
  ) {
    add('join-admin-patch');
    return result();
  }
  if (target.hostname !== 'firestore.googleapis.com' || typeof runId !== 'string' || alias !== 'qa-no-team') {
    unknown();
    return result();
  }

  const selfUid = `${runId}-no-team`;
  const teamA = `${runId}-team-a`;
  const teamB = `${runId}-team-b`;
  const fixtureLeague = `${runId}-league`;
  const databaseRoot = `projects/${stagingProjectId}/databases/(default)/documents`;
  const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const exactKeys = (value, required, optional = []) => {
    if (!isRecord(value)) return false;
    const keys = Object.keys(value);
    return required.every(key => keys.includes(key))
      && keys.every(key => required.includes(key) || optional.includes(key));
  };
  const decode = value => {
    let decoded = value;
    for (let index = 0; index < 3; index += 1) {
      try {
        const next = decodeURIComponent(decoded.replace(/\+/g, ' '));
        if (next === decoded) break;
        decoded = next;
      } catch {
        break;
      }
    }
    return decoded;
  };
  const classifyDocumentName = (input, source = 'document') => {
    if (typeof input !== 'string') {
      unknown();
      return;
    }
    const name = decode(input).replace(/^\/+/, '');
    const marker = '/documents/';
    const markerIndex = name.indexOf(marker);
    const resourceRoot = markerIndex >= 0 ? name.slice(0, markerIndex + '/documents'.length) : databaseRoot;
    const resourcePath = markerIndex >= 0 ? name.slice(markerIndex + marker.length) : name;
    if (resourceRoot !== databaseRoot) {
      unknown();
      return;
    }
    const segments = resourcePath.split('/').filter(Boolean);
    if (segments.length === 0) {
      unknown();
      return;
    }
    const [collection, id, childCollection] = segments;
    if (collection === 'users') {
      if (id === selfUid) {
        if (segments.length === 2) add('self-user-document');
        else if (childCollection === 'teamMemberships' && (segments.length === 3 || segments.length === 4)) {
          add('self-memberships-document');
        } else unknown();
      } else add('foreign-user-resource');
      return;
    }
    if (collection === 'teams') {
      if (id === teamA) add(source === 'query' ? 'fixture-team-a-query' : 'fixture-team-a-document');
      else if (id === teamB) add(source === 'query' ? 'fixture-team-b-query' : 'fixture-team-b-document');
      else add('other-tenant-resource');
      return;
    }
    if (collection === 'leagues') {
      if (id === fixtureLeague) add(source === 'query' ? 'fixture-league-query' : 'fixture-league-document');
      else add('other-tenant-resource');
      return;
    }
    if (collection === 'players') {
      add('foreign-player-resource');
      return;
    }
    if (collection === 'plans') {
      add('plans-reference-data');
      return;
    }
    unknown();
  };
  const collectStringValues = value => {
    const found = [];
    const visit = node => {
      if (typeof node === 'string') found.push(node);
      else if (Array.isArray(node)) node.forEach(visit);
      else if (isRecord(node)) Object.values(node).forEach(visit);
    };
    visit(value);
    return found;
  };
  const exactSelfParentFilter = where => {
    if (!exactKeys(where, ['fieldFilter'])) return false;
    const filter = where.fieldFilter;
    if (!exactKeys(filter, ['field', 'op', 'value'])) return false;
    if (!exactKeys(filter.field, ['fieldPath']) || filter.field.fieldPath !== 'parentId') return false;
    if (filter.op !== 'EQUAL') return false;
    return exactKeys(filter.value, ['stringValue']) && filter.value.stringValue === selfUid;
  };
  const classifyQuery = query => {
    if (!exactKeys(query, ['parent', 'structuredQuery'])) {
      unknown();
      return;
    }
    const structured = query.structuredQuery;
    if (!exactKeys(structured, ['from'], ['where', 'orderBy', 'select', 'limit', 'startAt', 'endAt', 'offset'])) {
      unknown();
      return;
    }
    if (!Array.isArray(structured.from) || structured.from.length !== 1) {
      unknown();
      return;
    }
    const from = structured.from[0];
    if (!exactKeys(from, ['collectionId'], ['allDescendants']) || from.allDescendants === true) {
      unknown();
      return;
    }
    const collection = from.collectionId;
    const structuredStrings = collectStringValues(structured);
    if (structuredStrings.includes(teamA)) add('fixture-team-a-query');
    if (structuredStrings.includes(teamB)) add('fixture-team-b-query');
    if (structuredStrings.includes(fixtureLeague)) add('fixture-league-query');
    for (const value of structuredStrings) {
      if (value.startsWith(`${databaseRoot}/`)) classifyDocumentName(value, 'query');
    }
    if (collection === 'players') {
      if (query.parent === databaseRoot && exactSelfParentFilter(structured.where)) add('self-parent-players-query');
      else add('foreign-player-resource');
      return;
    }
    if (collection === 'teamMemberships') {
      if (query.parent === `${databaseRoot}/users/${selfUid}` && !Object.hasOwn(structured, 'where')) {
        add('self-memberships-query');
      } else unknown();
      return;
    }
    if (collection === 'plans' && query.parent === databaseRoot) {
      add('plans-reference-data');
      return;
    }
    if (collection === 'teams') {
      add('other-tenant-resource');
      return;
    }
    if (collection === 'leagues') {
      if (structuredStrings.includes(fixtureLeague)) add('fixture-league-query');
      else add('other-tenant-resource');
      return;
    }
    if (collection === 'users') {
      add('foreign-user-resource');
      return;
    }
    unknown();
  };
  const classifyTarget = addTarget => {
    if (!exactKeys(addTarget, [], ['documents', 'query', 'targetId', 'resumeToken', 'readTime', 'expectedCount', 'once'])) {
      unknown();
    }
    const hasDocuments = isRecord(addTarget?.documents);
    const hasQuery = isRecord(addTarget?.query);
    if (hasDocuments === hasQuery) {
      unknown();
      if (!hasDocuments) return;
    }
    if (hasDocuments) {
      const documents = addTarget.documents;
      if (!exactKeys(documents, ['documents']) || !Array.isArray(documents.documents) || documents.documents.length === 0) {
        unknown();
      } else documents.documents.forEach(name => classifyDocumentName(name));
    }
    if (hasQuery) classifyQuery(addTarget.query);
  };
  const parseMessages = body => {
    if (typeof body !== 'string' || body.length === 0) return { messages: [], controlOnly: true, malformed: false };
    const decoded = decode(body);
    const messages = [];
    let malformed = false;
    const parse = value => {
      try {
        messages.push(JSON.parse(value));
      } catch {
        malformed = true;
      }
    };
    const params = new URLSearchParams(body);
    const dataValues = [...params.entries()]
      .filter(([key]) => /req\d+___data__$/.test(key))
      .map(([, value]) => value);
    if (dataValues.length > 0) dataValues.forEach(value => parse(decode(value)));
    else parse(decoded);
    return { messages, controlOnly: false, malformed };
  };
  const visitMessages = value => {
    if (Array.isArray(value)) {
      value.forEach(visitMessages);
      return;
    }
    if (!isRecord(value)) {
      unknown();
      return;
    }
    const hasAddTarget = Object.hasOwn(value, 'addTarget');
    const hasRemoveTarget = Object.hasOwn(value, 'removeTarget');
    if (hasAddTarget || hasRemoveTarget) {
      const allowedKeys = new Set(['database', 'addTarget', 'removeTarget', 'labels']);
      if (hasAddTarget && hasRemoveTarget) unknown();
      if (
        Object.hasOwn(value, 'database')
        && value.database !== `projects/${stagingProjectId}/databases/(default)`
      ) unknown();
      for (const [key, child] of Object.entries(value)) {
        if (allowedKeys.has(key)) continue;
        unknown();
        if (Array.isArray(child) || isRecord(child)) visitMessages(child);
      }
      if (hasAddTarget) classifyTarget(value.addTarget);
      if (hasRemoveTarget) add('firestore-transport-control');
      return;
    }
    if (Object.hasOwn(value, 'structuredQuery') || Object.hasOwn(value, 'parent')) {
      classifyQuery(value);
      return;
    }
    const children = Object.values(value).filter(child => Array.isArray(child) || isRecord(child));
    if (children.length === 0) unknown();
    else children.forEach(visitMessages);
  };

  const path = decode(target.pathname);
  const documentMarker = `/v1/projects/${stagingProjectId}/databases/(default)/documents/`;
  if (path.startsWith(documentMarker)) {
    classifyDocumentName(`${databaseRoot}/${path.slice(documentMarker.length)}`);
    return result();
  }
  const isListen = /google\.firestore\.v1\.Firestore\/Listen|\/Listen\/channel/i.test(path);
  const isRunQuery = /documents:runQuery|Firestore\/RunQuery|\/RunQuery\/channel/i.test(path);
  if (!isListen && !isRunQuery) {
    unknown();
    return result();
  }
  const parsed = parseMessages(signal.body);
  if (parsed.malformed) unknown();
  if (parsed.controlOnly) add('firestore-transport-control');
  parsed.messages.forEach(visitMessages);
  return result();
};

export function classifyFixtureResourceScopes(signal, { runId, alias } = {}) {
  assertRunId(runId);
  if (alias !== 'qa-no-team') throw new Error('Fixture resource scoping currently requires qa-no-team.');
  return classifyFixtureResourceScopesValue(signal, runId, alias, STAGING_ORIGIN, STAGING_PROJECT_ID);
}

const installRecorderSource = fixtureRunId => String.raw`async (page) => {
  // phase9:install
  const fixtureRunId = ${JSON.stringify(fixtureRunId ?? null)};
  const classifyFixtureResourceScopesValue = ${classifyFixtureResourceScopesValue.toString()};
  const nonProtectedApiPaths = new Set(${JSON.stringify([
    '/api/auth/session', '/api/contact', '/api/email/reset-password', '/api/health',
    '/api/newsletter/subscribe', '/api/newsletter/unsubscribe',
  ])});
  const classifyTargetKind = (value, resourceType = 'fetch') => {
    if (resourceType === 'document') return 'non-protected';
    try {
      const target = new URL(value);
      if (!['http:', 'https:'].includes(target.protocol)) return 'non-protected';
      if (target.hostname === 'firestore.googleapis.com') {
        if (/google\.firestore\.v1\.Firestore\/Listen|\/Listen\/channel/i.test(target.pathname)) return 'firestore-listen';
        if (/documents:runQuery|Firestore\/RunQuery|\/RunQuery\/channel/i.test(target.pathname)) return 'firestore-run-query';
        if (/\/documents\//i.test(target.pathname)) return 'firestore-document';
        if (/\/documents(?::batchGet|$)|Firestore\/(?:BatchGetDocuments|Commit)/i.test(target.pathname)) return 'firestore-protected';
        return 'non-protected';
      }
      if (target.origin !== ${JSON.stringify(STAGING_ORIGIN)} || !target.pathname.startsWith('/api/')) return 'non-protected';
      if (nonProtectedApiPaths.has(target.pathname)) return 'non-protected';
      if (target.pathname === '/api/schools/admins') return 'staging-join-admin-api';
      return 'staging-protected-api';
    } catch {
      return 'non-protected';
    }
  };
  const cleanPath = value => {
    if (typeof value !== 'string') return 'invalid:';
    if (!fixtureRunId) return value;
    return value.split('/').map(segment => segment.startsWith(fixtureRunId) ? ':fixture-resource' : segment).join('/');
  };
  const cleanUrl = value => {
    if (value === 'about:blank') return value;
    try {
      const parsed = new URL(value);
      if (['data:', 'blob:', 'javascript:', 'file:'].includes(parsed.protocol)) return parsed.protocol;
      if (!['http:', 'https:'].includes(parsed.protocol)) return 'opaque:';
      return parsed.origin + cleanPath(parsed.pathname);
    } catch {
      return 'invalid:';
    }
  };
  const boundedPush = (state, key, value) => {
    if (state[key].length >= ${MAX_SIGNAL_COUNT}) {
      state.overflow += 1;
      return;
    }
    state[key].push(value);
  };
  const initializeRenderObserver = function initializeRenderObserver() {
    if (globalThis.__phase9RenderObserverInstalled) return;
    if (!document.documentElement) {
      document.addEventListener('DOMContentLoaded', initializeRenderObserver, { once: true });
      return;
    }
    globalThis.__phase9RenderObserverInstalled = true;
    const headingSentinels = ${JSON.stringify(HEADING_SENTINELS)};
    const statusSentinels = ${JSON.stringify(STATUS_SENTINELS)};
    const protectedHeadings = ${JSON.stringify(PROTECTED_PAGE_HEADINGS)};
    const selectionScope = value => {
      if (!value || !fixtureRunId) return null;
      if (value === fixtureRunId + '-team-a') return 'tenant-team-a';
      if (value === fixtureRunId + '-team-b') return 'tenant-team-b';
      return 'tenant-other';
    };
    if (!globalThis.__phase9TeamSelectionObserverInstalled) {
      globalThis.__phase9TeamSelectionObserverInstalled = true;
      try {
        const initialScope = selectionScope(localStorage.getItem('sf_session_team_id'));
        if (initialScope) void globalThis.__phase9RecordTeamSelection(initialScope);
        const originalSetItem = Storage.prototype.setItem;
        Storage.prototype.setItem = function phase9ObservedStorageSetItem(key, value) {
          const result = originalSetItem.call(this, key, value);
          if (this === localStorage && key === 'sf_session_team_id') {
            const scope = selectionScope(String(value));
            if (scope) void globalThis.__phase9RecordTeamSelection(scope);
          }
          return result;
        };
      } catch {
        // about:blank has an opaque origin; hosted pages are observed after navigation.
      }
    }
    const definitions = [
      ...headingSentinels.map(sentinel => ({ kind: 'heading', sentinel })),
      ...statusSentinels.map(sentinel => ({ kind: 'status', sentinel })),
    ];
    const keyOf = signal => signal.kind + '\u0000' + signal.sentinel;
    const candidates = new Map(definitions.map(signal => [keyOf(signal), new Set()]));
    const normalizedHeading = element => (element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim();
    const visibleEdges = new Set();
    const visible = element => {
      if (!element?.isConnected) return false;
      for (let current = element; current; current = current.parentElement) {
        if (current.hidden || current.getAttribute('aria-hidden') === 'true') return false;
        const style = getComputedStyle(current);
        if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || Number(style.opacity) === 0) return false;
      }
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const refreshCandidates = () => {
      for (const elements of candidates.values()) elements.clear();
      const root = document.body || document.documentElement;
      if (!root) return;
      for (const heading of root.querySelectorAll('h1')) {
        const exactText = normalizedHeading(heading);
        const key = keyOf({ kind: 'heading', sentinel: exactText });
        if (candidates.has(key)) candidates.get(key).add(heading);
      }
      for (const status of root.querySelectorAll('[role="status"]')) {
        for (const element of [status, ...status.querySelectorAll('*')]) {
          const exactText = normalizedHeading(element);
          const key = keyOf({ kind: 'status', sentinel: exactText });
          if (candidates.has(key)) candidates.get(key).add(element);
        }
      }
    };
    const visibleSignals = signals => signals.filter(signal =>
      [...candidates.get(keyOf(signal))].some(visible));
    const recordRisingEdges = signals => {
      const current = new Set(visibleSignals(signals).map(keyOf));
      for (const signal of signals) {
        const key = keyOf(signal);
        if (current.has(key)) {
          if (!visibleEdges.has(key)) {
            visibleEdges.add(key);
            void globalThis.__phase9RecordRender({ ...signal, pathname: location.pathname });
          }
        } else {
          visibleEdges.delete(key);
        }
      }
    };
    globalThis.__phase9VisibleSentinels = () => [...new Set(visibleSignals(definitions).map(signal => signal.sentinel))];
    const mutationSample = records => {
      if (!records || records.some(record => record.type === 'childList' || record.type === 'characterData')) refreshCandidates();
      recordRisingEdges(definitions);
    };
    refreshCandidates();
    mutationSample();
    new MutationObserver(mutationSample).observe(document.documentElement, {
      childList: true, subtree: true, characterData: true, attributes: true,
      attributeFilter: ['style', 'class', 'hidden', 'aria-hidden'],
    });
    const sampleAnimationFrame = () => {
      recordRisingEdges(definitions.filter(signal => signal.kind === 'heading' && protectedHeadings.includes(signal.sentinel)));
      requestAnimationFrame(sampleAnimationFrame);
    };
    requestAnimationFrame(sampleAnimationFrame);
  };
  if (!page.__phase9EvidenceRecorder) {
    const state = {
      pageId: 'phase9-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2),
      sequence: 0,
      requests: [],
      listeners: [],
      selections: [],
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
        targetKind: classifyTargetKind(request.url(), request.resourceType()),
        method: request.method(),
        resourceType: request.resourceType(),
        initiatingFrameUrl,
        ...classifyFixtureResourceScopesValue({
          url: request.url(),
          method: request.method(),
          body: request.postData() || '',
        }, fixtureRunId, 'qa-no-team', ${JSON.stringify(STAGING_ORIGIN)}, ${JSON.stringify(STAGING_PROJECT_ID)}),
      };
      boundedPush(state, 'requests', signal);
      if (/google\.firestore\.v1\.Firestore\/Listen|\/Listen\/channel/i.test(request.url())) {
        boundedPush(state, 'listeners', signal);
      }
    });
    page.on('response', response => boundedPush(state, 'responses', {
      targetKind: classifyTargetKind(response.url()),
      status: response.status(),
    }));
    page.on('pageerror', () => boundedPush(state, 'pageErrors', 'PAGE_ERROR'));
    page.on('console', message => {
      if (message.type() === 'error') boundedPush(state, 'appConsoleErrors', 'APPLICATION_CONSOLE_ERROR');
    });
    page.on('requestfailed', request => boundedPush(state, 'requestFailures', {
      targetKind: classifyTargetKind(request.url(), request.resourceType()),
      signature: 'REQUEST_FAILED',
    }));
    await page.exposeFunction('__phase9RecordRender', signal => {
      if (!signal || !['heading', 'status'].includes(signal.kind)
        || typeof signal.pathname !== 'string' || typeof signal.sentinel !== 'string') return;
      boundedPush(state, 'renders', { kind: signal.kind, pathname: signal.pathname, sentinel: signal.sentinel });
    });
    await page.exposeFunction('__phase9RecordTeamSelection', scope => {
      if (!['tenant-team-a', 'tenant-team-b', 'tenant-other'].includes(scope)) return;
      boundedPush(state, 'selections', scope);
    });
    await page.addInitScript(initializeRenderObserver);
    await page.evaluate(initializeRenderObserver);
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
    selections: state.selections.length,
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
      redirectReason: (() => {
        const reason = new URLSearchParams(location.search).get('reason');
        return reason === null ? 'none' : reason === 'unavailable' ? 'unavailable' : 'other';
      })(),
    };
  });
  const renderHistory = state.renders.slice(mark.renders);
  const protectedHeadings = ${JSON.stringify(PROTECTED_PAGE_HEADINGS)};
  const cookies = await page.context().cookies(${JSON.stringify(STAGING_ORIGIN)});
  return {
    pageId: state.pageId,
    terminalReached: true,
    loadingVisible: render.loadingVisible,
    finalUrl: page.url(),
    finalPath: render.path,
    visibleSentinels: render.sentinels,
    sessionPresent: cookies.some(cookie => (
      cookie.name === ${JSON.stringify(SESSION_COOKIE_NAME)}
      && typeof cookie.value === 'string'
      && cookie.value.length > 0
    )),
    protectedRender: renderHistory.some(item => item.kind === 'heading' && protectedHeadings.includes(item.sentinel)),
    renderSignals: renderHistory,
    redirectReason: render.redirectReason,
    protectedRequests: state.requests.slice(mark.requests),
    protectedListenerStarts: state.listeners.slice(mark.listeners),
    teamSelectionSignals: state.selections.slice(mark.selections),
    relevantHttpResults: state.responses.slice(mark.responses),
    pageErrors: state.pageErrors.slice(mark.pageErrors),
    appConsoleErrors: state.appConsoleErrors.slice(mark.appConsoleErrors),
    unexpectedRequestFailures: state.requestFailures.slice(mark.requestFailures),
    overflow: state.overflow - mark.overflow,
    renderPath: render.path,
    renderSentinel: render.sentinels[0] || '',
  };
}`;

const sanitizeFixturePath = (value, fixtureRunId) => {
  if (typeof value !== 'string') return '';
  if (!fixtureRunId) return value;
  return value.split('/').map(segment => (
    segment.startsWith(fixtureRunId) ? ':fixture-resource' : segment
  )).join('/');
};

const cleanUrl = (value, fixtureRunId) => {
  if (value === 'about:blank') return value;
  try {
    const parsed = new URL(value);
    if (['data:', 'blob:', 'javascript:', 'file:'].includes(parsed.protocol)) return parsed.protocol;
    if (!['http:', 'https:'].includes(parsed.protocol)) return 'opaque:';
    return `${parsed.origin}${sanitizeFixturePath(parsed.pathname, fixtureRunId)}`;
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
  if (typeof signal.targetKind === 'string') return RESOURCE_TARGET_KINDS.includes(signal.targetKind);
  let target;
  try {
    target = new URL(signal.url);
  } catch {
    return false;
  }
  if (!['http:', 'https:'].includes(target.protocol)) return false;
  if (target.hostname === 'firestore.googleapis.com') {
    return /\/documents(?::(?:runQuery|batchGet)|\/|$)|google\.firestore\.v1\.Firestore\/(?:Listen|RunQuery|BatchGetDocuments|Commit)/i.test(target.pathname);
  }
  if (target.origin !== STAGING_ORIGIN) return false;
  if (!target.pathname.startsWith('/api/')) return false;
  return !NON_PROTECTED_API_PATHS.has(target.pathname);
}

const count = value => Array.isArray(value) ? value.length : Number.isInteger(value) && value >= 0 ? value : 0;

const classifyTargetKindValue = (value, resourceType = 'fetch') => {
  if (resourceType === 'document') return 'non-protected';
  let target;
  try {
    target = new URL(value);
  } catch {
    return 'non-protected';
  }
  if (!['http:', 'https:'].includes(target.protocol)) return 'non-protected';
  if (target.hostname === 'firestore.googleapis.com') {
    if (/google\.firestore\.v1\.Firestore\/Listen|\/Listen\/channel/i.test(target.pathname)) return 'firestore-listen';
    if (/documents:runQuery|Firestore\/RunQuery|\/RunQuery\/channel/i.test(target.pathname)) return 'firestore-run-query';
    if (/\/documents\//i.test(target.pathname)) return 'firestore-document';
    if (/\/documents(?::batchGet|$)|Firestore\/(?:BatchGetDocuments|Commit)/i.test(target.pathname)) return 'firestore-protected';
    return 'non-protected';
  }
  if (target.origin !== STAGING_ORIGIN || !target.pathname.startsWith('/api/')) return 'non-protected';
  if (NON_PROTECTED_API_PATHS.has(target.pathname)) return 'non-protected';
  if (target.pathname === '/api/schools/admins') return 'staging-join-admin-api';
  return 'staging-protected-api';
};

const sameArray = (left, right) => (
  Array.isArray(left) && Array.isArray(right)
  && left.length === right.length && left.every((item, index) => item === right[index])
);

const sanitizeResourceSignal = (item, fixtureRunId) => {
  const method = typeof item?.method === 'string' ? item.method : 'UNKNOWN';
  const resourceType = typeof item?.resourceType === 'string' ? item.resourceType : 'unknown';
  const targetKind = RESOURCE_TARGET_KINDS.includes(item?.targetKind)
    ? item.targetKind
    : classifyTargetKindValue(item?.url, resourceType);
  let classification;
  if (typeof item?.url === 'string' && fixtureRunId) {
    classification = classifyFixtureResourceScopesValue(
      { url: item.url, method, body: typeof item.body === 'string' ? item.body : '' },
      fixtureRunId,
      'qa-no-team',
      STAGING_ORIGIN,
      STAGING_PROJECT_ID,
    );
    if (
      (item.scopeEvidence !== undefined && !sameArray(item.scopeEvidence, classification.scopeEvidence))
      || (item.resourceScopes !== undefined && !sameArray(item.resourceScopes, classification.resourceScopes))
    ) throw new Error('Recorder resource evidence does not match parsed request evidence.');
  } else {
    classification = {
      scopeEvidence: Array.isArray(item?.scopeEvidence) ? [...item.scopeEvidence] : ['unscoped-resource'],
      resourceScopes: Array.isArray(item?.resourceScopes) ? [...item.resourceScopes] : ['unscoped'],
    };
  }
  const signal = {
    targetKind,
    method,
    resourceType,
    initiatingFrameUrl: cleanUrl(item?.initiatingFrameUrl, fixtureRunId),
    scopeEvidence: classification.scopeEvidence,
    resourceScopes: classification.resourceScopes,
    ...(Number.isInteger(item?.status) ? { status: item.status } : {}),
  };
  if (isProtectedResource(signal)) validateResourceSignal(signal, 'Recorder resource signal');
  return signal;
};

const sanitizeWindow = (value, { fixtureRunId } = {}) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Signal sample must be an object.');
  const booleanFields = ['terminalReached', 'loadingVisible', 'sessionPresent', 'protectedRender'];
  const stringFields = ['pageId', 'finalUrl', 'finalPath', 'renderPath', 'renderSentinel'];
  const arrayFields = [
    'visibleSentinels', 'renderSignals', 'protectedRequests', 'protectedListenerStarts',
    'teamSelectionSignals', 'relevantHttpResults', 'pageErrors', 'appConsoleErrors', 'unexpectedRequestFailures',
  ];
  const complete = booleanFields.every(field => typeof value[field] === 'boolean')
    && stringFields.every(field => typeof value[field] === 'string')
    && arrayFields.every(field => Array.isArray(value[field]))
    && ['unavailable', 'none', 'other'].includes(value.redirectReason)
    && Number.isInteger(value.overflow) && value.overflow >= 0;
  if (!complete) throw new Error('Recorder must return a complete signal sample.');
  if (value.visibleSentinels.some(item => typeof item !== 'string')) throw new Error('Recorder must return a complete signal sample.');
  const teamSelectionSignals = value.teamSelectionSignals;
  if (!Array.isArray(teamSelectionSignals) || teamSelectionSignals.some(scope => (
    !['tenant-team-a', 'tenant-team-b', 'tenant-other'].includes(scope)
  ))) throw new Error('Recorder must return fixed team-selection scopes.');
  const requests = Array.isArray(value.protectedRequests)
    ? value.protectedRequests.map(item => sanitizeResourceSignal(item, fixtureRunId)) : [];
  const http = Array.isArray(value.relevantHttpResults) ? value.relevantHttpResults.map(item => ({
    targetKind: RESOURCE_TARGET_KINDS.includes(item?.targetKind)
      ? item.targetKind : classifyTargetKindValue(item?.url),
    status: Number.isInteger(item?.status) ? item.status : 0,
  })) : [];
  const listeners = Array.isArray(value.protectedListenerStarts)
    ? value.protectedListenerStarts.map(item => sanitizeResourceSignal(item, fixtureRunId)) : [];
  if (value.renderSignals.some(item => (
    !item || typeof item !== 'object' || Array.isArray(item)
    || !['heading', 'status'].includes(item.kind)
    || typeof item.pathname !== 'string' || typeof item.sentinel !== 'string'
  ))) throw new Error('Recorder must return typed render signals.');
  const renderSignals = value.renderSignals.slice(0, MAX_SIGNAL_COUNT).map(item => ({
    kind: item.kind, pathname: sanitizeFixturePath(item.pathname, fixtureRunId), sentinel: item.sentinel,
  }));
  const protectedListeners = listeners.filter(isProtectedResource);
  const protectedRequests = requests.filter(isProtectedResource);
  return {
    pageId: typeof value.pageId === 'string' ? value.pageId : '',
    terminalReached: value.terminalReached === true,
    loadingVisible: value.loadingVisible === true,
    finalUrl: cleanUrl(value.finalUrl, fixtureRunId),
    finalPath: sanitizeFixturePath(value.finalPath, fixtureRunId),
    visibleSentinels: Array.isArray(value.visibleSentinels) ? value.visibleSentinels.filter(item => typeof item === 'string') : [],
    sessionPresent: value.sessionPresent === true,
    protectedRender: renderSignals.some(signal => signal.kind === 'heading' && PROTECTED_PAGE_HEADINGS.includes(signal.sentinel)),
    renderSignals,
    redirectReason: value.redirectReason,
    protectedRequests: protectedRequests.length,
    protectedRequestSignals: protectedRequests,
    requestSignals: requests,
    protectedListenerStarts: protectedListeners.length,
    listenerSignals: protectedListeners,
    teamSelectionSignals: teamSelectionSignals.slice(0, MAX_SIGNAL_COUNT),
    relevantHttpResults: http,
    pageErrors: count(value.pageErrors),
    appConsoleErrors: count(value.appConsoleErrors),
    unexpectedRequestFailures: count(value.unexpectedRequestFailures),
    overflow: count(value.overflow),
    renderPath: sanitizeFixturePath(value.renderPath, fixtureRunId),
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
  fixtureRunId,
} = {}) {
  if (typeof execute !== 'function') throw new Error('Playwright CLI execute transport must be a function.');
  if (typeof wrapperPath !== 'string' || wrapperPath.length === 0) throw new Error('Playwright CLI wrapper path is required.');
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) throw new Error('Playwright CLI timeout must be a positive integer.');
  if (fixtureRunId !== undefined) assertRunId(fixtureRunId);
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
    await executeRunCode(session, installRecorderSource(fixtureRunId));
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
      const sample = sanitizeWindow(result, { fixtureRunId });
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
        await client.runCode('phase9-offline-smoke', 'async (page) => page.evaluate(() => { document.body.innerHTML = "<h1>Family Overview</h1>"; })');
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
      action: async () => {
        await client.runCode('phase9-offline-smoke', 'async (page) => page.evaluate(() => { document.body.innerHTML = "<h1>Family Overview</h1>"; })');
      },
    });
    if (!first.pageId || !second.pageId || first.pageId === second.pageId || !second.protectedRender) {
      throw new Error('Offline smoke did not isolate and re-arm tab marks.');
    }
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
