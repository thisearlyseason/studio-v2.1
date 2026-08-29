import { types as utilTypes } from 'node:util';

import { assertRunId } from '../../qa-fixtures/manifest.mjs';

const deepFreeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
};

export const STAGING_PROJECT_ID = 'the-squad-v2-staging';
export const STAGING_ORIGIN = 'https://studio--the-squad-v2-staging.us-east4.hosted.app';
export const SESSION_COOKIE_NAME = '__session';
export const FIXTURE_MANIFEST_VERSION = 3;
export const FIXTURE_RESOURCE_COUNTS = deepFreeze({ aliases: 20, teams: 3, auth: 20, firestore: 82, expectedAbsent: 1 });
export const PENDING_UNAVAILABLE_SENTINEL = 'The email or password is incorrect, or this account is unavailable.';
export const NO_TEAM_RESOURCE_POLICY = 'no-team-tenant-isolation';
export const RESOURCE_SCOPES = deepFreeze([
  'self-account',
  'join-admin-lookup',
  'tenant-team-a',
  'tenant-team-b',
  'tenant-league',
  'tenant-other',
  'foreign-account',
  'non-tenant',
  'transport-control',
  'unscoped',
]);

export const RESOURCE_SCOPE_EVIDENCE = deepFreeze({
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
});

export const RESOURCE_TARGET_KINDS = deepFreeze([
  'firestore-document',
  'firestore-run-query',
  'firestore-listen',
  'firestore-protected',
  'staging-join-admin-api',
  'staging-protected-api',
]);

const FIXTURE_ALIASES = deepFreeze([
  'qa-coach-owner-a', 'qa-coach-owner-b', 'qa-team-assistant', 'qa-team-member', 'qa-multi-org',
  'qa-fake-superadmin', 'qa-unverified', 'qa-suspended', 'qa-removed-member', 'qa-parent-a',
  'qa-parent-b', 'qa-adult-player-a', 'qa-adult-player-b', 'qa-youth-active', 'qa-league-creator',
  'qa-school-admin', 'qa-superadmin', 'qa-pending-delete', 'qa-missing-profile', 'qa-no-team',
]);

const FIXTURE_UID_SUFFIXES = deepFreeze([
  'adult-player-a', 'adult-player-b', 'coach-owner-a', 'coach-owner-b', 'fake-superadmin',
  'league-creator', 'missing-profile', 'multi-org', 'no-team', 'parent-a', 'parent-b',
  'pending-delete', 'removed-member', 'school-admin', 'superadmin', 'suspended', 'team-assistant',
  'team-member', 'unverified', 'youth-active',
]);

const FIXTURE_SORTED_ALIASES = deepFreeze([...FIXTURE_ALIASES].sort());

export const LIFECYCLE_STAGES = deepFreeze({
  preflight: ['preflight'],
  seed: ['seeded'],
  inspect: ['seeded-present', 'cleaned-absent'],
  transition: ['pending-deletion'],
  cleanup: ['cleaned'],
  probe: ['independently-absent'],
  'browser-sessions': ['browsers-closed'],
  'credential-removal': ['credential-absent'],
  'workspace-removal': ['workspace-absent'],
});

export const VIEWPORTS = deepFreeze({
  mobile: { width: 390, height: 844 },
  desktop: { width: 1440, height: 900 },
});

export const ROUTE_SCENARIOS = deepFreeze({
  '/admin': { visibleSentinels: ['Account Lookup'] },
  '/club': { visibleSentinels: ['School Hub', 'Club Hub'] },
  '/competition': { visibleSentinels: ['Program League Hub', 'Competition Hub'] },
  '/dashboard/billing': { visibleSentinels: ['Manage Your Plan'] },
  '/coaches-corner': { visibleSentinels: ['Coaches Corner'] },
  '/family': { visibleSentinels: ['Family Overview'] },
});

export const LANDING_SCENARIOS = deepFreeze({
  '/dashboard': ['Dashboard'],
  '/onboarding': ['Complete your profile'],
  '/teams/join': ['Join & Invite'],
  '/login': ['Sign In'],
});
export const LANDING_SENTINELS = deepFreeze([...new Set([
  ...Object.values(LANDING_SCENARIOS).flat(),
  ...Object.values(ROUTE_SCENARIOS).flatMap(value => value.visibleSentinels),
])]);
export const PUBLIC_VISIBLE_SENTINELS = deepFreeze([
  ...LANDING_SENTINELS,
  PENDING_UNAVAILABLE_SENTINEL,
]);
export const PUBLIC_RENDER_PATHS = deepFreeze([
  ...Object.keys(LANDING_SCENARIOS),
  ...Object.keys(ROUTE_SCENARIOS),
  'offline:',
]);
export const PROTECTED_PAGE_HEADINGS = deepFreeze([...new Set([
  'Dashboard',
  ...Object.values(ROUTE_SCENARIOS).flatMap(value => value.visibleSentinels),
])]);

export const ISOLATION_SCENARIOS = deepFreeze({
  team: {
    endpoint: '/api/teams/chat',
    parameter: 'teamId',
    ownStatus: 200,
    oppositeStatus: 403,
  },
  directFirestore: [
    { label: 'own-team', status: 200 },
    { label: 'opposite-team', status: 403 },
    { label: 'own-player', status: 200 },
    { label: 'opposite-player', status: 403 },
  ],
});

const ISOLATION_ALIAS_SHAPES = deepFreeze({
  'qa-parent-a': { side: 'a', ownPlayer: 'player-youth-active' },
  'qa-parent-b': { side: 'b', ownPlayer: 'youth-player-b' },
  'qa-adult-player-a': { side: 'a', ownPlayer: 'player-adult-a' },
  'qa-adult-player-b': { side: 'b', ownPlayer: 'player-adult-b' },
  'qa-youth-active': { side: 'a', ownPlayer: 'player-youth-active' },
});

export function buildIsolationExpectation({ runId, alias } = {}) {
  assertRunId(runId);
  const shape = ISOLATION_ALIAS_SHAPES[alias];
  if (!shape) throw new Error('Isolation expectation requires a supported isolation alias.');
  const oppositeSide = shape.side === 'a' ? 'b' : 'a';
  const oppositePlayer = shape.side === 'a' ? 'youth-player-b' : 'player-youth-active';
  const ownTeamId = `${runId}-team-${shape.side}`;
  const oppositeTeamId = `${runId}-team-${oppositeSide}`;
  const apiTarget = teamId => `${ISOLATION_SCENARIOS.team.endpoint}?${ISOLATION_SCENARIOS.team.parameter}=${encodeURIComponent(teamId)}`;
  return deepFreeze({
    runId,
    alias,
    endpoint: ISOLATION_SCENARIOS.team.endpoint,
    parameter: ISOLATION_SCENARIOS.team.parameter,
    ownTeamId,
    oppositeTeamId,
    sameOriginApi: [
      {
        label: 'own-team-api',
        endpoint: ISOLATION_SCENARIOS.team.endpoint,
        parameter: ISOLATION_SCENARIOS.team.parameter,
        teamId: ownTeamId,
        target: apiTarget(ownTeamId),
        status: 200,
      },
      {
        label: 'opposite-team-api',
        endpoint: ISOLATION_SCENARIOS.team.endpoint,
        parameter: ISOLATION_SCENARIOS.team.parameter,
        teamId: oppositeTeamId,
        target: apiTarget(oppositeTeamId),
        status: 403,
      },
    ],
    directFirestore: [
      { label: 'own-team', path: `teams/${ownTeamId}`, status: 200 },
      { label: 'opposite-team', path: `teams/${oppositeTeamId}`, status: 403 },
      { label: 'own-player', path: `players/${runId}-${shape.ownPlayer}`, status: 200 },
      { label: 'opposite-player', path: `players/${runId}-${oppositePlayer}`, status: 403 },
    ],
  });
}

export const REQUIRED_LOGOUT_STAGES = deepFreeze([
  'logout-tab',
  'stale-tab-reload',
  'stale-tab-back',
  'stale-tab-second-reload',
]);

export const SCENARIO_GROUP_COUNTS = deepFreeze({
  'admission-route': 18,
  isolation: 10,
  logout: 10,
  'pending-deletion': 6,
});

export const SCENARIO_TOTALS = deepFreeze({ total: 44, pass: 44, fail: 0, inconclusive: 0 });

