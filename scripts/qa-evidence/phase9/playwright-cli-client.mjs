import { execFile } from 'node:child_process';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';

import {
  LANDING_SENTINELS, PENDING_UNAVAILABLE_SENTINEL, PROTECTED_PAGE_HEADINGS,
  RESOURCE_TARGET_KINDS,
  SESSION_COOKIE_NAME, STAGING_ORIGIN, STAGING_PROJECT_ID, assertNoFixtureIdentifierLeak,
  validateResourceSignal,
} from './scenario-contracts.mjs';
import { assertRunId } from '../../qa-fixtures/manifest.mjs';

const DEFAULT_WRAPPER = '/Users/tylerans/.codex/skills/playwright/scripts/playwright_cli.sh';
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_OUTPUT_BYTES = 1_048_576;
const MAX_SIGNAL_COUNT = 1000;
const CLIENT_INTERNALS = new WeakMap();
const HEADING_SENTINELS = Object.freeze([...new Set(LANDING_SENTINELS)]);
const STATUS_SENTINELS = Object.freeze([PENDING_UNAVAILABLE_SENTINEL]);
const integrityPayload = (pageId, sequence, channel, signal) => JSON.stringify([
  pageId,
  sequence,
  channel,
  signal,
]);

const hmacSha256Base64UrlValue = (keyBase64, message) => {
  const base64Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const decodeBase64 = value => {
    const clean = value.replace(/=+$/g, '');
    const bytes = [];
    let buffer = 0;
    let bits = 0;
    for (const character of clean) {
      const index = base64Alphabet.indexOf(character);
      if (index < 0) throw new Error('INVALID_INTEGRITY_KEY');
      buffer = (buffer << 6) | index;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        bytes.push((buffer >>> bits) & 0xff);
      }
    }
    return bytes;
  };
  const utf8 = value => {
    const bytes = [];
    for (let index = 0; index < value.length; index += 1) {
      let codePoint = value.codePointAt(index);
      if (codePoint > 0xffff) index += 1;
      if (codePoint <= 0x7f) bytes.push(codePoint);
      else if (codePoint <= 0x7ff) {
        bytes.push(0xc0 | (codePoint >>> 6), 0x80 | (codePoint & 0x3f));
      } else if (codePoint <= 0xffff) {
        bytes.push(0xe0 | (codePoint >>> 12), 0x80 | ((codePoint >>> 6) & 0x3f), 0x80 | (codePoint & 0x3f));
      } else {
        bytes.push(
          0xf0 | (codePoint >>> 18),
          0x80 | ((codePoint >>> 12) & 0x3f),
          0x80 | ((codePoint >>> 6) & 0x3f),
          0x80 | (codePoint & 0x3f),
        );
      }
    }
    return bytes;
  };
  const sha256 = input => {
    const constants = [
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
    ];
    const bytes = [...input, 0x80];
    while (bytes.length % 64 !== 56) bytes.push(0);
    const bitLength = input.length * 8;
    const high = Math.floor(bitLength / 0x100000000);
    const low = bitLength >>> 0;
    for (let shift = 24; shift >= 0; shift -= 8) bytes.push((high >>> shift) & 0xff);
    for (let shift = 24; shift >= 0; shift -= 8) bytes.push((low >>> shift) & 0xff);
    const hash = [
      0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
      0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
    ];
    const rotateRight = (value, count) => (value >>> count) | (value << (32 - count));
    for (let offset = 0; offset < bytes.length; offset += 64) {
      const words = new Array(64).fill(0);
      for (let index = 0; index < 16; index += 1) {
        const cursor = offset + (index * 4);
        words[index] = (
          (bytes[cursor] << 24)
          | (bytes[cursor + 1] << 16)
          | (bytes[cursor + 2] << 8)
          | bytes[cursor + 3]
        ) >>> 0;
      }
      for (let index = 16; index < 64; index += 1) {
        const small0 = rotateRight(words[index - 15], 7) ^ rotateRight(words[index - 15], 18) ^ (words[index - 15] >>> 3);
        const small1 = rotateRight(words[index - 2], 17) ^ rotateRight(words[index - 2], 19) ^ (words[index - 2] >>> 10);
        words[index] = (words[index - 16] + small0 + words[index - 7] + small1) >>> 0;
      }
      let [a, b, c, d, e, f, g, h] = hash;
      for (let index = 0; index < 64; index += 1) {
        const large1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
        const choose = (e & f) ^ ((~e) & g);
        const temp1 = (h + large1 + choose + constants[index] + words[index]) >>> 0;
        const large0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
        const majority = (a & b) ^ (a & c) ^ (b & c);
        const temp2 = (large0 + majority) >>> 0;
        h = g;
        g = f;
        f = e;
        e = (d + temp1) >>> 0;
        d = c;
        c = b;
        b = a;
        a = (temp1 + temp2) >>> 0;
      }
      hash[0] = (hash[0] + a) >>> 0;
      hash[1] = (hash[1] + b) >>> 0;
      hash[2] = (hash[2] + c) >>> 0;
      hash[3] = (hash[3] + d) >>> 0;
      hash[4] = (hash[4] + e) >>> 0;
      hash[5] = (hash[5] + f) >>> 0;
      hash[6] = (hash[6] + g) >>> 0;
      hash[7] = (hash[7] + h) >>> 0;
    }
    return hash.flatMap(word => [word >>> 24, (word >>> 16) & 0xff, (word >>> 8) & 0xff, word & 0xff]);
  };
  let key = decodeBase64(keyBase64);
  if (key.length > 64) key = sha256(key);
  key = [...key, ...new Array(64 - key.length).fill(0)];
  const inner = sha256([...key.map(byte => byte ^ 0x36), ...utf8(message)]);
  const digest = sha256([...key.map(byte => byte ^ 0x5c), ...inner]);
  let encoded = '';
  for (let index = 0; index < digest.length; index += 3) {
    const triplet = (digest[index] << 16) | ((digest[index + 1] ?? 0) << 8) | (digest[index + 2] ?? 0);
    encoded += base64Alphabet[(triplet >>> 18) & 63];
    encoded += base64Alphabet[(triplet >>> 12) & 63];
    encoded += index + 1 < digest.length ? base64Alphabet[(triplet >>> 6) & 63] : '=';
    encoded += index + 2 < digest.length ? base64Alphabet[triplet & 63] : '=';
  }
  return encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const parseAbsoluteUrlValue = input => {
  if (typeof input !== 'string') return null;
  const match = /^(https?):\/\/([^/?#]+)(\/[^?#]*)?(\?[^#]*)?(#.*)?$/.exec(input);
  if (!match || match[2].includes('@')) return null;
  const protocol = `${match[1]}:`;
  const authority = match[2].toLowerCase();
  const hostname = authority.replace(/:\d+$/, '');
  const pathname = match[3] || '/';
  const search = match[4] || '';
  const hash = match[5] || '';
  const queryEntries = [];
  if (search.length > 1) {
    for (const part of search.slice(1).split('&')) {
      const separator = part.indexOf('=');
      const rawKey = separator < 0 ? part : part.slice(0, separator);
      const rawValue = separator < 0 ? '' : part.slice(separator + 1);
      try {
        queryEntries.push([
          decodeURIComponent(rawKey.replace(/\+/g, ' ')),
          decodeURIComponent(rawValue.replace(/\+/g, ' ')),
        ]);
      } catch {
        return null;
      }
    }
  }
  return {
    protocol,
    hostname,
    origin: `${protocol}//${authority}`,
    pathname,
    search,
    hash,
    queryEntries,
  };
};

const verifyRecorderIntegrity = (value, { integrityKey, pageId, sequence, channel, signalKeys }) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Recorder signal provenance is missing.');
  }
  const keys = Object.keys(value);
  if (
    keys.length !== signalKeys.length + 1
    || !keys.includes('provenance')
    || signalKeys.some(key => !keys.includes(key))
  ) throw new Error('Recorder signal must use the integrity-bound closed schema.');
  const provenance = value.provenance;
  if (
    !provenance
    || typeof provenance !== 'object'
    || Array.isArray(provenance)
    || Object.keys(provenance).length !== 3
    || provenance.pageSequence !== sequence
    || provenance.channel !== channel
    || typeof provenance.tag !== 'string'
    || !/^[A-Za-z0-9_-]{43}$/.test(provenance.tag)
  ) throw new Error('Recorder signal provenance is invalid.');
  const signal = Object.fromEntries(signalKeys.map(key => [key, value[key]]));
  const expected = createHmac('sha256', integrityKey)
    .update(integrityPayload(pageId, sequence, channel, signal))
    .digest('base64url');
  const actualBytes = Buffer.from(provenance.tag);
  const expectedBytes = Buffer.from(expected);
  if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes)) {
    throw new Error('Recorder signal integrity verification failed.');
  }
  return signal;
};

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

  if (!signal || typeof signal !== 'object' || Array.isArray(signal) || typeof signal.url !== 'string') {
    unknown();
    return result();
  }
  const parseAbsoluteUrlValue = input => {
    if (typeof input !== 'string') return null;
    const match = /^(https?):\/\/([^/?#]+)(\/[^?#]*)?(\?[^#]*)?(#.*)?$/.exec(input);
    if (!match || match[2].includes('@')) return null;
    const protocol = `${match[1]}:`;
    const authority = match[2].toLowerCase();
    const hostname = authority.replace(/:\d+$/, '');
    const pathname = match[3] || '/';
    const search = match[4] || '';
    const hash = match[5] || '';
    const queryEntries = [];
    if (search.length > 1) {
      for (const part of search.slice(1).split('&')) {
        const separator = part.indexOf('=');
        const rawKey = separator < 0 ? part : part.slice(0, separator);
        const rawValue = separator < 0 ? '' : part.slice(separator + 1);
        try {
          queryEntries.push([
            decodeURIComponent(rawKey.replace(/\+/g, ' ')),
            decodeURIComponent(rawValue.replace(/\+/g, ' ')),
          ]);
        } catch {
          return null;
        }
      }
    }
    return { protocol, hostname, origin: `${protocol}//${authority}`, pathname, search, hash, queryEntries };
  };
  const target = parseAbsoluteUrlValue(signal.url);
  if (!target) {
    unknown();
    return result();
  }
  const method = typeof signal.method === 'string' ? signal.method : '';
  if (
    target.origin === stagingOrigin
    && target.pathname === '/api/schools/admins'
    && method === 'PATCH'
  ) {
    add('join-admin-patch');
    return result();
  }
  if (
    target.origin !== 'https://firestore.googleapis.com'
    || typeof runId !== 'string'
    || alias !== 'qa-no-team'
  ) {
    unknown();
    return result();
  }

  const selfUid = `${runId}-no-team`;
  const teamA = `${runId}-team-a`;
  const teamB = `${runId}-team-b`;
  const fixtureLeague = `${runId}-league`;
  const database = `projects/${stagingProjectId}/databases/(default)`;
  const databaseRoot = `${database}/documents`;
  const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const exactKeys = (value, required, optional = []) => {
    if (!isRecord(value)) return false;
    const keys = Object.keys(value);
    return required.every(key => keys.includes(key))
      && keys.every(key => required.includes(key) || optional.includes(key));
  };
  const decodePath = value => {
    try {
      return decodeURIComponent(value);
    } catch {
      return null;
    }
  };
  const splitResourcePath = value => {
    if (typeof value !== 'string' || value.length === 0 || value.startsWith('/') || value.endsWith('/')) return null;
    const segments = value.split('/');
    if (segments.length === 0 || segments.length % 2 !== 0 || segments.some(segment => segment.length === 0)) return null;
    return segments;
  };
  const exactListenQuery = () => {
    if (target.hash !== '') return null;
    const entries = target.queryEntries;
    const keys = entries.map(([key]) => key);
    if (entries.length !== new Set(keys).size) return null;
    const allowed = new Set([
      'database', 'VER', 'RID', 'CVER', 'X-HTTP-Session-Id', 'TYPE', 'SID', 'AID', 'CI', 'TO',
      'zx', 'gsessionid', 'OSID', 'OAID',
    ]);
    if (keys.some(key => !allowed.has(key))) return null;
    const value = key => entries.find(([candidate]) => candidate === key)?.[1];
    const present = key => keys.includes(key);
    const digits = key => !present(key) || /^\d+$/.test(value(key));
    const token = key => !present(key) || /^[A-Za-z0-9_-]{1,512}$/.test(value(key));
    if (
      value('database') !== database
      || value('VER') !== '8'
      || !/^[a-z0-9]{1,128}$/.test(value('zx') ?? '')
      || !digits('AID')
      || !digits('TO')
      || !token('SID')
      || !token('gsessionid')
      || !token('OSID')
      || !token('OAID')
      || (present('OSID') !== present('OAID'))
    ) return null;
    const rid = value('RID');
    if (/^\d+$/.test(rid ?? '')) {
      if (value('TYPE') === 'terminate') {
        return present('SID') && !present('CVER') && !present('AID') && !present('CI')
          && !present('TO') && !present('X-HTTP-Session-Id') ? 'terminate' : null;
      }
      if (present('CVER')) {
        return value('CVER') === '22' && !present('SID') && !present('AID') && !present('CI')
          && !present('TO') && (!present('TYPE') || value('TYPE') === 'init')
          && (!present('X-HTTP-Session-Id') || value('X-HTTP-Session-Id') === 'gsessionid')
          ? 'initial-forward' : null;
      }
      return present('SID') && present('AID') && !present('CI') && !present('TO')
        && !present('TYPE') && !present('X-HTTP-Session-Id') ? 'forward' : null;
    }
    if (rid === 'rpc') {
      return present('SID') && present('AID') && ['0', '1'].includes(value('CI'))
        && value('TYPE') === 'xmlhttp' && !present('CVER') && !present('X-HTTP-Session-Id')
        ? 'back-channel' : null;
    }
    return null;
  };
  const classifyResourcePath = (resourcePath, source = 'document') => {
    const segments = splitResourcePath(resourcePath);
    if (!segments) {
      unknown();
      return;
    }
    const [collection, id, childCollection] = segments;
    if (!id) {
      unknown();
      return;
    }
    if (collection === 'users') {
      if (id === selfUid) {
        if (segments.length === 2) add('self-user-document');
        else if (childCollection === 'teamMemberships') add('self-memberships-document');
        else unknown();
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
  const classifyDocumentName = (input, source = 'document') => {
    if (typeof input !== 'string' || !input.startsWith(`${databaseRoot}/`)) {
      unknown();
      return;
    }
    classifyResourcePath(input.slice(databaseRoot.length + 1), source);
  };
  const exactKeyOrder = value => (
    value === undefined
    || (
      Array.isArray(value)
      && value.length === 1
      && exactKeys(value[0], ['field', 'direction'])
      && exactKeys(value[0].field, ['fieldPath'])
      && value[0].field.fieldPath === '__name__'
      && value[0].direction === 'ASCENDING'
    )
  );
  const exactFrom = value => {
    if (!Array.isArray(value) || value.length !== 1) return null;
    const from = value[0];
    if (!exactKeys(from, ['collectionId'], ['allDescendants']) || typeof from.collectionId !== 'string') return null;
    if (Object.hasOwn(from, 'allDescendants') && from.allDescendants !== false) return null;
    return from.collectionId;
  };
  const canonicalQueryParent = value => {
    if (value === databaseRoot) return { root: true, resource: null };
    if (typeof value !== 'string' || !value.startsWith(`${databaseRoot}/`)) return null;
    const resource = value.slice(databaseRoot.length + 1);
    return splitResourcePath(resource) ? { root: false, resource } : null;
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
    if (!isRecord(structured)) {
      unknown();
      return;
    }
    const parent = canonicalQueryParent(query.parent);
    const collection = exactFrom(structured.from);
    if (!parent || !collection || !exactKeyOrder(structured.orderBy)) {
      unknown();
      return;
    }
    if (collection === 'players') {
      if (!exactKeys(structured, ['from', 'where'], ['orderBy'])) {
        unknown();
        return;
      }
      if (!exactSelfParentFilter(structured.where)) {
        const value = structured.where?.fieldFilter?.value?.stringValue;
        if (
          parent.root
          && typeof value === 'string'
          && exactKeys(structured.where, ['fieldFilter'])
          && exactKeys(structured.where.fieldFilter, ['field', 'op', 'value'])
          && exactKeys(structured.where.fieldFilter.field, ['fieldPath'])
          && structured.where.fieldFilter.field.fieldPath === 'parentId'
          && structured.where.fieldFilter.op === 'EQUAL'
          && exactKeys(structured.where.fieldFilter.value, ['stringValue'])
        ) add('foreign-player-resource');
        else unknown();
        return;
      }
      if (parent.root) add('self-parent-players-query');
      else unknown();
      return;
    }
    if (collection === 'teamMemberships') {
      if (!exactKeys(structured, ['from'], ['orderBy'])) {
        unknown();
        return;
      }
      if (query.parent === `${databaseRoot}/users/${selfUid}`) {
        add('self-memberships-query');
      } else unknown();
      return;
    }
    if (collection === 'plans') {
      if (exactKeys(structured, ['from'], ['orderBy']) && parent.root) add('plans-reference-data');
      else unknown();
      return;
    }
    unknown();
  };
  const classifyTarget = addTarget => {
    if (!exactKeys(addTarget, ['targetId'], ['documents', 'query', 'resumeToken', 'readTime', 'expectedCount'])) {
      unknown();
      return;
    }
    if (!Number.isInteger(addTarget.targetId) || addTarget.targetId <= 0) {
      unknown();
      return;
    }
    if (Object.hasOwn(addTarget, 'resumeToken') && typeof addTarget.resumeToken !== 'string') {
      unknown();
      return;
    }
    if (Object.hasOwn(addTarget, 'readTime') && typeof addTarget.readTime !== 'string') {
      unknown();
      return;
    }
    if (Object.hasOwn(addTarget, 'expectedCount') && !Number.isInteger(addTarget.expectedCount)) {
      unknown();
      return;
    }
    const hasDocuments = isRecord(addTarget.documents);
    const hasQuery = isRecord(addTarget.query);
    if (hasDocuments === hasQuery) {
      unknown();
      return;
    }
    if (hasDocuments) {
      const documents = addTarget.documents;
      if (!exactKeys(documents, ['documents']) || !Array.isArray(documents.documents) || documents.documents.length !== 1) {
        unknown();
      } else classifyDocumentName(documents.documents[0]);
    }
    if (hasQuery) classifyQuery(addTarget.query);
  };
  const validLabels = value => (
    exactKeys(value, ['goog-listen-tags'])
    && ['existence-filter-mismatch', 'existence-filter-mismatch-bloom', 'limbo-document']
      .includes(value['goog-listen-tags'])
  );
  const classifyListenMessage = message => {
    if (!isRecord(message) || message.database !== database) {
      unknown();
      return;
    }
    const hasAddTarget = Object.hasOwn(message, 'addTarget');
    const hasRemoveTarget = Object.hasOwn(message, 'removeTarget');
    if (hasAddTarget === hasRemoveTarget) {
      unknown();
      return;
    }
    if (hasAddTarget) {
      if (!exactKeys(message, ['database', 'addTarget'], ['labels'])) unknown();
      if (Object.hasOwn(message, 'labels') && !validLabels(message.labels)) unknown();
      classifyTarget(message.addTarget);
      return;
    }
    if (!exactKeys(message, ['database', 'removeTarget']) || !Number.isInteger(message.removeTarget) || message.removeTarget <= 0) {
      unknown();
      return;
    }
    add('firestore-transport-control');
  };
  const parseListenBody = body => {
    if (typeof body !== 'string' || body.length === 0) return null;
    const entries = [];
    for (const part of body.split('&')) {
      const separator = part.indexOf('=');
      if (separator < 0) return null;
      try {
        entries.push([
          decodeURIComponent(part.slice(0, separator).replace(/\+/g, ' ')),
          decodeURIComponent(part.slice(separator + 1).replace(/\+/g, ' ')),
        ]);
      } catch {
        return null;
      }
    }
    if (entries.length !== new Set(entries.map(([key]) => key)).size) return null;
    const keys = entries.map(([key]) => key);
    const get = key => entries.find(([candidate]) => candidate === key)?.[1] ?? null;
    if (!keys.includes('count') || !keys.includes('ofs') || !/^\d+$/.test(get('ofs') ?? '')) return null;
    const countText = get('count');
    if (!/^\d+$/.test(countText ?? '')) return null;
    const count = Number(countText);
    const hasHeaders = keys.includes('headers');
    const expectedKeys = [
      'count', 'ofs', ...(hasHeaders ? ['headers'] : []),
      ...Array.from({ length: count }, (_, index) => `req${index}___data__`),
    ];
    if (keys.length !== expectedKeys.length || expectedKeys.some(key => !keys.includes(key))) return null;
    if (hasHeaders) {
      const headerBlock = get('headers');
      if (typeof headerBlock !== 'string' || headerBlock.length === 0 || headerBlock.length > 32_768
        || !headerBlock.endsWith('\r\n')) return null;
      const allowedHeaders = new Set([
        'authorization', 'content-type', 'google-cloud-resource-prefix', 'x-firebase-appcheck',
        'x-firebase-gmpid', 'x-goog-api-client', 'x-goog-request-params', 'x-goog-user-project',
      ]);
      const headerNames = [];
      for (const line of headerBlock.slice(0, -2).split('\r\n')) {
        const separator = line.indexOf(':');
        const name = line.slice(0, separator).toLowerCase();
        const headerValue = line.slice(separator + 1);
        if (separator <= 0 || !allowedHeaders.has(name) || headerValue.length === 0) return null;
        headerNames.push(name);
      }
      if (headerNames.length !== new Set(headerNames).size) return null;
    }
    if (count === 0) return { control: true, hasHeaders, messages: [] };
    const messages = [];
    for (let index = 0; index < count; index += 1) {
      try {
        const value = JSON.parse(get(`req${index}___data__`));
        if (!isRecord(value)) return null;
        messages.push(value);
      } catch {
        return null;
      }
    }
    return { control: false, hasHeaders, messages };
  };

  const path = decodePath(target.pathname);
  if (path === null) {
    unknown();
    return result();
  }
  const documentMarker = `/v1/${databaseRoot}/`;
  if (path.startsWith(documentMarker) && !path.endsWith(':runQuery')) {
    if (method !== 'GET' || target.search !== '' || target.hash !== ''
      || (signal.body !== undefined && signal.body !== '')) unknown();
    else classifyDocumentName(`${databaseRoot}/${path.slice(documentMarker.length)}`);
    return result();
  }
  const runQueryPrefix = `/v1/${databaseRoot}`;
  if (path === `${runQueryPrefix}:runQuery` || (path.startsWith(`${runQueryPrefix}/`) && path.endsWith(':runQuery'))) {
    if (method !== 'POST' || target.search !== '' || target.hash !== ''
      || typeof signal.body !== 'string' || signal.body.length === 0) {
      unknown();
      return result();
    }
    const parentSuffix = path.slice(runQueryPrefix.length, -':runQuery'.length).replace(/^\//, '');
    const parent = parentSuffix.length === 0 ? databaseRoot : `${databaseRoot}/${parentSuffix}`;
    if (parentSuffix.length > 0 && !splitResourcePath(parentSuffix)) {
      unknown();
      return result();
    }
    try {
      const body = JSON.parse(signal.body);
      if (!exactKeys(body, ['structuredQuery'])) unknown();
      else classifyQuery({ parent, structuredQuery: body.structuredQuery });
    } catch {
      unknown();
    }
    return result();
  }
  if (path !== '/google.firestore.v1.Firestore/Listen/channel') {
    unknown();
    return result();
  }
  const listenQueryKind = exactListenQuery();
  if (!listenQueryKind) {
    unknown();
    return result();
  }
  if (method === 'GET' && ['back-channel', 'terminate'].includes(listenQueryKind)
    && (signal.body === undefined || signal.body === '')) {
    add('firestore-transport-control');
    return result();
  }
  if (method === 'POST' && listenQueryKind === 'terminate'
    && (signal.body === undefined || signal.body === '')) {
    add('firestore-transport-control');
    return result();
  }
  if (method !== 'POST') {
    unknown();
    return result();
  }
  const parsed = parseListenBody(signal.body);
  if (!parsed) unknown();
  else if (!['initial-forward', 'forward'].includes(listenQueryKind)) unknown();
  else if (parsed.hasHeaders && listenQueryKind !== 'initial-forward') unknown();
  else if (parsed.control) add('firestore-transport-control');
  else parsed.messages.forEach(classifyListenMessage);
  return result();
};

export function classifyFixtureResourceScopes(signal, { runId, alias } = {}) {
  assertRunId(runId);
  if (alias !== 'qa-no-team') throw new Error('Fixture resource scoping currently requires qa-no-team.');
  return classifyFixtureResourceScopesValue(signal, runId, alias, STAGING_ORIGIN, STAGING_PROJECT_ID);
}

const installRecorderSource = (fixtureRunId, integrityKeyBase64) => String.raw`async (page) => {
  // phase9:install
  const fixtureRunId = ${JSON.stringify(fixtureRunId ?? null)};
  const classifyFixtureResourceScopesValue = ${classifyFixtureResourceScopesValue.toString()};
  const parseAbsoluteUrlValue = ${parseAbsoluteUrlValue.toString()};
  const integrityPayload = ${integrityPayload.toString()};
  const hmacSha256Base64UrlValue = ${hmacSha256Base64UrlValue.toString()};
  const integrityKeyBase64 = ${JSON.stringify(integrityKeyBase64)};
  const seal = (pageId, pageSequence, channel, signal) => ({
    ...signal,
    provenance: {
      pageSequence,
      channel,
      tag: hmacSha256Base64UrlValue(
        integrityKeyBase64,
        integrityPayload(pageId, pageSequence, channel, signal),
      ),
    },
  });
  const nonProtectedApiPaths = new Set(${JSON.stringify([
    '/api/auth/session', '/api/contact', '/api/email/reset-password', '/api/health',
    '/api/newsletter/subscribe', '/api/newsletter/unsubscribe',
  ])});
  const classifyTargetKind = (value, resourceType = 'fetch') => {
    if (resourceType === 'document') return 'non-protected';
    const target = parseAbsoluteUrlValue(value);
    if (!target || !['http:', 'https:'].includes(target.protocol)) return 'non-protected';
    if (target.hostname === 'firestore.googleapis.com') {
      if (target.pathname === '/google.firestore.v1.Firestore/Listen/channel') return 'firestore-listen';
      if (/^\/v1\/projects\/[^/]+\/databases\/[^/]+\/documents(?:\/[^:]*)?:runQuery$/.test(target.pathname)) return 'firestore-run-query';
      if (target.pathname === '/google.firestore.v1.Firestore/RunQuery/channel') return 'firestore-run-query';
      if (/^\/v1\/projects\/[^/]+\/databases\/[^/]+\/documents\//.test(target.pathname)) return 'firestore-document';
      return 'firestore-protected';
    }
    if (target.origin !== ${JSON.stringify(STAGING_ORIGIN)} || !target.pathname.startsWith('/api/')) return 'non-protected';
    if (nonProtectedApiPaths.has(target.pathname)) return 'non-protected';
    if (target.pathname === '/api/schools/admins') return 'staging-join-admin-api';
    return 'staging-protected-api';
  };
  const cleanPath = value => {
    if (typeof value !== 'string') return 'invalid:';
    if (!fixtureRunId) return value;
    return value.split('/').map(segment => segment.startsWith(fixtureRunId) ? ':fixture-resource' : segment).join('/');
  };
  const cleanUrl = value => {
    if (value === 'about:blank') return value;
    if (typeof value === 'string' && /^(?:data|blob|javascript|file):/.test(value)) return value.slice(0, value.indexOf(':') + 1);
    const parsed = parseAbsoluteUrlValue(value);
    if (!parsed) return 'invalid:';
    if (!['http:', 'https:'].includes(parsed.protocol)) return 'opaque:';
    return parsed.origin + cleanPath(parsed.pathname);
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
      const targetKind = classifyTargetKind(request.url(), request.resourceType());
      if (targetKind === 'non-protected') return;
      const signal = {
        targetKind,
        method: request.method(),
        resourceType: request.resourceType(),
        initiatingFrameUrl,
        ...classifyFixtureResourceScopesValue({
          url: request.url(),
          method: request.method(),
          body: request.postData() || '',
        }, fixtureRunId, 'qa-no-team', ${JSON.stringify(STAGING_ORIGIN)}, ${JSON.stringify(STAGING_PROJECT_ID)}),
      };
      boundedPush(state, 'requests', seal(state.pageId, state.sequence, 'request', signal));
      if (targetKind === 'firestore-listen') {
        boundedPush(state, 'listeners', seal(state.pageId, state.sequence, 'listener', signal));
      }
    });
    page.on('response', response => {
      const targetKind = classifyTargetKind(response.url());
      if (targetKind === 'non-protected') return;
      boundedPush(state, 'responses', seal(state.pageId, state.sequence, 'response', {
        targetKind,
        status: response.status(),
      }));
    });
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
  const requests = await Promise.all(state.requests.slice(mark.requests));
  const listeners = await Promise.all(state.listeners.slice(mark.listeners));
  const responses = await Promise.all(state.responses.slice(mark.responses));
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
    protectedRequests: requests,
    protectedListenerStarts: listeners,
    teamSelectionSignals: state.selections.slice(mark.selections),
    relevantHttpResults: responses,
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
  if (typeof signal.url !== 'string') {
    return typeof signal.targetKind === 'string' && RESOURCE_TARGET_KINDS.includes(signal.targetKind);
  }
  let target;
  try {
    target = new URL(signal.url);
  } catch {
    return false;
  }
  if (!['http:', 'https:'].includes(target.protocol)) return false;
  if (target.hostname === 'firestore.googleapis.com') {
    return true;
  }
  if (target.origin !== STAGING_ORIGIN) return false;
  if (!target.pathname.startsWith('/api/')) return false;
  return !NON_PROTECTED_API_PATHS.has(target.pathname);
}

const count = value => Array.isArray(value) ? value.length : Number.isInteger(value) && value >= 0 ? value : 0;

const sanitizeResourceSignal = (item, fixtureRunId, integrity) => {
  const parsed = verifyRecorderIntegrity(item, {
    ...integrity,
    signalKeys: [
      'targetKind', 'method', 'resourceType', 'initiatingFrameUrl', 'scopeEvidence', 'resourceScopes',
    ],
  });
  const signal = {
    targetKind: parsed.targetKind,
    method: parsed.method,
    resourceType: parsed.resourceType,
    initiatingFrameUrl: cleanUrl(parsed.initiatingFrameUrl, fixtureRunId),
    scopeEvidence: Array.isArray(parsed.scopeEvidence) ? [...parsed.scopeEvidence] : parsed.scopeEvidence,
    resourceScopes: Array.isArray(parsed.resourceScopes) ? [...parsed.resourceScopes] : parsed.resourceScopes,
  };
  validateResourceSignal(signal, 'Recorder resource signal');
  return signal;
};

const sanitizeHttpResult = (item, integrity) => {
  const parsed = verifyRecorderIntegrity(item, {
    ...integrity,
    signalKeys: ['targetKind', 'status'],
  });
  if (!RESOURCE_TARGET_KINDS.includes(parsed.targetKind) || !Number.isInteger(parsed.status) || parsed.status < 0) {
    throw new Error('Recorder HTTP evidence must use the closed response schema.');
  }
  return { targetKind: parsed.targetKind, status: parsed.status };
};

const sanitizeWindow = (value, { fixtureRunId, integrityKey, mark } = {}) => {
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
    ? value.protectedRequests.map(item => sanitizeResourceSignal(item, fixtureRunId, {
        integrityKey, pageId: mark?.pageId, sequence: mark?.sequence, channel: 'request',
      })) : [];
  const http = Array.isArray(value.relevantHttpResults) ? value.relevantHttpResults.map(item => sanitizeHttpResult(item, {
    integrityKey, pageId: mark?.pageId, sequence: mark?.sequence, channel: 'response',
  })) : [];
  const listeners = Array.isArray(value.protectedListenerStarts)
    ? value.protectedListenerStarts.map(item => sanitizeResourceSignal(item, fixtureRunId, {
        integrityKey, pageId: mark?.pageId, sequence: mark?.sequence, channel: 'listener',
      })) : [];
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
  const sanitized = {
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
  assertNoFixtureIdentifierLeak(sanitized, 'Client action window');
  return sanitized;
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
  const integrityKey = randomBytes(32);
  const integrityKeyBase64 = integrityKey.toString('base64');
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
    await executeRunCode(session, installRecorderSource(fixtureRunId, integrityKeyBase64));
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
      const sample = sanitizeWindow(result, { fixtureRunId, integrityKey, mark });
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