export const REQUIRED_LEDGER_COLUMNS = deepFreeze([
  'contextId',
  'group',
  'alias',
  'viewport',
  'startState',
  'startUrl',
  'action',
  'expectedResult',
  'finalUrl',
  'visibleState',
  'sessionPresent',
  'protectedRequests',
  'protectedListenerStarts',
  'relevantHttpDataResult',
  'pageErrors',
  'appConsoleErrors',
  'unexpectedRequestFailures',
  'overflow',
  'result',
]);

const MAX_SNAPSHOT_NODES = 100_000;
const MAX_SNAPSHOT_DEPTH = 128;
const MAX_SNAPSHOT_ARRAY_LENGTH = 100_000;

// Node's structuredClone invokes accessors and drops hidden/symbol keys. This
// descriptor snapshot preserves the closed-schema evidence needed to reject
// those shapes while rejecting Proxies before any caller trap can run.
const snapshotClosedDataGraph = (value, name) => {
  const copies = new WeakMap();
  const active = new WeakSet();
  let nodes = 0;

  const reserveNodes = count => {
    if (!Number.isSafeInteger(count) || count < 0 || count > MAX_SNAPSHOT_NODES - nodes) {
      throw new Error('oversized snapshot graph');
    }
    nodes += count;
  };

  const capture = (current, depth) => {
    if (current === null || ['undefined', 'boolean', 'string', 'number', 'bigint'].includes(typeof current)) {
      return current;
    }
    if (typeof current !== 'object') throw new Error('unsupported snapshot value');
    if (utilTypes.isProxy(current)) throw new Error('proxy snapshot value');
    if (depth > MAX_SNAPSHOT_DEPTH) throw new Error('oversized snapshot graph');
    if (active.has(current)) throw new Error('cyclic snapshot graph');
    if (copies.has(current)) return copies.get(current);

    const array = Array.isArray(current);
    const prototype = Object.getPrototypeOf(current);
    if (
      (array && prototype !== Array.prototype)
      || (!array && prototype !== Object.prototype && prototype !== null)
    ) throw new Error('unsupported snapshot prototype');

    let length = 0;
    if (array) {
      const lengthDescriptor = Object.getOwnPropertyDescriptor(current, 'length');
      if (
        !lengthDescriptor
        || !Object.hasOwn(lengthDescriptor, 'value')
        || !Number.isSafeInteger(lengthDescriptor.value)
        || lengthDescriptor.value < 0
        || lengthDescriptor.value > MAX_SNAPSHOT_ARRAY_LENGTH
        || lengthDescriptor.enumerable !== false
        || lengthDescriptor.configurable !== false
      ) throw new Error('invalid array snapshot length');
      length = lengthDescriptor.value;
    }

    const descriptors = Object.getOwnPropertyDescriptors(current);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.some(key => typeof key !== 'string')) throw new Error('symbol snapshot key');
    if (array) {
      if (keys.length !== length + 1) throw new Error('non-dense array snapshot');
      for (const key of keys) {
        if (key === 'length') continue;
        const index = Number(key);
        if (!Number.isInteger(index) || index < 0 || index >= length || String(index) !== key) {
          throw new Error('non-index array snapshot key');
        }
      }
      for (let index = 0; index < length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (
          !descriptor
          || !Object.hasOwn(descriptor, 'value')
          || descriptor.enumerable !== true
        ) throw new Error('non-dense array snapshot');
      }
    } else {
      for (const key of keys) {
        const descriptor = descriptors[key];
        if (
          !descriptor
          || !Object.hasOwn(descriptor, 'value')
          || descriptor.enumerable !== true
        ) throw new Error('hidden or accessor snapshot value');
      }
    }

    reserveNodes(1 + (array ? length : keys.length));
    const copy = array ? new Array(length) : Object.create(prototype);
    copies.set(current, copy);
    active.add(current);

    const copyValue = (key, descriptor) => {
      const child = capture(descriptor.value, depth + 1);
      Object.defineProperty(copy, key, {
        value: child,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    };
    if (array) {
      for (let index = 0; index < length; index += 1) {
        copyValue(String(index), descriptors[String(index)]);
      }
    } else {
      for (const key of keys) copyValue(key, descriptors[key]);
    }

    active.delete(current);
    return copy;
  };

  try {
    return capture(value, 0);
  } catch {
    throw new Error(`${name} must be a cloneable closed data graph.`);
  }
};

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);

const requireRecord = (value, name) => {
  if (!isRecord(value)) throw new Error(`${name} must be an object.`);
  return value;
};

const requireClosedOwnDataObject = (value, {
  name, schemaName, requiredKeys, optionalKeys = [],
}) => {
  const record = requireRecord(value, name);
  const prototype = Object.getPrototypeOf(record);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${name} must be a plain ${schemaName} object.`);
  }
  const ownKeys = Reflect.ownKeys(record);
  if (ownKeys.some(key => typeof key !== 'string')) {
    throw new Error(`${name} must use the closed ${schemaName} schema.`);
  }
  const permitted = new Set([...requiredKeys, ...optionalKeys]);
  const unknown = ownKeys.find(key => !permitted.has(key));
  if (unknown !== undefined) throw new Error(`${name} must use the closed ${schemaName} schema.`);
  const missing = requiredKeys.find(key => !Object.hasOwn(record, key));
  if (missing !== undefined) {
    throw new Error(`${missing} is required by the closed ${schemaName} schema.`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(record);
  if (ownKeys.some(key => {
    const descriptor = descriptors[key];
    return !descriptor || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true;
  })) throw new Error(`${name} must use the closed ${schemaName} schema.`);
  return record;
};

const requireClosedArray = (value, name) => {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    throw new Error(`${name} must be a closed plain array.`);
  }
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
  if (
    !lengthDescriptor
    || !Object.hasOwn(lengthDescriptor, 'value')
    || !Number.isSafeInteger(lengthDescriptor.value)
    || lengthDescriptor.value < 0
    || lengthDescriptor.value > MAX_SNAPSHOT_ARRAY_LENGTH
    || lengthDescriptor.enumerable !== false
    || lengthDescriptor.configurable !== false
  ) throw new Error(`${name} must be a closed plain array.`);
  const length = lengthDescriptor.value;
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.length !== length + 1) throw new Error(`${name} must be a closed plain array.`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of ownKeys) {
    if (key === 'length') continue;
    if (typeof key !== 'string') throw new Error(`${name} must be a closed plain array.`);
    const index = Number(key);
    if (!Number.isInteger(index) || index < 0 || index >= length || String(index) !== key) {
      throw new Error(`${name} must be a closed plain array.`);
    }
    const descriptor = descriptors[key];
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) {
      throw new Error(`${name} must be a closed plain array.`);
    }
  }
  for (let index = 0; index < length; index += 1) {
    if (!Object.hasOwn(descriptors, String(index))) throw new Error(`${name} must be a closed plain array.`);
  }
  return value;
};

const requireBoolean = (value, name) => {
  if (typeof value !== 'boolean') throw new Error(`${name} must be an explicit boolean.`);
  return value;
};

const requireCount = (value, name) => {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer.`);
  return value;
};

const requireString = (value, name) => {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${name} must be a non-empty string.`);
  return value;
};

const requireExact = (actual, expected, name) => {
  if (actual !== expected) throw new Error(`${name} must equal the exact expected value.`);
};

const requireExactArray = (value, expected, name) => {
  const array = requireClosedArray(value, name);
  if (array.length !== expected.length) {
    throw new Error(`${name} must match the complete canonical ordered values.`);
  }
  for (let index = 0; index < array.length; index += 1) {
    if (array[index] !== expected[index]) {
      throw new Error(`${name} must match the complete canonical ordered values.`);
    }
  }
};

const requireExactKeys = (value, expected, name) => {
  const actualKeys = Object.keys(value).sort();
  const expectedKeys = [...expected].sort();
  if (actualKeys.length !== expectedKeys.length || actualKeys.some((key, index) => key !== expectedKeys[index])) {
    throw new Error(`${name} must contain exactly its real producer fields.`);
  }
};

const requireLifecycleStage = (kind, stage) => {
  const supported = LIFECYCLE_STAGES[kind];
  if (!supported || !supported.includes(stage)) throw new Error(`Unsupported lifecycle stage for ${kind}.`);
};

const parseResult = value => {
  if (typeof value !== 'string') return requireRecord(value, 'Lifecycle result');
  try {
    return requireRecord(JSON.parse(value), 'Lifecycle result');
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('Lifecycle result must be valid JSON.');
    throw error;
  }
};

const requireOk = value => {
  if (value.ok !== true) throw new Error('Lifecycle result must report ok=true.');
};

const requireZeroSummary = (value, name) => {
  requireRecord(value, name);
  requireExactKeys(value, ['count', 'aliases'], name);
  requireCount(value.count, `${name}.count`);
  if (value.count !== 0) throw new Error(`${name} must report zero retained resources or failures.`);
  if (requireClosedArray(value.aliases, `${name} aliases`).length !== 0) {
    throw new Error(`${name} aliases must be empty.`);
  }
};

const requireCanonicalStagingLocation = (value, finalPath, name) => {
  requireString(value, `${name} finalUrl`);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must contain an absolute canonical finalUrl.`);
  }
  if (parsed.origin !== STAGING_ORIGIN || parsed.username || parsed.password) {
    throw new Error(`${name} finalUrl must use the canonical staging origin.`);
  }
  if (parsed.search || parsed.hash || value !== `${STAGING_ORIGIN}${parsed.pathname}`) {
    throw new Error(`${name} must contain a canonical finalUrl without query or hash.`);
  }
  if (parsed.pathname !== finalPath) {
    throw new Error(`${name} finalUrl must match finalPath.`);
  }
  return parsed.pathname;
};

const requireCanonicalStagingAttribution = (value, name) => {
  requireString(value, `${name} initiatingFrameUrl`);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must have canonical staging attribution.`);
  }
  if (
    parsed.origin !== STAGING_ORIGIN
    || parsed.username
    || parsed.password
    || parsed.search
    || parsed.hash
    || value !== `${STAGING_ORIGIN}${parsed.pathname}`
  ) throw new Error(`${name} must have canonical staging attribution.`);
  return parsed.pathname;
};

const isExactPathOrSubtree = (pathname, root) => pathname === root || pathname.startsWith(`${root}/`);
const FIXTURE_IDENTIFIER_PATTERN = /qa-phase7-\d{8}T\d{6}Z-[a-z0-9]{12,32}(?:-[A-Za-z0-9][A-Za-z0-9_-]*)?/;
const MAX_FIXTURE_SCAN_BYTES = 1_048_576;
const MAX_PERCENT_DECODE_ROUNDS = 4;
const CREDENTIAL_PATTERNS = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/,
  /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/,
  /\b(?:api[-_ ]?key|password|passwd|secret|access[-_ ]?token|refresh[-_ ]?token|authorization|cookie)\s*[:=]\s*["']?[A-Za-z0-9._~+/=-]{8,}/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];

const inspectPercentLayer = value => {
  let encoded = false;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== '%') continue;
    if (/^[0-9a-f]{2}$/i.test(value.slice(index + 1, index + 3))) {
      encoded = true;
      index += 2;
      continue;
    }
    const next = value[index + 1];
    if (next === undefined || /\s/.test(next)) continue;
    return { encoded, malformed: true };
  }
  return { encoded, malformed: false };
};

const decodePercentLayer = value => {
  try {
    return value.replace(/(?:%[0-9a-f]{2})+/gi, encoded => decodeURIComponent(encoded));
  } catch {
    return null;
  }
};

const inspectEvidenceString = input => {
  if (typeof input !== 'string') return null;
  let value = input;
  for (let round = 0; ; round += 1) {
    if (FIXTURE_IDENTIFIER_PATTERN.test(value)) return 'fixture';
    if (CREDENTIAL_PATTERNS.some(pattern => pattern.test(value))) return 'credential';
    const layer = inspectPercentLayer(value);
    if (layer.malformed) return 'percent';
    if (!layer.encoded) return null;
    if (round === MAX_PERCENT_DECODE_ROUNDS) return 'percent-depth';
    const decoded = decodePercentLayer(value);
    if (decoded === null || decoded === value) return 'percent';
    value = decoded;
  }
};

const sanitizeEvidenceName = (value, fallback) => (
  typeof value === 'string'
  && value.length <= 128
  && inspectEvidenceString(value) === null
    ? value
    : fallback
);

const assertNoFixtureIdentifierLeakSnapshot = (value, name) => {
  const seen = new WeakSet();
  let scannedBytes = 0;
  const visit = current => {
    if (typeof current === 'string') {
      scannedBytes += current.length;
      if (scannedBytes > MAX_FIXTURE_SCAN_BYTES) {
        throw new Error(`${name} exceeds the bounded fixture identifier scan.`);
      }
      const violation = inspectEvidenceString(current);
      if (violation === 'fixture') throw new Error(`${name} contains a raw fixture identifier.`);
      if (violation === 'credential') throw new Error(`${name} contains credential-shaped evidence.`);
      if (violation === 'percent') throw new Error(`${name} contains a malformed percent-encoding layer.`);
      if (violation === 'percent-depth') throw new Error(`${name} exceeds the bounded percent-decoding depth.`);
      return;
    }
    if (!current || typeof current !== 'object') return;
    if (seen.has(current)) throw new Error(`${name} must be serializable before fixture identifier validation.`);
    seen.add(current);
    if (Array.isArray(current)) {
      for (const key of Reflect.ownKeys(current)) {
        if (key === 'length') continue;
        visit(key);
        visit(current[key]);
      }
    } else {
      for (const key of Reflect.ownKeys(current)) {
        visit(key);
        visit(current[key]);
      }
    }
    seen.delete(current);
  };
  visit(value);
  return value;
};

export function assertNoFixtureIdentifierLeak(value, name = 'Evidence') {
  const snapshot = snapshotClosedDataGraph(value, 'Evidence input');
  return assertNoFixtureIdentifierLeakSnapshot(snapshot, sanitizeEvidenceName(name, 'Evidence'));
}

const deriveResourceScopes = evidence => RESOURCE_SCOPES.filter(scope => (
  evidence.some(item => RESOURCE_SCOPE_EVIDENCE[item] === scope)
));

const requireClosedResourceSignal = (value, name) => {
  const requiredKeys = [
    'targetKind', 'method', 'resourceType', 'initiatingFrameUrl', 'scopeEvidence', 'resourceScopes',
  ];
  const optionalKeys = ['status'];
  const signal = requireClosedOwnDataObject(value, {
    name,
    schemaName: 'resource evidence',
    requiredKeys,
    optionalKeys,
  });
  if (!RESOURCE_TARGET_KINDS.includes(signal.targetKind)) {
    throw new Error(`${name} target kind is unsupported.`);
  }
  requireString(signal.method, `${name} method`);
  requireString(signal.resourceType, `${name} resourceType`);
  requireString(signal.initiatingFrameUrl, `${name} initiatingFrameUrl`);
  if (!['GET', 'POST', 'PATCH', 'PUT', 'DELETE'].includes(signal.method)) {
    throw new Error(`${name} method is outside the closed recorder schema.`);
  }
  if (!['fetch', 'xhr', 'other'].includes(signal.resourceType)) {
    throw new Error(`${name} resource type is outside the closed recorder schema.`);
  }
  if (Object.hasOwn(signal, 'status')) requireCount(signal.status, `${name} status`);
  requireClosedArray(signal.scopeEvidence, `${name} scopeEvidence`);
  requireClosedArray(signal.resourceScopes, `${name} resourceScopes`);
  if (
    signal.scopeEvidence.length === 0
    || signal.scopeEvidence.some(item => !Object.hasOwn(RESOURCE_SCOPE_EVIDENCE, item))
    || new Set(signal.scopeEvidence).size !== signal.scopeEvidence.length
  ) throw new Error(`${name} must contain complete closed resource evidence.`);
  const evidenceOrder = Object.keys(RESOURCE_SCOPE_EVIDENCE);
  const canonicalEvidence = evidenceOrder.filter(item => signal.scopeEvidence.includes(item));
  if (
    canonicalEvidence.length !== signal.scopeEvidence.length
    || canonicalEvidence.some((item, index) => item !== signal.scopeEvidence[index])
  ) throw new Error(`${name} scope evidence must use canonical order.`);
  const derivedScopes = deriveResourceScopes(signal.scopeEvidence);
  if (
    signal.resourceScopes.length !== derivedScopes.length
    || signal.resourceScopes.some((scope, index) => scope !== derivedScopes[index])
  ) throw new Error(`${name} resource scopes must be derived from its closed resource evidence.`);

  const evidence = new Set(signal.scopeEvidence);
  if (evidence.has('join-admin-patch') && (
    signal.targetKind !== 'staging-join-admin-api' || signal.method !== 'PATCH'
  )) throw new Error(`${name} join-admin evidence is disconnected from its exact target.`);
  if (signal.targetKind === 'staging-join-admin-api' && !evidence.has('join-admin-patch') && !evidence.has('unscoped-resource')) {
    throw new Error(`${name} join-admin target is missing exact or fail-closed evidence.`);
  }
  if (evidence.has('firestore-transport-control') && signal.targetKind !== 'firestore-listen') {
    throw new Error(`${name} transport-control evidence requires a Firestore listener target.`);
  }
  const firestoreEvidence = signal.scopeEvidence.some(item => (
    item !== 'join-admin-patch' && item !== 'unscoped-resource'
  ));
  if (firestoreEvidence && !signal.targetKind.startsWith('firestore-')) {
    throw new Error(`${name} Firestore evidence is disconnected from its target.`);
  }
  const documentEvidence = new Set([
    'self-user-document', 'self-memberships-document',
    'fixture-team-a-document', 'fixture-team-b-document', 'fixture-league-document',
    'other-tenant-resource', 'foreign-user-resource', 'foreign-player-resource',
    'plans-reference-data', 'unscoped-resource',
  ]);
  const queryEvidence = new Set([
    'self-memberships-query', 'self-parent-players-query',
    'fixture-team-a-query', 'fixture-team-b-query', 'fixture-league-query',
    'other-tenant-resource', 'foreign-user-resource', 'foreign-player-resource',
    'plans-reference-data', 'unscoped-resource',
  ]);
  const listenEvidence = new Set([
    ...documentEvidence,
    ...queryEvidence,
    'firestore-transport-control',
  ]);
  const compatibleEvidence = {
    'firestore-document': documentEvidence,
    'firestore-run-query': queryEvidence,
    'firestore-listen': listenEvidence,
    'firestore-protected': new Set(['unscoped-resource']),
    'staging-join-admin-api': new Set(['join-admin-patch', 'unscoped-resource']),
    'staging-protected-api': new Set(['unscoped-resource']),
  }[signal.targetKind];
  if (signal.scopeEvidence.some(item => !compatibleEvidence.has(item))) {
    throw new Error(`${name} target kind is incompatible with its closed evidence.`);
  }
  if (signal.targetKind === 'firestore-document' && signal.method !== 'GET') {
    throw new Error(`${name} Firestore document evidence requires GET.`);
  }
  if (signal.targetKind === 'firestore-run-query' && signal.method !== 'POST') {
    throw new Error(`${name} Firestore query evidence requires POST.`);
  }
  if (signal.targetKind === 'firestore-listen' && !['GET', 'POST'].includes(signal.method)) {
    throw new Error(`${name} Firestore listener evidence requires GET or POST.`);
  }
  return {
    targetKind: signal.targetKind,
    method: signal.method,
    resourceType: signal.resourceType,
    initiatingFrameUrl: signal.initiatingFrameUrl,
    scopeEvidence: signal.scopeEvidence.map(item => item),
    resourceScopes: signal.resourceScopes.map(item => item),
    ...(Object.hasOwn(signal, 'status') ? { status: signal.status } : {}),
  };
};

export function validateResourceSignal(value, name = 'Resource signal') {
  const snapshot = snapshotClosedDataGraph(value, 'Resource signal input');
  const label = sanitizeEvidenceName(name, 'Resource signal');
  const result = requireClosedResourceSignal(snapshot, label);
  assertNoFixtureIdentifierLeakSnapshot(result, 'Validated resource signal');
  return result;
}

const validateNoTeamResourceIsolationSnapshot = value => {
  const window = requireRecord(value, 'No Team action window');
  if (window.protectedRender === true) throw new Error('No Team action window contains a protected render.');
  const teamSelectionSignals = requireClosedArray(window.teamSelectionSignals, 'No Team team-selection signals');
  if (teamSelectionSignals.some(scope => (
    !['tenant-team-a', 'tenant-team-b', 'tenant-other'].includes(scope)
  ))) throw new Error('No Team evidence requires complete typed team-selection scopes.');
  if (teamSelectionSignals.includes('tenant-team-a')) throw new Error('No Team selected Team A.');
  if (teamSelectionSignals.includes('tenant-team-b')) throw new Error('No Team selected Team B.');
  if (teamSelectionSignals.includes('tenant-other')) throw new Error('No Team selected another tenant.');
  const validateSignals = (signals, count, name) => {
    requireCount(count, `No Team ${name} count`);
    const closedSignals = requireClosedArray(signals, `No Team ${name} signals`);
    if (closedSignals.length !== count) {
      throw new Error(`No Team evidence requires complete ${name} signals.`);
    }
    for (const [index, value] of closedSignals.entries()) {
      const signal = requireClosedResourceSignal(value, `No Team ${name} ${index}`);
      if (signal.resourceScopes.includes('tenant-team-a')) {
        throw new Error('No Team evidence contains Team A tenant resource activity.');
      }
      if (signal.resourceScopes.includes('tenant-team-b')) {
        throw new Error('No Team evidence contains Team B tenant resource activity.');
      }
      if (signal.resourceScopes.includes('tenant-league')) {
        throw new Error('No Team evidence contains league tenant resource activity.');
      }
      if (signal.resourceScopes.includes('tenant-other')) {
        throw new Error('No Team evidence contains other tenant resource activity.');
      }
      if (signal.resourceScopes.includes('foreign-account')) {
        throw new Error('No Team evidence contains foreign account resource activity.');
      }
      if (signal.resourceScopes.includes('unscoped')) {
        throw new Error('No Team evidence requires a typed resource scope.');
      }
    }
  };
  validateSignals(window.protectedRequestSignals, window.protectedRequests, 'protected request');
  validateSignals(window.listenerSignals, window.protectedListenerStarts, 'protected listener');
  const result = { pass: true };
  assertNoFixtureIdentifierLeakSnapshot(result, 'Validated No Team resource isolation');
  return result;
};

export function validateNoTeamResourceIsolation(value) {
  const snapshot = snapshotClosedDataGraph(value, 'No Team action window input');
  return validateNoTeamResourceIsolationSnapshot(snapshot);
}

const ACTION_WINDOW_KEYS = [
  'terminalReached',
  'loadingVisible',
  'finalUrl',
  'finalPath',
  'visibleSentinels',
  'renderSignals',
  'redirectReason',
  'sessionPresent',
  'protectedRender',
  'protectedRequests',
  'protectedRequestSignals',
  'protectedListenerStarts',
  'listenerSignals',
  'teamSelectionSignals',
  'relevantHttpResults',
  'pageErrors',
  'appConsoleErrors',
  'unexpectedRequestFailures',
  'overflow',
  'pageId',
];

const TEAM_SELECTION_SCOPES = ['tenant-team-a', 'tenant-team-b', 'tenant-other'];

const requireClosedRenderSignal = (value, index) => {
  const name = `Action window render signal ${index}`;
  const signal = requireClosedOwnDataObject(value, {
    name,
    schemaName: 'render signal',
    requiredKeys: ['kind', 'pathname', 'sentinel'],
  });
  if (!['heading', 'status'].includes(signal.kind)) {
    throw new Error('renderSignals must contain typed heading or status signals.');
  }
  requireString(signal.pathname, `${name} pathname`);
  requireString(signal.sentinel, `${name} sentinel`);
  if (
    !PUBLIC_RENDER_PATHS.includes(signal.pathname)
    || (signal.kind === 'heading' && !LANDING_SENTINELS.includes(signal.sentinel))
    || (signal.kind === 'status' && (
      signal.pathname !== '/login' || signal.sentinel !== PENDING_UNAVAILABLE_SENTINEL
    ))
  ) throw new Error('renderSignals must use closed source-backed paths and sentinels.');
  return { kind: signal.kind, pathname: signal.pathname, sentinel: signal.sentinel };
};

const requireClosedHttpResult = (value, index) => {
  const name = `Action window relevant HTTP result ${index}`;
  const result = requireClosedOwnDataObject(value, {
    name,
    schemaName: 'HTTP result',
    requiredKeys: ['targetKind', 'status'],
  });
  if (!RESOURCE_TARGET_KINDS.includes(result.targetKind)) {
    throw new Error(`${name} target kind is unsupported.`);
  }
  requireCount(result.status, `${name} status`);
  return { targetKind: result.targetKind, status: result.status };
};

const validateActionWindowSnapshot = (value, options = {}, diagnostic = () => {}) => {
  diagnostic('window-schema', 'schema-invalid');
  const candidate = requireRecord(value, 'Action window');
  if (Object.hasOwn(candidate, 'requestSignals')) {
    throw new Error('Action window must not expose legacy request signals.');
  }
  const window = requireClosedOwnDataObject(candidate, {
    name: 'Action window',
    schemaName: 'action-window',
    requiredKeys: ACTION_WINDOW_KEYS,
  });
  assertNoFixtureIdentifierLeakSnapshot(window, 'Action window');
  if (!/^phase9-page-[1-9]\d*$/.test(window.pageId)) {
    throw new Error('pageId must use the closed local page identifier format.');
  }
  diagnostic('window-terminal', 'terminal-invalid');
  requireBoolean(window.terminalReached, 'terminalReached');
  diagnostic('window-loading', 'loading-invalid');
  requireBoolean(window.loadingVisible, 'loadingVisible');
  diagnostic('window-location', 'location-invalid');
  requireString(window.finalPath, 'finalPath');
  requireCanonicalStagingLocation(window.finalUrl, window.finalPath, 'Action window');
  diagnostic('window-schema', 'schema-invalid');
  const visibleSentinels = requireClosedArray(window.visibleSentinels, 'visibleSentinels').map(item => item);
  if (visibleSentinels.some(item => typeof item !== 'string')) {
    throw new Error('visibleSentinels must be an explicit string array.');
  }
  if (visibleSentinels.some(item => !PUBLIC_VISIBLE_SENTINELS.includes(item))) {
    throw new Error('visibleSentinels must use the closed source-backed sentinel enum.');
  }
  const renderSignals = requireClosedArray(window.renderSignals, 'renderSignals')
    .map((signal, index) => requireClosedRenderSignal(signal, index));
  if (!['unavailable', 'none', 'other'].includes(window.redirectReason)) {
    throw new Error('redirectReason must use the fixed sanitized enum.');
  }
  requireBoolean(window.sessionPresent, 'sessionPresent');
  requireBoolean(window.protectedRender, 'protectedRender');
  diagnostic('window-resource', 'resource-invalid');
  requireCount(window.protectedRequests, 'protectedRequests');
  requireCount(window.protectedListenerStarts, 'protectedListenerStarts');
  const validateClosedSignals = (signals, count, name, { listener = false } = {}) => {
    const closedArray = requireClosedArray(signals, `${name} signals`);
    if (closedArray.length !== count) {
      throw new Error(`Action window requires complete ${name} signals matching its exact count.`);
    }
    return closedArray.map((signal, index) => {
      const closed = requireClosedResourceSignal(signal, `Action window ${name} ${index}`);
      if (listener && closed.targetKind !== 'firestore-listen') {
        throw new Error(`Action window ${name} ${index} must be a Firestore listener signal.`);
      }
      return closed;
    });
  };
  const protectedRequestSignals = validateClosedSignals(
    window.protectedRequestSignals,
    window.protectedRequests,
    'protected request',
  );
  const listenerSignals = validateClosedSignals(
    window.listenerSignals,
    window.protectedListenerStarts,
    'protected listener',
    { listener: true },
  );
  const teamSelectionSignals = requireClosedArray(window.teamSelectionSignals, 'teamSelectionSignals')
    .map(scope => {
      if (!TEAM_SELECTION_SCOPES.includes(scope)) {
        throw new Error('teamSelectionSignals must use the closed team-selection scope enum.');
      }
      return scope;
    });
  const relevantHttpResults = requireClosedArray(window.relevantHttpResults, 'relevantHttpResults')
    .map((result, index) => requireClosedHttpResult(result, index));
  diagnostic('window-page-error', 'page-error-invalid');
  requireCount(window.pageErrors, 'pageErrors');
  diagnostic('window-console-error', 'console-error-invalid');
  requireCount(window.appConsoleErrors, 'appConsoleErrors');
  diagnostic('window-request-failure', 'request-failure-invalid');
  requireCount(window.unexpectedRequestFailures, 'unexpectedRequestFailures');
  diagnostic('window-overflow', 'overflow-invalid');
  requireCount(window.overflow, 'overflow');

  diagnostic('window-terminal', 'terminal-invalid');
  if (!window.terminalReached) throw new Error('Action window did not reach its terminal state.');
  diagnostic('window-loading', 'loading-invalid');
  if (window.loadingVisible) throw new Error('Action window ended with swallowed loading state.');
  diagnostic('window-page-error', 'page-error-invalid');
  if (window.pageErrors !== 0) throw new Error('Action window contains page errors.');
  diagnostic('window-console-error', 'console-error-invalid');
  if (window.appConsoleErrors !== 0) throw new Error('Action window contains application console errors.');
  diagnostic('window-request-failure', 'request-failure-invalid');
  if (window.unexpectedRequestFailures !== 0) throw new Error('Action window contains an unexpected request failure.');
  diagnostic('window-overflow', 'overflow-invalid');
  if (window.overflow !== 0) throw new Error('Action window signal overflow is nonzero.');

  diagnostic('window-render-coherence', 'render-coherence-invalid');
  const protectedHistory = renderSignals.filter(signal => (
    signal.kind === 'heading' && PROTECTED_PAGE_HEADINGS.includes(signal.sentinel)
  ));
  if (window.protectedRender !== (protectedHistory.length > 0)) {
    throw new Error('Protected render flag must match protected heading history.');
  }

  const pendingStale = options.kind === 'pending-deletion-stale';
  const pendingFresh = options.kind === 'pending-deletion-fresh';
  const revoked = options.kind === 'fresh-unauthenticated' || pendingStale || pendingFresh;
  const requireNoProtected = revoked || options.requireNoProtected === true;
  diagnostic('window-policy', 'policy-invalid');
  if (options.resourcePolicy !== undefined && options.resourcePolicy !== NO_TEAM_RESOURCE_POLICY) {
    throw new Error('Action window resource policy is unsupported.');
  }
  if (revoked && window.sessionPresent) throw new Error('Revoked action window retained a session.');
  if (revoked && window.finalPath !== '/login') throw new Error('Revoked action window must end at /login.');
  if (revoked && !window.visibleSentinels.includes('Sign In')) throw new Error('Revoked action window must reach the Sign In sentinel.');
  const unavailableStatusObserved = renderSignals.some(signal => (
    signal.kind === 'status' && signal.sentinel === PENDING_UNAVAILABLE_SENTINEL
  ));
  if (pendingStale && window.redirectReason !== 'unavailable') {
    throw new Error('Stale pending-deletion redirect reason must be unavailable.');
  }
  if (pendingFresh && window.redirectReason !== 'none') {
    throw new Error('Fresh pending-deletion redirect reason must be none.');
  }
  if (pendingStale && (window.visibleSentinels.includes(PENDING_UNAVAILABLE_SENTINEL) || unavailableStatusObserved)) {
    throw new Error(`Stale pending-deletion action window must not show unavailable toast or contain transient unavailable status: ${PENDING_UNAVAILABLE_SENTINEL}`);
  }
  if (pendingFresh && (!window.visibleSentinels.includes(PENDING_UNAVAILABLE_SENTINEL) || !unavailableStatusObserved)) {
    throw new Error(`Fresh pending-deletion action window must show unavailable status signal: ${PENDING_UNAVAILABLE_SENTINEL}`);
  }
  if (requireNoProtected) {
    if (window.protectedRender) throw new Error('Revoked action window contains a protected render.');
    if (window.protectedRequests !== 0) throw new Error('Revoked action window contains a protected request.');
    if (window.protectedListenerStarts !== 0) throw new Error('Revoked action window contains a protected listener start.');
  }
  const closedWindow = {
    pageId: window.pageId,
    terminalReached: window.terminalReached,
    loadingVisible: window.loadingVisible,
    finalUrl: window.finalUrl,
    finalPath: window.finalPath,
    visibleSentinels,
    renderSignals,
    redirectReason: window.redirectReason,
    sessionPresent: window.sessionPresent,
    protectedRender: window.protectedRender,
    protectedRequests: window.protectedRequests,
    protectedRequestSignals,
    protectedListenerStarts: window.protectedListenerStarts,
    listenerSignals,
    teamSelectionSignals,
    relevantHttpResults,
    pageErrors: window.pageErrors,
    appConsoleErrors: window.appConsoleErrors,
    unexpectedRequestFailures: window.unexpectedRequestFailures,
    overflow: window.overflow,
  };
  if (options.resourcePolicy === NO_TEAM_RESOURCE_POLICY) validateNoTeamResourceIsolationSnapshot(closedWindow);

  const result = {
    pageId: closedWindow.pageId,
    terminalReached: closedWindow.terminalReached,
    loadingVisible: closedWindow.loadingVisible,
    finalUrl: closedWindow.finalUrl,
    finalPath: closedWindow.finalPath,
    visibleSentinels: closedWindow.visibleSentinels,
    renderSignals: closedWindow.renderSignals,
    redirectReason: closedWindow.redirectReason,
    sessionPresent: closedWindow.sessionPresent,
    protectedRender: closedWindow.protectedRender,
    protectedRequests: closedWindow.protectedRequests,
    protectedRequestSignals: closedWindow.protectedRequestSignals,
    protectedListenerStarts: closedWindow.protectedListenerStarts,
    listenerSignals: closedWindow.listenerSignals,
    teamSelectionSignals: closedWindow.teamSelectionSignals,
    relevantHttpResults: closedWindow.relevantHttpResults,
    pageErrors: closedWindow.pageErrors,
    appConsoleErrors: closedWindow.appConsoleErrors,
    unexpectedRequestFailures: closedWindow.unexpectedRequestFailures,
    overflow: closedWindow.overflow,
    pass: true,
  };
  assertNoFixtureIdentifierLeakSnapshot(result, 'Validated action window');
  return result;
};

export function validateActionWindow(value, options = {}, diagnostic = () => {}) {
  if (typeof diagnostic !== 'function') throw new Error('Action window diagnostic must be a function.');
  const snapshot = snapshotClosedDataGraph({ value, options }, 'Action window input');
  const diagnostics = [];
  const recordDiagnostic = (checkpoint, reason) => {
    diagnostics[diagnostics.length] = [checkpoint, reason];
  };
  let result;
  let validationError;
  try {
    result = validateActionWindowSnapshot(snapshot.value, snapshot.options, recordDiagnostic);
  } catch (error) {
    validationError = error;
  }
  for (let index = 0; index < diagnostics.length; index += 1) {
    try {
      diagnostic(diagnostics[index][0], diagnostics[index][1]);
    } catch {}
  }
  if (validationError !== undefined) throw validationError;
  return result;
}

const validateRouteResultSnapshot = value => {
  const result = requireRecord(value, 'Route result');
  requireBoolean(result.allowed, 'allowed');
  if (Object.hasOwn(result, 'requireNoProtected')) {
    requireBoolean(result.requireNoProtected, 'requireNoProtected');
  }
  if (Object.hasOwn(result, 'resourcePolicy') && result.resourcePolicy !== NO_TEAM_RESOURCE_POLICY) {
    throw new Error('Route result resource policy is unsupported.');
  }
  const requestedPath = result.allowed
    ? result.requestedPath ?? result.expectedPath
    : requireString(result.requestedPath, 'requestedPath');
  const expectedPath = requireString(result.expectedPath, 'expectedPath');
  const expectedSentinel = requireString(result.expectedSentinel, 'expectedSentinel');
  if (!ROUTE_SCENARIOS[requestedPath]) throw new Error('Route result requestedPath must be a configured protected route.');
  if (result.allowed && !ROUTE_SCENARIOS[expectedPath]?.visibleSentinels.includes(expectedSentinel)) {
    throw new Error('Allowed route must use its configured route sentinel.');
  }
  const exactDeniedLanding = LANDING_SCENARIOS[expectedPath]?.includes(expectedSentinel)
    || ROUTE_SCENARIOS[expectedPath]?.visibleSentinels.includes(expectedSentinel);
  if (!result.allowed && !exactDeniedLanding) {
    throw new Error('Denied route must use an exact landing sentinel.');
  }
  if (!result.allowed && requestedPath === expectedPath) {
    throw new Error('Denied route requestedPath must differ from its authorized landing path.');
  }
  const window = validateActionWindowSnapshot(result.window, {
    requireNoProtected: result.requireNoProtected === true,
    resourcePolicy: result.resourcePolicy,
  });

  if (!window.sessionPresent) throw new Error('Active-user route result must retain an authenticated session.');

  if (window.finalPath !== expectedPath) throw new Error('Route result pathname does not match the expected pathname.');
  if (!window.visibleSentinels.includes(expectedSentinel)) {
    throw new Error('Route result did not reach its configured visible sentinel.');
  }
  const finalProtectedHeadings = window.visibleSentinels.filter(sentinel => PROTECTED_PAGE_HEADINGS.includes(sentinel));
  const expectedFinalProtectedHeadings = PROTECTED_PAGE_HEADINGS.includes(expectedSentinel) ? [expectedSentinel] : [];
  if (
    finalProtectedHeadings.length !== expectedFinalProtectedHeadings.length
    || finalProtectedHeadings.some((sentinel, index) => sentinel !== expectedFinalProtectedHeadings[index])
  ) throw new Error('Route result final visible protected heading must exactly match the expected sentinel.');
  if (window.protectedRender) {
    const protectedSignals = window.renderSignals.filter(signal => (
      signal.kind === 'heading' && PROTECTED_PAGE_HEADINGS.includes(signal.sentinel)
    ));
    if (protectedSignals.length === 0) {
      throw new Error('Allowed route protected-render history is incomplete.');
    }
    const unexpected = protectedSignals.some(signal => (
      signal.pathname !== expectedPath
      || signal.sentinel !== expectedSentinel
    ));
    if (unexpected) throw new Error('Allowed route contains an unexpected protected render.');
  }

  if (!result.allowed && result.resourcePolicy !== NO_TEAM_RESOURCE_POLICY) {
    const validateAttribution = (signal, name) => {
      const pathname = requireCanonicalStagingAttribution(signal.initiatingFrameUrl, name);
      if (isExactPathOrSubtree(pathname, requestedPath)) {
        throw new Error(`Denied route contains a denied-target ${name}.`);
      }
      if (pathname !== expectedPath) {
        throw new Error(`Denied route ${name} must use the exact authorized landing attribution.`);
      }
    };
    for (const signal of window.protectedRequestSignals) validateAttribution(signal, 'protected request');
    for (const signal of window.listenerSignals) validateAttribution(signal, 'protected listener');
  }

  const validated = { pass: true, allowed: result.allowed, window };
  assertNoFixtureIdentifierLeakSnapshot(validated, 'Validated route result');
  return validated;
};

export function validateRouteResult(value) {
  const snapshot = snapshotClosedDataGraph(value, 'Route result input');
  return validateRouteResultSnapshot(snapshot);
}

const validateIsolationResultSnapshot = value => {
  const result = requireRecord(value, 'Isolation result');
  const canonical = buildIsolationExpectation({ runId: result.runId, alias: result.alias });
  if (result.endpoint !== ISOLATION_SCENARIOS.team.endpoint || result.parameter !== ISOLATION_SCENARIOS.team.parameter) {
    throw new Error('Isolation must use the configured parameter-consuming same-origin endpoint.');
  }
  requireString(result.ownTeamId, 'Isolation ownTeamId');
  requireString(result.oppositeTeamId, 'Isolation oppositeTeamId');
  requireExact(result.ownTeamId, canonical.ownTeamId, 'Isolation ownTeamId');
  requireExact(result.oppositeTeamId, canonical.oppositeTeamId, 'Isolation oppositeTeamId');
  if (result.ownTeamId === result.oppositeTeamId) throw new Error('Isolation ownTeamId and oppositeTeamId must differ.');
  const sameOriginApi = requireClosedArray(result.sameOriginApi, 'Isolation same-origin API results');
  if (sameOriginApi.length !== canonical.sameOriginApi.length) {
    throw new Error('Isolation must contain both exact same-origin API target pairs.');
  }
  for (const [index, expected] of canonical.sameOriginApi.entries()) {
    const actual = requireRecord(sameOriginApi[index], `${expected.label} same-origin API result`);
    for (const field of ['label', 'endpoint', 'parameter', 'teamId', 'target', 'status']) {
      if (actual[field] !== expected[field]) {
        throw new Error(`${expected.label} ${field} must equal the canonical ${expected.status} target pair.`);
      }
    }
  }
  const directFirestore = requireClosedArray(result.directFirestore, 'Isolation Firestore probes');
  if (directFirestore.length !== ISOLATION_SCENARIOS.directFirestore.length) {
    throw new Error('Isolation Firestore probe must contain the complete exact label set.');
  }

  const probes = new Map();
  for (const probe of directFirestore) {
    requireRecord(probe, 'Firestore probe');
    requireString(probe.label, 'Firestore probe label');
    requireCount(probe.status, `${probe.label} status`);
    if (probes.has(probe.label)) throw new Error(`Firestore probe label ${probe.label} is duplicated.`);
    probes.set(probe.label, probe.status);
  }
  for (const expected of ISOLATION_SCENARIOS.directFirestore) {
    const canonicalProbe = canonical.directFirestore.find(probe => probe.label === expected.label);
    const actual = directFirestore.find(probe => probe.label === expected.label);
    if (actual?.path !== canonicalProbe.path) {
      throw new Error(`${expected.label} Firestore probe path must match the canonical isolation path.`);
    }
    if (probes.get(expected.label) !== canonicalProbe.status) {
      throw new Error(`${expected.label} Firestore probe must return ${canonicalProbe.status}.`);
    }
  }

  requireBoolean(result.oppositeProtectedRender, 'oppositeProtectedRender');
  requireCount(result.oppositeListenerStarts, 'oppositeListenerStarts');
  if (result.oppositeProtectedRender) throw new Error('Isolation observed an opposite protected render.');
  if (result.oppositeListenerStarts !== 0) throw new Error('Isolation observed an opposite listener start.');
  const validated = { pass: true };
  assertNoFixtureIdentifierLeakSnapshot(validated, 'Validated isolation result');
  return validated;
};

export function validateIsolationResult(value) {
  const snapshot = snapshotClosedDataGraph(value, 'Isolation result input');
  return validateIsolationResultSnapshot(snapshot);
}

const validateLogoutStagesSnapshot = value => {
  const inputStages = requireClosedArray(value, 'Logout stages');
  if (inputStages.length !== REQUIRED_LOGOUT_STAGES.length) {
    throw new Error('Logout validation requires every logout stage.');
  }
  const stages = inputStages.map((stage, index) => {
    requireRecord(stage, `Logout stage ${index}`);
    if (stage.name !== REQUIRED_LOGOUT_STAGES[index]) throw new Error('Logout stages are missing or out of order.');
    const window = validateActionWindowSnapshot(stage.window, { requireNoProtected: true });
    if (window.sessionPresent) throw new Error(`${stage.name} retained a session.`);
    if (window.finalPath !== '/login') throw new Error(`${stage.name} pathname must be /login.`);
    if (!window.visibleSentinels.includes('Sign In')) throw new Error(`${stage.name} must reach the login visible sentinel.`);
    return { name: stage.name, window };
  });
  const result = { pass: true, stages };
  assertNoFixtureIdentifierLeakSnapshot(result, 'Validated logout stages');
  return result;
};

export function validateLogoutStages(value) {
  const snapshot = snapshotClosedDataGraph(value, 'Logout stages input');
  return validateLogoutStagesSnapshot(snapshot);
}

const validateInspect = (value, expected) => {
  const states = requireRecord(value.states, 'Inspect states');
  requireCount(states.problems, 'Inspect problems');
  if (states.problems !== 0) throw new Error('Inspect problems must be zero.');
  requireExact(states.manifest, expected.state, 'Inspect state');
  if (requireClosedArray(value.drift, 'Inspect drift').length !== 0) throw new Error('Inspect drift must be empty.');
  const counts = requireRecord(value.counts, 'Inspect counts');
  const expectedCounts = requireRecord(counts.expected, 'Inspect expected counts');
  const actual = requireRecord(counts.actualPresent, 'Inspect actual-present counts');
  requireCount(expectedCounts.auth, 'Inspect expected Auth count');
  requireCount(expectedCounts.firestore, 'Inspect expected Firestore count');
  requireCount(actual.auth, 'Inspect present Auth count');
  requireCount(actual.firestore, 'Inspect present Firestore count');
  requireExact(expectedCounts.auth, expected.auth, 'Inspect expected Auth count');
  requireExact(expectedCounts.firestore, expected.firestore, 'Inspect expected Firestore count');
  requireExact(actual.auth, expected.actualAuth, 'Inspect present Auth count');
  requireExact(actual.firestore, expected.actualFirestore, 'Inspect present Firestore count');
};

const validateCleanup = (value, expected) => {
  requireExactKeys(value, ['command', 'ok', 'retained', 'deleted', 'followUp'], 'Cleanup');
  if (requireClosedArray(value.retained, 'Cleanup retained list').length !== 0) {
    throw new Error('Cleanup retained list must be empty.');
  }
  const deleted = requireRecord(value.deleted, 'Cleanup deleted counts');
  requireExactKeys(deleted, ['auth', 'firestore'], 'Cleanup deleted counts');
  requireCount(deleted.auth, 'Cleanup deleted Auth count');
  requireCount(deleted.firestore, 'Cleanup deleted Firestore count');
  requireExact(deleted.auth, expected.auth, 'Cleanup deleted Auth count');
  requireExact(deleted.firestore, expected.firestore, 'Cleanup deleted Firestore count');
  const followUp = requireRecord(value.followUp, 'Cleanup follow-up');
  requireExactKeys(followUp, ['retained', 'failures'], 'Cleanup follow-up');
  for (const category of ['retained', 'failures']) {
    const summary = requireRecord(followUp[category], `Cleanup ${category}`);
    requireExactKeys(summary, ['auth', 'firestore'], `Cleanup ${category}`);
    requireZeroSummary(summary.auth, `Cleanup ${category} Auth`);
    requireZeroSummary(summary.firestore, `Cleanup ${category} Firestore`);
  }
};

const validateProbe = (value, expected) => {
  requireCount(value.checkedAuth, 'Probe checked Auth count');
  requireCount(value.checkedFirestore, 'Probe checked Firestore count');
  requireCount(value.checkedExpectedAbsent, 'Probe checked expected-absence count');
  requireCount(value.authPresent, 'Probe present Auth count');
  requireCount(value.firestorePresent, 'Probe present Firestore count');
  requireCount(value.expectedAbsentPresent, 'Probe present expected-absence count');
  requireExact(value.checkedAuth, expected.auth, 'Probe checked Auth count');
  requireExact(value.checkedFirestore, expected.firestore, 'Probe checked Firestore count');
  if (value.checkedExpectedAbsent !== expected.expectedAbsent) {
    throw new Error('Probe expected-absence coverage is incomplete.');
  }
  requireExact(value.authPresent, 0, 'Probe present Auth count');
  requireExact(value.firestorePresent, 0, 'Probe present Firestore count');
  requireExact(value.expectedAbsentPresent, 0, 'Probe present expected-absence count');
};

export function validateLifecycleResult(kind, input, stage) {
  const snapshot = snapshotClosedDataGraph({ kind, input, stage }, 'Lifecycle validation input');
  kind = snapshot.kind;
  stage = snapshot.stage;
  const value = parseResult(snapshot.input);
  requireLifecycleStage(kind, stage);
  switch (kind) {
    case 'preflight':
      requireExactKeys(value, ['command', 'projectId', 'origin', 'plannedAliases', 'plannedTeams', 'safe'], 'Preflight');
      requireExact(value.command, 'preflight', 'Preflight command');
      requireBoolean(value.safe, 'Preflight safe');
      requireString(value.projectId, 'Preflight projectId');
      requireString(value.origin, 'Preflight origin');
      requireCount(value.plannedAliases, 'Preflight plannedAliases');
      requireCount(value.plannedTeams, 'Preflight plannedTeams');
      if (!value.safe) throw new Error('Preflight must report safe=true.');
      requireExact(value.projectId, STAGING_PROJECT_ID, 'Preflight projectId');
      requireExact(value.origin, STAGING_ORIGIN, 'Preflight origin');
      requireExact(value.plannedAliases, FIXTURE_RESOURCE_COUNTS.aliases, 'Preflight plannedAliases');
      requireExact(value.plannedTeams, FIXTURE_RESOURCE_COUNTS.teams, 'Preflight plannedTeams');
      break;
    case 'seed': {
      requireExactKeys(value, ['command', 'state', 'aliases', 'counts', 'uidSuffixes'], 'Seed');
      requireExact(value.command, 'seed', 'Seed command');
      requireString(value.state, 'Seed state');
      const counts = requireRecord(value.counts, 'Seed counts');
      requireCount(counts.auth, 'Seed Auth count');
      requireCount(counts.firestore, 'Seed Firestore count');
      if (
        value.state !== 'seeded'
        || counts.auth !== FIXTURE_RESOURCE_COUNTS.auth
        || counts.firestore !== FIXTURE_RESOURCE_COUNTS.firestore
      ) throw new Error('Seed result does not match the canonical seed state and counts.');
      requireExactArray(value.aliases, FIXTURE_ALIASES, 'Seed aliases');
      requireExactArray(value.uidSuffixes, FIXTURE_UID_SUFFIXES, 'Seed UID suffixes');
      break;
    }
    case 'inspect': {
      requireOk(value);
      requireExactKeys(value, ['command', 'ok', 'aliases', 'counts', 'states', 'drift', 'uidSuffixes'], 'Inspect');
      requireExact(value.command, 'inspect', 'Inspect command');
      const canonical = stage === 'seeded-present'
        ? {
            state: 'seeded',
            auth: FIXTURE_RESOURCE_COUNTS.auth,
            firestore: FIXTURE_RESOURCE_COUNTS.firestore,
            actualAuth: FIXTURE_RESOURCE_COUNTS.auth,
            actualFirestore: FIXTURE_RESOURCE_COUNTS.firestore,
          }
        : {
            state: 'cleaned',
            auth: FIXTURE_RESOURCE_COUNTS.auth,
            firestore: FIXTURE_RESOURCE_COUNTS.firestore,
            actualAuth: 0,
            actualFirestore: 0,
          };
      validateInspect(value, canonical);
      requireExactArray(value.aliases, stage === 'seeded-present' ? FIXTURE_SORTED_ALIASES : [], 'Inspect aliases');
      requireExactArray(value.uidSuffixes, FIXTURE_UID_SUFFIXES, 'Inspect UID suffixes');
      break;
    }
    case 'transition': {
      if ('resumed' in value) requireExact(value.resumed, true, 'Transition resumed');
      requireExactKeys(
        value,
        value.resumed === true
          ? ['command', 'alias', 'state', 'uidSuffix', 'resumed']
          : ['command', 'alias', 'state', 'uidSuffix'],
        'Transition',
      );
      requireExact(value.command, 'transition', 'Transition command');
      requireString(value.alias, 'Transition alias');
      requireString(value.state, 'Transition state');
      requireString(value.uidSuffix, 'Transition UID suffix');
      requireExact(value.alias, 'qa-pending-delete', 'Transition alias');
      requireExact(value.state, 'pending_deletion', 'Transition state');
      requireExact(value.uidSuffix, 'pending-delete', 'Transition UID suffix');
      break;
    }
    case 'cleanup':
      requireOk(value);
      requireExact(value.command, 'cleanup', 'Cleanup command');
      validateCleanup(value, { auth: FIXTURE_RESOURCE_COUNTS.auth, firestore: FIXTURE_RESOURCE_COUNTS.firestore });
      break;
    case 'probe':
      requireExact(value.projectId, STAGING_PROJECT_ID, 'Probe projectId');
      validateProbe(value, {
        auth: FIXTURE_RESOURCE_COUNTS.auth,
        firestore: FIXTURE_RESOURCE_COUNTS.firestore,
        expectedAbsent: FIXTURE_RESOURCE_COUNTS.expectedAbsent,
      });
      break;
    case 'browser-sessions':
      if (requireClosedArray(value.sessions, 'Browser sessions').length !== 0) {
        throw new Error('Lifecycle closure requires zero browser sessions.');
      }
      break;
    case 'credential-removal':
    case 'workspace-removal':
      if (value.absent !== true) throw new Error(`${kind} must prove absence.`);
      break;
  }
  const result = { pass: true, kind };
  assertNoFixtureIdentifierLeakSnapshot(result, 'Validated lifecycle result');
  return result;
}

const validateLedgerRowSnapshot = (value, index = 0) => {
  const row = requireRecord(value, `Ledger row ${index}`);
  requireClosedOwnDataObject(row, {
    name: `Ledger row ${index}`,
    schemaName: 'ledger-row',
    requiredKeys: REQUIRED_LEDGER_COLUMNS,
  });
  assertNoFixtureIdentifierLeakSnapshot(row, `Ledger row ${index}`);
  for (const column of REQUIRED_LEDGER_COLUMNS) {
    if (row[column] === undefined || row[column] === null || row[column] === '') {
      throw new Error(`Ledger row ${index} is missing ${column}.`);
    }
  }
  for (const column of ['contextId', 'alias', 'startState', 'startUrl', 'action', 'expectedResult', 'visibleState', 'relevantHttpDataResult']) {
    requireString(row[column], `Ledger row ${index} ${column}`);
  }
  if (!Object.hasOwn(SCENARIO_GROUP_COUNTS, row.group)) throw new Error(`Ledger row ${index} group is unsupported.`);
  if (!new Set(['390x844', '1440x900']).has(row.viewport)) throw new Error(`Ledger row ${index} viewport is not canonical.`);
  requireBoolean(row.sessionPresent, `Ledger row ${index} sessionPresent`);
  for (const column of ['protectedRequests', 'protectedListenerStarts', 'pageErrors', 'appConsoleErrors', 'unexpectedRequestFailures', 'overflow']) {
    requireCount(row[column], `Ledger row ${index} ${column}`);
  }
  requireString(row.finalUrl, `Ledger row ${index} finalUrl`);
  let finalUrl;
  try {
    finalUrl = new URL(row.finalUrl);
  } catch {
    throw new Error(`Ledger row ${index} must contain an absolute canonical finalUrl.`);
  }
  if (finalUrl.origin !== STAGING_ORIGIN || finalUrl.username || finalUrl.password || finalUrl.hash) {
    throw new Error(`Ledger row ${index} finalUrl must use the canonical staging origin.`);
  }
  if (!new Set(['PASS', 'FAIL', 'INCONCLUSIVE-HARNESS']).has(row.result)) {
    throw new Error(`Ledger row ${index} result is unsupported.`);
  }
  return deepFreeze(Object.fromEntries(REQUIRED_LEDGER_COLUMNS.map(column => [column, row[column]])));
};

export function validateLedgerRow(value) {
  const snapshot = snapshotClosedDataGraph(value, 'Ledger row validation input');
  return validateLedgerRowSnapshot(snapshot);
}

export function validateLedger(rows, expected) {
  const snapshot = snapshotClosedDataGraph({ rows, expected }, 'Ledger validation input');
  rows = snapshot.rows;
  expected = snapshot.expected;
  rows = requireClosedArray(rows, 'Ledger rows');
  const contract = requireRecord(expected, 'Ledger expectation');
  const groupCounts = requireRecord(contract.groupCounts, 'Ledger group counts');
  const totals = requireRecord(contract.totals, 'Ledger totals');
  if (
    Object.keys(groupCounts).length !== Object.keys(SCENARIO_GROUP_COUNTS).length
    || Object.entries(SCENARIO_GROUP_COUNTS).some(([group, count]) => groupCounts[group] !== count)
    || Object.keys(totals).length !== Object.keys(SCENARIO_TOTALS).length
    || Object.entries(SCENARIO_TOTALS).some(([key, count]) => totals[key] !== count)
  ) {
    throw new Error('Ledger expectation does not match canonical group arithmetic.');
  }
  const ids = new Set();
  const actualGroups = new Map();
  const actualTotals = { total: rows.length, pass: 0, fail: 0, inconclusive: 0 };
  const viewports = new Set();

  for (const [index, unvalidatedRow] of rows.entries()) {
    const row = validateLedgerRowSnapshot(unvalidatedRow, index);
    if (ids.has(row.contextId)) throw new Error(`Ledger contains duplicate context ID ${row.contextId}.`);
    ids.add(row.contextId);
    viewports.add(row.viewport);
    actualGroups.set(row.group, (actualGroups.get(row.group) ?? 0) + 1);
    if (row.result === 'PASS') actualTotals.pass += 1;
    else if (row.result === 'FAIL') actualTotals.fail += 1;
    else if (row.result === 'INCONCLUSIVE-HARNESS') actualTotals.inconclusive += 1;
  }

  for (const [group, count] of Object.entries(groupCounts)) {
    if ((actualGroups.get(group) ?? 0) !== count) throw new Error(`Ledger group count mismatch for ${group}.`);
  }
  if (actualGroups.size !== Object.keys(groupCounts).length) throw new Error('Ledger contains an unexpected scenario group.');
  if (!viewports.has('390x844') || !viewports.has('1440x900')) throw new Error('Ledger must cover both required viewports.');
  for (const key of Object.keys(actualTotals)) {
    if (actualTotals[key] !== totals[key]) throw new Error(`Ledger result arithmetic mismatch for ${key}.`);
  }
  if (actualTotals.pass + actualTotals.fail + actualTotals.inconclusive !== actualTotals.total) {
    throw new Error('Ledger result arithmetic does not sum to the total.');
  }
  const result = { pass: true, groupCounts: Object.fromEntries(actualGroups), totals: actualTotals };
  assertNoFixtureIdentifierLeakSnapshot(result, 'Validated ledger');
  return result;
}
