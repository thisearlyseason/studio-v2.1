import { execFile, spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import {
  constants as fsConstants, existsSync, lstatSync, readFileSync, realpathSync, readdirSync, rmSync,
} from 'node:fs';
import { chmod, mkdir, open } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

import {
  LANDING_SENTINELS, PENDING_UNAVAILABLE_SENTINEL, PROTECTED_PAGE_HEADINGS,
  PUBLIC_RENDER_PATHS, PUBLIC_VISIBLE_SENTINELS, RESOURCE_TARGET_KINDS,
  SESSION_COOKIE_NAME, STAGING_ORIGIN, STAGING_PROJECT_ID, assertNoFixtureIdentifierLeak,
  validateResourceSignal,
} from './scenario-contracts.mjs';
import { assertRunId } from '../../qa-fixtures/manifest.mjs';

const MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const DEFAULT_TRANSPORT_ARTIFACT = resolve(MODULE_DIRECTORY, 'playwright-transport.bundle.json.gz');
const DEFAULT_TRANSPORT_SHA256 = '8a66b85498ad521f7354305ffb970591d7f66036adcf743165b0259302378f43';
const TRANSPORT_FORMAT = 'phase9-playwright-transport-v1';
const TRANSPORT_TOKENS = new WeakMap();
const TRANSPORT_ROOT_PREFIX = `${realpathSync('/tmp')}/phase9-playwright-transport.`;
const SYSTEM_CODESIGN = '/usr/bin/codesign';
const PROFILE_DESCRIPTOR_RUNTIME = '/usr/bin/python3';
const PROFILE_DESCRIPTOR_RUNTIME_SHA256 = 'b8763cf250e607a778bb4603cecb5b90338814d0a3dfcba0d57b1de242f610e9';
const PROFILE_DESCRIPTOR_RUNTIME_MAX_BYTES = 4_194_304;
const GUARDIAN_MARKER_NAME_SHA256 = '585c21d0652b1f1c5dd8168796ee2599745f8a1a9885e3178ac29b057f0044c3';
const DEFAULT_RUNTIME_POLICY = Object.freeze({
  path: '/usr/local/bin/node',
  sha256: '257c121b8efcb1932a92acac811b8d9a3940c956a295a74838a1443bf5be0d4c',
  codesignIdentifier: 'node',
  teamIdentifier: 'HX7739G8FX',
});
const DEFAULT_CHROME_POLICY = Object.freeze({
  appPath: '/Applications/Google Chrome.app',
  binaryPath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  binarySha256: 'ecfca1b0d336bd1ffdc6835da89cbc25b06c508d72bfdad186b72535743042f4',
  codesignIdentifier: 'com.google.Chrome',
  teamIdentifier: 'EQHXZ8M8AV',
});
const DEFAULT_TIMEOUT_MS = 15_000;
const PROFILE_DESCRIPTOR_LAUNCHER = `
'use strict';
const [entrypoint, ...args] = process.argv.slice(1);
if (!entrypoint || process.env.PHASE9_PROFILE_CWD !== 'descriptor') throw new Error('profile-descriptor-launch-invalid');
process.argv = [process.execPath, entrypoint, ...args];
require(entrypoint);
`;
const PROFILE_DESCRIPTOR_FCHDIR = `
import os, sys
if len(sys.argv) < 3 or os.environ.get("PHASE9_PROFILE_CWD") != "descriptor":
    raise SystemExit("profile-descriptor-launch-invalid")
os.fchdir(3)
os.umask(0o077)
os.environ["TMPDIR"] = "."
os.execve(sys.argv[1], sys.argv[1:], os.environ)
`;
const MAX_OUTPUT_BYTES = 1_048_576;
const MAX_SIGNAL_COUNT = 1000;
const MAX_RAW_URL_BYTES = 16_384;
const MAX_RAW_BODY_BYTES = 262_144;
const MAX_RAW_HEADERS = 64;
const MAX_RAW_HEADER_BYTES = 32_768;
const MAX_PERCENT_DECODE_ROUNDS = 4;
const MAX_LISTEN_MESSAGES = 256;
const MAX_ACTIVE_LISTEN_TARGETS = 256;
const MAX_LISTEN_TARGET_ID = 2_147_483_647;
const MAX_LISTEN_EXPECTED_COUNT = 1_000_000;
const MAX_LISTEN_OFFSET = 2_147_483_647;
const CLIENT_INTERNALS = new WeakMap();
const HEADING_SENTINELS = Object.freeze([...new Set(LANDING_SENTINELS)]);
const STATUS_SENTINELS = Object.freeze([PENDING_UNAVAILABLE_SENTINEL]);

const sha256Bytes = bytes => createHash('sha256').update(bytes).digest('hex');

const exactPolicy = (value, expectedKeys, label) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join(',') !== [...expectedKeys].sort().join(',')) {
    throw new Error(`${label} policy is invalid.`);
  }
  for (const key of expectedKeys) if (typeof value[key] !== 'string' || value[key].length === 0) {
    throw new Error(`${label} policy is invalid.`);
  }
  return Object.freeze({ ...value });
};

const validateRuntimePolicy = value => {
  const policy = exactPolicy(value, ['path', 'sha256', 'codesignIdentifier', 'teamIdentifier'], 'Node runtime');
  if (!policy.path.startsWith('/') || resolve(policy.path) !== policy.path || !/^[0-9a-f]{64}$/.test(policy.sha256)) {
    throw new Error('Node runtime policy is invalid.');
  }
  return policy;
};

const validateChromePolicy = value => {
  const policy = exactPolicy(
    value, ['appPath', 'binaryPath', 'binarySha256', 'codesignIdentifier', 'teamIdentifier'], 'Chrome',
  );
  if (!policy.appPath.startsWith('/') || resolve(policy.appPath) !== policy.appPath
    || !policy.binaryPath.startsWith('/') || resolve(policy.binaryPath) !== policy.binaryPath
    || !policy.binaryPath.startsWith(`${policy.appPath}/`) || !/^[0-9a-f]{64}$/.test(policy.binarySha256)) {
    throw new Error('Chrome policy is invalid.');
  }
  return policy;
};

const verifyCodesignTool = () => {
  const metadata = lstatSync(SYSTEM_CODESIGN);
  if (!metadata.isFile() || metadata.isSymbolicLink() || realpathSync(SYSTEM_CODESIGN) !== SYSTEM_CODESIGN
    || metadata.uid !== 0 || (metadata.mode & 0o022) !== 0) {
    throw new Error('System codesign verification boundary is invalid.');
  }
};

const verifySignedPath = async (path, { codesignIdentifier, teamIdentifier }, env, label) => {
  verifyCodesignTool();
  await new Promise((resolvePromise, reject) => execFile(SYSTEM_CODESIGN, [
    '--verify', '--deep',
    `-R=identifier "${codesignIdentifier}" and anchor apple generic and certificate leaf[subject.OU] = "${teamIdentifier}"`,
    path,
  ], {
    cwd: '/', env, timeout: 30_000, maxBuffer: 65_536,
  }, error => error ? reject(new Error(`${label} signature is invalid.`)) : resolvePromise()));
};

const verifyRuntime = async (policy, env) => {
  const metadata = lstatSync(policy.path);
  const bytes = readFileSync(policy.path);
  if (!metadata.isFile() || metadata.isSymbolicLink() || realpathSync(policy.path) !== policy.path
    || metadata.uid !== 0 || (metadata.mode & 0o022) !== 0 || (metadata.mode & 0o111) === 0
    || bytes.length !== metadata.size || sha256Bytes(bytes) !== policy.sha256) {
    throw new Error('Pinned Node runtime identity changed.');
  }
  await verifySignedPath(policy.path, policy, env, 'Pinned Node runtime');
  const after = lstatSync(policy.path);
  if (after.dev !== metadata.dev || after.ino !== metadata.ino || after.size !== metadata.size
    || after.mtimeMs !== metadata.mtimeMs || after.ctimeMs !== metadata.ctimeMs
    || (after.mode & 0o777) !== (metadata.mode & 0o777)) {
    throw new Error('Pinned Node runtime identity changed.');
  }
  return Object.freeze({
    dev: after.dev, ino: after.ino, size: after.size, mtimeMs: after.mtimeMs, ctimeMs: after.ctimeMs,
    mode: after.mode & 0o777,
  });
};

const verifyProfileDescriptorRuntime = () => {
  const metadata = lstatSync(PROFILE_DESCRIPTOR_RUNTIME);
  if (!metadata.isFile() || metadata.isSymbolicLink()
    || realpathSync(PROFILE_DESCRIPTOR_RUNTIME) !== PROFILE_DESCRIPTOR_RUNTIME
    || metadata.uid !== 0 || (metadata.mode & 0o022) !== 0 || (metadata.mode & 0o111) === 0
    || metadata.size <= 0 || metadata.size > PROFILE_DESCRIPTOR_RUNTIME_MAX_BYTES) {
    throw new Error('Pinned profile descriptor runtime identity changed.');
  }
  const bytes = readFileSync(PROFILE_DESCRIPTOR_RUNTIME);
  if (bytes.length !== metadata.size || sha256Bytes(bytes) !== PROFILE_DESCRIPTOR_RUNTIME_SHA256) {
    throw new Error('Pinned profile descriptor runtime identity changed.');
  }
  const after = lstatSync(PROFILE_DESCRIPTOR_RUNTIME);
  if (after.dev !== metadata.dev || after.ino !== metadata.ino || after.size !== metadata.size
    || after.mtimeMs !== metadata.mtimeMs || after.ctimeMs !== metadata.ctimeMs
    || (after.mode & 0o777) !== (metadata.mode & 0o777)) {
    throw new Error('Pinned profile descriptor runtime identity changed.');
  }
};

export function capturePlaywrightTransport({
  artifactPath = DEFAULT_TRANSPORT_ARTIFACT,
  expectedSha256 = DEFAULT_TRANSPORT_SHA256,
  runtimePolicy = DEFAULT_RUNTIME_POLICY,
  chromePolicy = DEFAULT_CHROME_POLICY,
} = {}) {
  if (typeof artifactPath !== 'string' || !artifactPath.startsWith('/') || resolve(artifactPath) !== artifactPath
    || !/^[0-9a-f]{64}$/.test(expectedSha256)) throw new Error('Playwright transport capture boundary is invalid.');
  const metadata = lstatSync(artifactPath);
  const artifact = readFileSync(artifactPath);
  if (!metadata.isFile() || metadata.isSymbolicLink() || realpathSync(artifactPath) !== artifactPath
    || (metadata.mode & 0o022) !== 0 || artifact.length !== metadata.size || artifact.length > 8_388_608
    || sha256Bytes(artifact) !== expectedSha256) throw new Error('Playwright transport artifact is not the reviewed bytes.');
  let payload;
  try {
    const expanded = gunzipSync(artifact, { maxOutputLength: 16_777_216 });
    payload = JSON.parse(expanded.toString('utf8'));
  } catch {
    throw new Error('Playwright transport artifact is invalid.');
  }
  if (!payload || Object.keys(payload).sort().join(',') !== 'entry,files,format,version'
    || payload.version !== 1 || payload.format !== TRANSPORT_FORMAT
    || payload.entry !== 'node_modules/@playwright/cli/playwright-cli.js'
    || !Array.isArray(payload.files) || payload.files.length < 10 || payload.files.length > 64) {
    throw new Error('Playwright transport artifact has an invalid closed manifest.');
  }
  const files = [];
  let previous = '';
  for (const file of payload.files) {
    if (!file || Object.keys(file).sort().join(',') !== 'contents,mode,path,sha256,size'
      || typeof file.path !== 'string' || !/^node_modules\/(?:@playwright\/cli|playwright-core)\/[A-Za-z0-9._/-]+$/.test(file.path)
      || file.path.includes('/../') || file.path <= previous || ![0o444, 0o555].includes(file.mode)
      || !Number.isInteger(file.size) || file.size < 0 || file.size > 8_388_608 || !/^[0-9a-f]{64}$/.test(file.sha256)
      || typeof file.contents !== 'string') throw new Error('Playwright transport artifact file is invalid.');
    const contents = Buffer.from(file.contents, 'base64');
    if (contents.toString('base64') !== file.contents || contents.length !== file.size || sha256Bytes(contents) !== file.sha256) {
      throw new Error('Playwright transport artifact file bytes are invalid.');
    }
    files.push({ path: file.path, mode: file.mode, size: file.size, sha256: file.sha256, contents });
    previous = file.path;
  }
  const entry = files.find(file => file.path === payload.entry);
  if (!entry || entry.mode !== 0o555) throw new Error('Playwright transport entrypoint is invalid.');
  const token = Object.freeze({ artifactSha256: expectedSha256, format: TRANSPORT_FORMAT });
  TRANSPORT_TOKENS.set(token, {
    entry: payload.entry,
    files,
    runtimePolicy: validateRuntimePolicy(runtimePolicy),
    chromePolicy: validateChromePolicy(chromePolicy),
  });
  return token;
}

const DEFAULT_CAPTURED_TRANSPORT = process.argv[1]?.startsWith('--') ? undefined : capturePlaywrightTransport();
export const phase9CapturedPlaywrightTransport = DEFAULT_CAPTURED_TRANSPORT;

async function materializePlaywrightTransport(token) {
  if (!TRANSPORT_TOKENS.has(token)) throw new Error('Captured Playwright transport is required.');
  const captured = TRANSPORT_TOKENS.get(token);
  let root;
  for (let attempt = 0; attempt < 8 && root === undefined; attempt += 1) {
    const candidate = `${TRANSPORT_ROOT_PREFIX}${randomBytes(24).toString('hex')}`;
    try { await mkdir(candidate, { mode: 0o700 }); root = candidate; } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
    }
  }
  if (root === undefined) throw new Error('Fresh Playwright transport materialization failed.');
  await chmod(root, 0o700);
  const initialRootMetadata = lstatSync(root);
  const rootIdentity = Object.freeze({ dev: initialRootMetadata.dev, ino: initialRootMetadata.ino, mode: 0o700 });
  const identities = new Map();
  try {
    for (const file of captured.files) {
      const path = `${root}/${file.path}`;
      await mkdir(dirname(path), { recursive: true, mode: 0o700 });
      const descriptor = await open(
        path, fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY | fsConstants.O_NOFOLLOW, 0o600,
      );
      try {
        await descriptor.writeFile(file.contents); await descriptor.sync(); await descriptor.chmod(file.mode);
        const metadata = await descriptor.stat();
        if (!metadata.isFile() || metadata.nlink !== 1 || metadata.size !== file.size
          || (metadata.mode & 0o777) !== file.mode) throw new Error('Materialized Playwright transport metadata changed.');
        identities.set(file.path, Object.freeze({
          dev: metadata.dev, ino: metadata.ino, nlink: metadata.nlink, size: metadata.size,
          mode: metadata.mode & 0o777,
        }));
      } finally { await descriptor.close(); }
    }
    const directoryPaths = [...new Set(captured.files.flatMap(file => {
      const components = dirname(file.path).split('/');
      return components.map((_, index) => components.slice(0, index + 1).join('/'));
    }))].sort();
    const directoryIdentities = new Map(directoryPaths.map(relativePath => {
      const metadata = lstatSync(`${root}/${relativePath}`);
      if (!metadata.isDirectory() || metadata.isSymbolicLink() || (metadata.mode & 0o777) !== 0o700) {
        throw new Error('Materialized Playwright transport directory changed.');
      }
      return [relativePath, Object.freeze({ dev: metadata.dev, ino: metadata.ino, mode: 0o700 })];
    }));
    return Object.freeze({
      root, entrypoint: `${root}/${captured.entry}`, captured, identities, directoryIdentities, rootIdentity,
    });
  } catch (error) {
    rmSync(root, { recursive: true, force: true }); throw error;
  }
}

const listRelativeFiles = (root, relative = '') => readdirSync(`${root}/${relative}`, { withFileTypes: true })
  .flatMap(entry => {
    const child = relative ? `${relative}/${entry.name}` : entry.name;
    return entry.isDirectory() ? listRelativeFiles(root, child) : [child];
  }).sort();

const verifyMaterializedPlaywrightTransport = materialized => {
  const rootMetadata = lstatSync(materialized.root);
  if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink() || realpathSync(materialized.root) !== materialized.root
    || rootMetadata.dev !== materialized.rootIdentity.dev || rootMetadata.ino !== materialized.rootIdentity.ino
    || (rootMetadata.mode & 0o777) !== materialized.rootIdentity.mode) {
    throw new Error('Materialized Playwright transport integrity changed.');
  }
  for (const [relativePath, identity] of materialized.directoryIdentities) {
    const path = `${materialized.root}/${relativePath}`;
    const metadata = lstatSync(path);
    if (!metadata.isDirectory() || metadata.isSymbolicLink() || realpathSync(path) !== path
      || metadata.dev !== identity.dev || metadata.ino !== identity.ino
      || (metadata.mode & 0o777) !== identity.mode) {
      throw new Error('Materialized Playwright transport directory integrity changed.');
    }
  }
  const inventory = listRelativeFiles(materialized.root);
  if (inventory.length !== materialized.captured.files.length
    || inventory.some((path, index) => path !== materialized.captured.files[index].path)) {
    throw new Error('Materialized Playwright transport inventory changed.');
  }
  for (const file of materialized.captured.files) {
    const path = `${materialized.root}/${file.path}`;
    const metadata = lstatSync(path);
    const identity = materialized.identities.get(file.path);
    if (!metadata.isFile() || metadata.isSymbolicLink() || realpathSync(path) !== path
      || metadata.dev !== identity.dev || metadata.ino !== identity.ino || metadata.nlink !== 1
      || metadata.size !== identity.size || (metadata.mode & 0o777) !== identity.mode
      || sha256Bytes(readFileSync(path)) !== file.sha256) {
      throw new Error('Materialized Playwright transport integrity changed.');
    }
  }
};

export function buildPlaywrightTransportEnvironment(
  source = process.env, { guardianMarkerName, temporaryDirectory } = {},
) {
  const allowed = ['HOME', 'TMPDIR', 'LANG', 'LC_ALL', 'USER', 'LOGNAME', '__CF_USER_TEXT_ENCODING'];
  const env = {};
  for (const key of allowed) if (typeof source?.[key] === 'string' && source[key].length <= 4096) env[key] = source[key];
  if (temporaryDirectory !== undefined) {
    if (typeof temporaryDirectory !== 'string' || !temporaryDirectory.startsWith('/')
      || resolve(temporaryDirectory) !== temporaryDirectory || source?.TMPDIR !== temporaryDirectory) {
      throw new Error('Exact Playwright temporary directory is invalid.');
    }
    const metadata = lstatSync(temporaryDirectory);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()
      || (metadata.mode & 0o777) !== 0o700) {
      throw new Error('Exact Playwright temporary directory is invalid.');
    }
  }
  if (guardianMarkerName !== undefined) {
    if (typeof guardianMarkerName !== 'string'
      || sha256Bytes(Buffer.from(guardianMarkerName, 'utf8')) !== GUARDIAN_MARKER_NAME_SHA256
      || !/^[0-9a-f]{64}$/.test(source?.[guardianMarkerName] ?? '')) {
      throw new Error('Exact guardian marker environment is invalid.');
    }
    env[guardianMarkerName] = source[guardianMarkerName];
  }
  return Object.freeze({
    ...env,
    PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
    NO_UPDATE_NOTIFIER: '1', CI: '1',
    npm_config_offline: 'true', NPM_CONFIG_OFFLINE: 'true',
    npm_config_update_notifier: 'false', NPM_CONFIG_UPDATE_NOTIFIER: 'false',
  });
}

async function verifyExternalChrome(argv, options) {
  if (!argv.includes('open') || !argv.includes('--browser') || !argv.includes('chrome')) return;
  const policy = validateChromePolicy(options.chromePolicy ?? TRANSPORT_TOKENS.get(options.transport)?.chromePolicy ?? DEFAULT_CHROME_POLICY);
  const chrome = lstatSync(policy.binaryPath);
  const bytes = readFileSync(policy.binaryPath);
  if (!chrome.isFile() || chrome.isSymbolicLink() || realpathSync(policy.binaryPath) !== policy.binaryPath
    || (chrome.mode & 0o111) === 0 || bytes.length !== chrome.size || sha256Bytes(bytes) !== policy.binarySha256) {
    throw new Error('External system Chrome identity changed.');
  }
  await verifySignedPath(policy.appPath, policy, options.env, 'External system Chrome');
  const after = lstatSync(policy.binaryPath);
  if (after.dev !== chrome.dev || after.ino !== chrome.ino || after.size !== chrome.size
    || after.mtimeMs !== chrome.mtimeMs || after.ctimeMs !== chrome.ctimeMs) {
    throw new Error('External system Chrome identity changed.');
  }
}

export async function auditPlaywrightTransportFetches({ transport = DEFAULT_CAPTURED_TRANSPORT } = {}) {
  const captured = TRANSPORT_TOKENS.get(transport);
  if (!captured) throw new Error('Captured Playwright transport is required.');
  const env = { ...buildPlaywrightTransportEnvironment(), PHASE9_TRANSPORT_FETCH_AUDIT: '1' };
  const result = await defaultExecute([captured.runtimePolicy.path, 'captured-playwright-transport', 'list', '--json'], {
    cwd: process.cwd(), env, timeoutMs: 30_000, maxOutputBytes: 1_048_576, transport,
  });
  if (result.exitCode !== 0 || result.stderr !== 'phase9-transport-fetch-calls=0\n') {
    throw new Error('Playwright transport performed or could not audit a Node-side fetch.');
  }
  const output = JSON.parse(result.stdout);
  if (!output || !Array.isArray(output.browsers)) throw new Error('Playwright transport fetch audit response is invalid.');
  return Object.freeze({ fetchCalls: 0, browsers: output.browsers.length });
}

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

const iterativePercentDecode = input => {
  if (typeof input !== 'string') return null;
  let value = input;
  for (let round = 0; ; round += 1) {
    const layer = inspectPercentLayer(value);
    if (layer.malformed) return null;
    if (!layer.encoded) return value;
    if (round === MAX_PERCENT_DECODE_ROUNDS) return null;
    const decoded = decodePercentLayer(value);
    if (decoded === null || decoded === value) return null;
    value = decoded;
  }
};

const rawContainsIdentifier = (value, identifiers) => {
  const visit = current => {
    if (typeof current === 'string') {
      const decoded = iterativePercentDecode(current);
      return decoded === null || identifiers.some(identifier => decoded.includes(identifier));
    }
    if (!current || typeof current !== 'object') return false;
    if (Array.isArray(current)) return current.some(visit);
    return Object.entries(current).some(([key, child]) => visit(key) || visit(child));
  };
  return visit(value);
};

const normalizeHeaders = value => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  if (entries.length > MAX_RAW_HEADERS) return null;
  const headers = {};
  let bytes = 0;
  for (const [rawName, rawValue] of entries) {
    if (typeof rawName !== 'string' || typeof rawValue !== 'string') return null;
    const name = rawName.toLowerCase();
    if (!/^[a-z0-9-]+$/.test(name) || Object.hasOwn(headers, name)) return null;
    bytes += name.length + rawValue.length;
    if (bytes > MAX_RAW_HEADER_BYTES) return null;
    headers[name] = rawValue;
  }
  return headers;
};

const BROWSER_PRODUCER_HEADERS = new Set([
  'accept', 'origin', 'referer', 'sec-ch-ua', 'sec-ch-ua-mobile', 'sec-ch-ua-platform', 'user-agent',
]);
const FIRESTORE_AUTH_HEADERS = new Set([
  'authorization', 'content-type', 'google-cloud-resource-prefix', 'x-firebase-appcheck',
  'x-firebase-gmpid', 'x-goog-api-client', 'x-goog-request-params',
]);
const FIRESTORE_DATABASE = `projects/${STAGING_PROJECT_ID}/databases/(default)`;
const FIRESTORE_REQUEST_PARAMS = `project_id=${STAGING_PROJECT_ID}`;

const hasOnlyAllowedHeaders = (headers, allowed) => (
  headers !== null && Object.keys(headers).every(name => BROWSER_PRODUCER_HEADERS.has(name) || allowed.has(name))
);

const validBearer = value => typeof value === 'string' && /^Bearer [A-Za-z0-9._~-]+$/.test(value);
const validFirebaseAppId = value => typeof value === 'string' && /^1:\d{5,20}:web:[a-f0-9]{16,64}$/.test(value);
const exactBrowserProducerHeaders = (headers, referer) => {
  const required = [...BROWSER_PRODUCER_HEADERS];
  if (required.some(name => !Object.hasOwn(headers ?? {}, name))) return false;
  if (
    headers.accept !== '*/*'
    || headers.origin !== STAGING_ORIGIN
    || headers.referer !== referer
    || headers['sec-ch-ua-mobile'] !== '?0'
    || headers['sec-ch-ua-platform'] !== '"macOS"'
    || !/^Mozilla\/5\.0 \(Macintosh; Intel Mac OS X 10_15_7\) AppleWebKit\/537\.36 \(KHTML, like Gecko\) (?:HeadlessChrome|Chrome)\/\d+\.\d+\.\d+\.\d+ Safari\/537\.36$/.test(headers['user-agent'])
  ) return false;
  const brand = /^"[^"\r\n]{1,32}";v="\d{1,3}", "Google Chrome";v="(\d{1,3})", "Chromium";v="\1"$/;
  return brand.test(headers['sec-ch-ua']);
};

const exactJoinFrame = value => value === `${STAGING_ORIGIN}/teams/join`;

const exactFirestoreRestHeaders = value => {
  const headers = normalizeHeaders(value);
  return hasOnlyAllowedHeaders(headers, FIRESTORE_AUTH_HEADERS)
    && exactBrowserProducerHeaders(headers, `${STAGING_ORIGIN}/`)
    && headers['content-type'] === 'text/plain'
    && headers['google-cloud-resource-prefix'] === FIRESTORE_DATABASE
    && headers['x-goog-request-params'] === FIRESTORE_REQUEST_PARAMS
    && typeof headers['x-goog-api-client'] === 'string'
    && headers['x-goog-api-client'] === 'gl-js/ fire/10.14.1'
    && validFirebaseAppId(headers['x-firebase-gmpid'])
    && validBearer(headers.authorization)
    && (!Object.hasOwn(headers, 'x-firebase-appcheck') || validBearer(`Bearer ${headers['x-firebase-appcheck']}`));
};

const exactJoinAdminHeaders = value => {
  const headers = normalizeHeaders(value);
  const allowed = new Set(['authorization']);
  return hasOnlyAllowedHeaders(headers, allowed)
    && exactBrowserProducerHeaders(headers, `${STAGING_ORIGIN}/teams/join`)
    && validBearer(headers.authorization)
    && headers.accept === '*/*';
};

const exactListenTransportHeaders = (value, method) => {
  const headers = normalizeHeaders(value);
  const allowed = new Set(['content-type']);
  if (!hasOnlyAllowedHeaders(headers, allowed) || !exactBrowserProducerHeaders(headers, `${STAGING_ORIGIN}/`)) return false;
  if (method === 'GET') return !Object.hasOwn(headers, 'content-type');
  return [
    'application/x-www-form-urlencoded',
    'application/x-www-form-urlencoded;charset=UTF-8',
    'text/plain;charset=UTF-8',
  ].includes(headers['content-type']);
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


const classifyFixtureResourceScopesValue = (
  signal, runId, alias, stagingOrigin, stagingProjectId, activeListenTargetIds = new Set(),
) => {
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
  let invalidEvidenceCount = 0;
  const add = value => evidence.add(value);
  const unknown = () => {
    invalidEvidenceCount += 1;
    add('unscoped-resource');
  };
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
  if (signal.url.length === 0 || signal.url.length > MAX_RAW_URL_BYTES) {
    unknown();
    return result();
  }
  const target = parseAbsoluteUrlValue(signal.url);
  if (!target) {
    unknown();
    return result();
  }
  const method = typeof signal.method === 'string' ? signal.method.toUpperCase() : '';
  if (target.origin === stagingOrigin && target.pathname === '/api/schools/admins') {
    const identifiers = typeof runId === 'string'
      ? [runId, `${runId}-team-a`, `${runId}-team-b`, `${runId}-league`]
      : [];
    const exactShape = method === 'PATCH'
      && signal.resourceType === 'fetch'
      && target.search === ''
      && target.hash === ''
      && signal.body === ''
      && exactJoinAdminHeaders(signal.headers)
      && exactJoinFrame(signal.frameUrl)
      && !rawContainsIdentifier([
        signal.url, signal.method, signal.resourceType, signal.headers, signal.body, signal.frameUrl,
      ], identifiers);
    if (exactShape) add('join-admin-patch');
    else unknown();
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
  if (typeof signal.body !== 'string' || signal.body.length > MAX_RAW_BODY_BYTES) {
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
  const boundedInteger = (value, maximum) => Number.isSafeInteger(value) && value >= 0 && value <= maximum;
  const boundedPositiveInteger = (value, maximum) => boundedInteger(value, maximum) && value > 0;
  const parseBoundedDecimal = (value, maximum) => {
    if (typeof value !== 'string' || !/^(?:0|[1-9]\d*)$/.test(value) || value.length > 10) return null;
    const parsed = Number(value);
    return boundedInteger(parsed, maximum) ? parsed : null;
  };
  const exactKeys = (value, required, optional = []) => {
    if (!isRecord(value)) return false;
    const keys = Object.keys(value);
    return required.every(key => keys.includes(key))
      && keys.every(key => required.includes(key) || optional.includes(key));
  };
  const decodePath = value => iterativePercentDecode(value);
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
      'zx', 't', 'gsessionid', 'OSID', 'OAID',
    ]);
    if (keys.some(key => !allowed.has(key))) return null;
    const value = key => entries.find(([candidate]) => candidate === key)?.[1];
    const present = key => keys.includes(key);
    const digits = key => !present(key) || parseBoundedDecimal(value(key), MAX_LISTEN_OFFSET) !== null;
    const token = key => !present(key) || /^[A-Za-z0-9_-]{1,512}$/.test(value(key));
    if (
      value('database') !== database
      || value('VER') !== '8'
      || !/^[a-z0-9]{1,128}$/.test(value('zx') ?? '')
      || !/^[1-3]$/.test(value('t') ?? '')
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
        else if (segments.length === 4 && childCollection === 'teamMemberships') add('self-memberships-document');
        else unknown();
      } else if (segments.length === 2) add('foreign-user-resource');
      else unknown();
      return;
    }
    if (collection === 'teams') {
      if (segments.length !== 2) unknown();
      else if (id === teamA) add(source === 'query' ? 'fixture-team-a-query' : 'fixture-team-a-document');
      else if (id === teamB) add(source === 'query' ? 'fixture-team-b-query' : 'fixture-team-b-document');
      else add('other-tenant-resource');
      return;
    }
    if (collection === 'leagues') {
      if (segments.length !== 2) unknown();
      else if (id === fixtureLeague) add(source === 'query' ? 'fixture-league-query' : 'fixture-league-document');
      else add('other-tenant-resource');
      return;
    }
    if (collection === 'players') {
      if (segments.length === 2) add('foreign-player-resource');
      else unknown();
      return;
    }
    if (collection === 'plans') {
      if (segments.length === 2) add('plans-reference-data');
      else unknown();
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
    const invalidBefore = invalidEvidenceCount;
    if (!exactKeys(addTarget, ['targetId'], ['documents', 'query', 'resumeToken', 'readTime', 'expectedCount'])) {
      unknown();
      return false;
    }
    if (!boundedPositiveInteger(addTarget.targetId, MAX_LISTEN_TARGET_ID)) {
      unknown();
      return false;
    }
    const hasResumeToken = Object.hasOwn(addTarget, 'resumeToken');
    const hasReadTime = Object.hasOwn(addTarget, 'readTime');
    const hasExpectedCount = Object.hasOwn(addTarget, 'expectedCount');
    if (hasResumeToken && (
      typeof addTarget.resumeToken !== 'string'
      || !/^[A-Za-z0-9+/_=-]+$/.test(addTarget.resumeToken)
    )) {
      unknown();
      return false;
    }
    if (hasReadTime && (
      typeof addTarget.readTime !== 'string'
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{9}Z$/.test(addTarget.readTime)
    )) {
      unknown();
      return false;
    }
    if (hasResumeToken && hasReadTime) {
      unknown();
      return false;
    }
    if (hasExpectedCount && (
      !boundedInteger(addTarget.expectedCount, MAX_LISTEN_EXPECTED_COUNT)
      || (!hasResumeToken && !hasReadTime)
    )) {
      unknown();
      return false;
    }
    const hasDocuments = isRecord(addTarget.documents);
    const hasQuery = isRecord(addTarget.query);
    if (hasDocuments === hasQuery) {
      unknown();
      return false;
    }
    if (hasDocuments) {
      const documents = addTarget.documents;
      if (!exactKeys(documents, ['documents']) || !Array.isArray(documents.documents) || documents.documents.length !== 1) {
        unknown();
      } else classifyDocumentName(documents.documents[0]);
    }
    if (hasQuery) classifyQuery(addTarget.query);
    return invalidEvidenceCount === invalidBefore;
  };
  const validLabels = value => (
    exactKeys(value, ['goog-listen-tags'])
    && ['existence-filter-mismatch', 'existence-filter-mismatch-bloom', 'limbo-document']
      .includes(value['goog-listen-tags'])
  );
  const classifyListenMessage = (message, draftTargetIds) => {
    if (!isRecord(message) || message.database !== database) {
      unknown();
      return false;
    }
    const hasAddTarget = Object.hasOwn(message, 'addTarget');
    const hasRemoveTarget = Object.hasOwn(message, 'removeTarget');
    if (hasAddTarget === hasRemoveTarget) {
      unknown();
      return false;
    }
    if (hasAddTarget) {
      const exactMessage = exactKeys(message, ['database', 'addTarget'], ['labels']);
      const exactLabels = !Object.hasOwn(message, 'labels') || validLabels(message.labels);
      if (!exactMessage || !exactLabels) unknown();
      const exactTarget = classifyTarget(message.addTarget);
      if (!exactMessage || !exactLabels || !exactTarget) return false;
      const targetId = message.addTarget.targetId;
      if (draftTargetIds.has(targetId) || draftTargetIds.size >= MAX_ACTIVE_LISTEN_TARGETS) {
        unknown();
        return false;
      }
      draftTargetIds.add(targetId);
      return true;
    }
    if (!exactKeys(message, ['database', 'removeTarget'])
      || !boundedPositiveInteger(message.removeTarget, MAX_LISTEN_TARGET_ID)) {
      unknown();
      return false;
    }
    if (!draftTargetIds.has(message.removeTarget)) {
      unknown();
      return false;
    }
    draftTargetIds.delete(message.removeTarget);
    add('firestore-transport-control');
    return true;
  };
  const parseListenBody = body => {
    if (typeof body !== 'string' || body.length === 0 || body.length > MAX_RAW_BODY_BYTES) return null;
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
    if (!keys.includes('count') || !keys.includes('ofs')) return null;
    const count = parseBoundedDecimal(get('count'), MAX_LISTEN_MESSAGES);
    const offset = parseBoundedDecimal(get('ofs'), MAX_LISTEN_OFFSET);
    if (count === null || offset === null) return null;
    const hasHeaders = keys.includes('headers');
    const expectedKeyCount = 2 + (hasHeaders ? 1 : 0) + count;
    if (keys.length !== expectedKeyCount) return null;
    for (let index = 0; index < count; index += 1) {
      if (!keys.includes(`req${index}___data__`)) return null;
    }
    if (hasHeaders) {
      const headerBlock = get('headers');
      if (typeof headerBlock !== 'string' || headerBlock.length === 0 || headerBlock.length > 32_768
        || !headerBlock.endsWith('\r\n')) return null;
      const allowedHeaders = new Set([
        'authorization', 'content-type', 'google-cloud-resource-prefix', 'x-firebase-appcheck',
        'x-firebase-gmpid', 'x-goog-api-client', 'x-goog-request-params',
      ]);
      const headerNames = [];
      const headerValues = {};
      for (const line of headerBlock.slice(0, -2).split('\r\n')) {
        const separator = line.indexOf(':');
        const name = line.slice(0, separator).toLowerCase();
        const headerValue = line.slice(separator + 1);
        if (separator <= 0 || !allowedHeaders.has(name) || headerValue.length === 0) return null;
        headerNames.push(name);
        headerValues[name] = headerValue;
      }
      if (headerNames.length !== new Set(headerNames).size) return null;
      if (
        !validBearer(headerValues.authorization)
        || headerValues['content-type'] !== 'text/plain'
        || headerValues['google-cloud-resource-prefix'] !== database
        || !validFirebaseAppId(headerValues['x-firebase-gmpid'])
        || headerValues['x-goog-request-params'] !== `project_id=${stagingProjectId}`
        || headerValues['x-goog-api-client'] !== 'gl-js/ fire/10.14.1'
        || (Object.hasOwn(headerValues, 'x-firebase-appcheck') && !validBearer(`Bearer ${headerValues['x-firebase-appcheck']}`))
      ) return null;
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
  if (path !== target.pathname) unknown();
  if (!['fetch', 'xhr', 'other'].includes(signal.resourceType)) {
    unknown();
    return result();
  }
  if (!exactJoinFrame(signal.frameUrl)) {
    unknown();
    return result();
  }
  const documentMarker = `/v1/${databaseRoot}/`;
  if (path.startsWith(documentMarker) && !path.endsWith(':runQuery')) {
    if (method !== 'GET' || target.search !== '' || target.hash !== ''
      || signal.body !== '' || !exactFirestoreRestHeaders(signal.headers)) unknown();
    else classifyDocumentName(`${databaseRoot}/${path.slice(documentMarker.length)}`);
    return result();
  }
  const runQueryPrefix = `/v1/${databaseRoot}`;
  if (path === `${runQueryPrefix}:runQuery` || (path.startsWith(`${runQueryPrefix}/`) && path.endsWith(':runQuery'))) {
    if (method !== 'POST' || target.search !== '' || target.hash !== ''
      || typeof signal.body !== 'string' || signal.body.length === 0 || signal.body.length > MAX_RAW_BODY_BYTES
      || !exactFirestoreRestHeaders(signal.headers)) {
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
  if (!listenQueryKind || !exactListenTransportHeaders(signal.headers, method)) {
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
  else if (parsed.hasHeaders !== (listenQueryKind === 'initial-forward')) unknown();
  else if (parsed.control) add('firestore-transport-control');
  else {
    const draftTargetIds = new Set(activeListenTargetIds);
    let requestStateValid = true;
    for (const message of parsed.messages) {
      if (!classifyListenMessage(message, draftTargetIds)) requestStateValid = false;
    }
    if (requestStateValid) {
      activeListenTargetIds.clear();
      for (const targetId of draftTargetIds) activeListenTargetIds.add(targetId);
    }
  }
  return result();
};

export function classifyFixtureResourceScopes(signal, { runId, alias } = {}) {
  assertRunId(runId);
  if (alias !== 'qa-no-team') throw new Error('Fixture resource scoping currently requires qa-no-team.');
  return classifyFixtureResourceScopesValue(signal, runId, alias, STAGING_ORIGIN, STAGING_PROJECT_ID, new Set());
}

const installRecorderSource = () => String.raw`async (page) => {
  // phase9:install
  const boundedString = (state, value, maxBytes) => {
    if (typeof value !== 'string' || value.length > maxBytes) {
      state.overflow += 1;
      return null;
    }
    return value;
  };
  const boundedHeaders = (state, value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      state.overflow += 1;
      return null;
    }
    const entries = Object.entries(value);
    if (entries.length > ${MAX_RAW_HEADERS}) {
      state.overflow += 1;
      return null;
    }
    let bytes = 0;
    const headers = {};
    for (const [name, headerValue] of entries) {
      if (typeof name !== 'string' || typeof headerValue !== 'string') {
        state.overflow += 1;
        return null;
      }
      bytes += name.length + headerValue.length;
      if (bytes > ${MAX_RAW_HEADER_BYTES}) {
        state.overflow += 1;
        return null;
      }
      headers[name] = headerValue;
    }
    return headers;
  };
  const boundedPush = (state, key, value) => {
    if (state[key].length >= ${MAX_SIGNAL_COUNT}) {
      state.overflow += 1;
      return;
    }
    state[key].push(value);
  };
  const isExpectedPriorDocumentRscAbort = input => {
    try {
      if (typeof input?.failureText !== 'string' || input.failureText.toUpperCase() !== 'NET::ERR_ABORTED'
        || input?.method !== 'GET' || input?.resourceType !== 'fetch' || input?.isNavigationRequest !== false
        || input?.isMainFrame !== true || input?.isRscRequest !== true
        || !Number.isSafeInteger(input?.startHardNavigationGeneration) || input.startHardNavigationGeneration < 0
        || !Number.isSafeInteger(input?.currentHardNavigationGeneration) || input.currentHardNavigationGeneration < 0
        || input.startHardNavigationGeneration > input.currentHardNavigationGeneration
        || typeof input?.url !== 'string') return false;
      const origin = ${JSON.stringify(STAGING_ORIGIN)};
      if (input.url !== origin && !input.url.startsWith(origin + '/')) return false;
      const path = input.url.slice(origin.length).split('?', 1)[0].split('#', 1)[0];
      return !path.includes('%') && !path.includes('\\') && path !== '/api' && !path.startsWith('/api/');
    } catch {
      return false;
    }
  };
  const isExpectedPriorDocumentFirestoreListenAbort = ${isExpectedPriorDocumentFirestoreListenAbort.toString()};
  const classifyRequestFailureSignal = input => {
    try {
    const failureText = typeof input?.failureText === 'string' ? input.failureText.toUpperCase() : '';
    let failureClass = 'other';
    if (failureText.includes('ERR_ABORTED')) failureClass = 'aborted';
    else if (failureText.includes('ERR_TIMED_OUT') || failureText.includes('ERR_CONNECTION_TIMED_OUT')) failureClass = 'timeout';
    else if (failureText.includes('ERR_NAME_NOT_RESOLVED') || failureText.includes('ERR_DNS_')) failureClass = 'name-resolution';
    else if (failureText.includes('ERR_CONNECTION_') || failureText.includes('ERR_NETWORK_CHANGED')
      || failureText.includes('ERR_INTERNET_DISCONNECTED') || failureText.includes('ERR_ADDRESS_UNREACHABLE')) failureClass = 'connection';
    else if (failureText.includes('ERR_CERT_') || failureText.includes('ERR_SSL_') || failureText.includes('ERR_TLS_')) failureClass = 'tls';
    else if (failureText.includes('ERR_BLOCKED_BY_') || failureText.includes('ERR_ACCESS_DENIED')
      || failureText.includes('ERR_DISALLOWED_URL_SCHEME') || failureText.includes('ERR_UNSAFE_PORT')) failureClass = 'policy-blocked';
    const resourceType = ['fetch', 'xhr'].includes(input?.resourceType) ? input.resourceType : 'other';
    let targetClass = 'other';
    if (input?.isNavigationRequest === true && input?.isMainFrame === true) targetClass = 'document';
    else if (typeof input?.url === 'string') {
      const url = input.url;
      if (url.startsWith('https://firestore.googleapis.com/')) targetClass = 'firestore';
      else if (${JSON.stringify([...IDENTITY_HOSTS])}.some(host => url.startsWith('https://' + host + '/'))) targetClass = 'identity';
      else {
        const origin = ${JSON.stringify(STAGING_ORIGIN)};
        if (url === origin || url.startsWith(origin + '/')) {
          const pathname = url.slice(origin.length).split('?', 1)[0].split('#', 1)[0];
          if (pathname.startsWith('/api/')) {
            targetClass = ${JSON.stringify([...NON_PROTECTED_API_PATHS])}.includes(pathname) ? 'public-api' : 'protected-api';
          } else if (['script', 'stylesheet', 'image', 'media', 'font'].includes(input?.resourceType)) targetClass = 'static';
        }
      }
    }
    let navigationRelationship = 'unknown';
    if (input?.isNavigationRequest === false) navigationRelationship = 'subresource';
    else if (input?.isNavigationRequest === true && input?.isMainFrame === true
      && Number.isSafeInteger(input.startGeneration) && input.startGeneration >= 0
      && Number.isSafeInteger(input.currentGeneration) && input.currentGeneration >= 0) {
      if (input.startGeneration === input.currentGeneration) navigationRelationship = 'current-document';
      else if (input.startGeneration < input.currentGeneration) navigationRelationship = 'prior-document';
    }
    return { failureClass, targetClass, resourceType, navigationRelationship };
    } catch {
      return { failureClass: 'other', targetClass: 'other', resourceType: 'other', navigationRelationship: 'unknown' };
    }
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
    if (!globalThis.__phase9TeamSelectionObserverInstalled) {
      globalThis.__phase9TeamSelectionObserverInstalled = true;
      try {
        const initialValue = localStorage.getItem('sf_session_team_id');
        if (initialValue) void globalThis.__phase9RecordTeamSelection(initialValue);
        const originalSetItem = Storage.prototype.setItem;
        Storage.prototype.setItem = function phase9ObservedStorageSetItem(key, value) {
          const result = originalSetItem.call(this, key, value);
          if (this === localStorage && key === 'sf_session_team_id') {
            void globalThis.__phase9RecordTeamSelection(String(value));
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
    globalThis.__phase9VisibleSentinels = () => {
      refreshCandidates();
      return [...new Set(visibleSignals(definitions).map(signal => signal.sentinel))];
    };
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
      navigationGeneration: 0,
      hardNavigationGeneration: 0,
      rawRequests: [],
      rawSelections: [],
      renders: [],
      rawResponses: [],
      pageErrors: [],
      appConsoleErrors: [],
      requestFailureSignals: [],
      overflow: 0,
    };
    page.__phase9EvidenceRecorder = state;
    const requestMetadata = new WeakMap();
    page.on('framenavigated', frame => {
      if (frame === page.mainFrame()) state.navigationGeneration += 1;
    });
    const captureRequest = request => {
      let frameUrl = null;
      try {
        frameUrl = boundedString(state, request.frame()?.url() ?? '', ${MAX_RAW_URL_BYTES});
      } catch {
        frameUrl = null;
      }
      const postData = request.postData();
      return {
        url: boundedString(state, request.url(), ${MAX_RAW_URL_BYTES}),
        method: boundedString(state, request.method(), 16),
        resourceType: boundedString(state, request.resourceType(), 32),
        headers: boundedHeaders(state, request.headers()),
        body: boundedString(state, postData === null ? '' : postData, ${MAX_RAW_BODY_BYTES}),
        frameUrl,
        navigationGeneration: state.navigationGeneration,
      };
    };
    page.on('request', request => {
      let isNavigationRequest = false;
      let isMainFrame = false;
      let isRscRequest = false;
      let url = null;
      let method = null;
      let resourceType = null;
      try { isNavigationRequest = request.isNavigationRequest(); } catch {}
      try { isMainFrame = request.frame() === page.mainFrame(); } catch {}
      try { isRscRequest = request.headers()?.rsc === '1'; } catch {}
      try { url = request.url(); } catch {}
      try { method = request.method(); } catch {}
      try { resourceType = request.resourceType(); } catch {}
      if (isNavigationRequest && isMainFrame) state.hardNavigationGeneration += 1;
      requestMetadata.set(request, {
        navigationGeneration: state.navigationGeneration,
        hardNavigationGeneration: state.hardNavigationGeneration,
        isNavigationRequest,
        isMainFrame,
        isRscRequest,
        url,
        method,
        resourceType,
      });
      boundedPush(state, 'rawRequests', captureRequest(request));
    });
    page.on('response', response => {
      boundedPush(state, 'rawResponses', {
        ...captureRequest(response.request()),
        status: response.status(),
      });
    });
    page.on('pageerror', () => boundedPush(state, 'pageErrors', 'PAGE_ERROR'));
    page.on('console', message => {
      if (message.type() === 'error') boundedPush(state, 'appConsoleErrors', 'APPLICATION_CONSOLE_ERROR');
    });
    page.on('requestfailed', request => {
      const metadata = requestMetadata.get(request);
      const input = {
        startGeneration: metadata?.navigationGeneration,
        currentGeneration: state.navigationGeneration,
        startHardNavigationGeneration: metadata?.hardNavigationGeneration,
        currentHardNavigationGeneration: state.hardNavigationGeneration,
        isNavigationRequest: metadata?.isNavigationRequest === true,
        isMainFrame: metadata?.isMainFrame === true,
        isRscRequest: metadata?.isRscRequest === true,
        url: metadata?.url,
        method: metadata?.method,
        resourceType: metadata?.resourceType,
      };
      try { input.failureText = request.failure()?.errorText; } catch {}
      if (isExpectedPriorDocumentRscAbort(input)
        || isExpectedPriorDocumentFirestoreListenAbort(input)) return;
      boundedPush(state, 'requestFailureSignals', classifyRequestFailureSignal(input));
    });
    await page.exposeFunction('__phase9RecordRender', signal => {
      if (!signal || !['heading', 'status'].includes(signal.kind)
        || typeof signal.pathname !== 'string' || typeof signal.sentinel !== 'string') return;
      boundedPush(state, 'renders', { kind: signal.kind, pathname: signal.pathname, sentinel: signal.sentinel });
    });
    await page.exposeFunction('__phase9RecordTeamSelection', value => {
      const rawValue = boundedString(state, value, ${MAX_RAW_URL_BYTES});
      if (rawValue !== null) boundedPush(state, 'rawSelections', rawValue);
    });
    await page.addInitScript(initializeRenderObserver);
    await page.evaluate(initializeRenderObserver);
  }
  return {
    pageId: page.__phase9EvidenceRecorder.pageId,
    navigationGeneration: page.__phase9EvidenceRecorder.navigationGeneration,
  };
}`;

const MARK_SOURCE = String.raw`async (page) => {
  // phase9:mark
  const state = page.__phase9EvidenceRecorder;
  if (!state) throw new Error('SIGNAL_RECORDER_NOT_ARMED');
  state.sequence += 1;
  state.rawRequests = [];
  state.rawSelections = [];
  state.renders = [];
  state.rawResponses = [];
  state.pageErrors = [];
  state.appConsoleErrors = [];
  state.requestFailureSignals = [];
  state.overflow = 0;
  const cookies = await page.context().cookies(${JSON.stringify(STAGING_ORIGIN)});
  return {
    pageId: state.pageId,
    sequence: state.sequence,
    navigationGeneration: state.navigationGeneration,
    sessionPresentAtMark: cookies.some(cookie => cookie.name === ${JSON.stringify(SESSION_COOKIE_NAME)} && cookie.value.length > 0),
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
  const renderHistory = state.renders;
  const protectedHeadings = ${JSON.stringify(PROTECTED_PAGE_HEADINGS)};
  const cookies = await page.context().cookies(${JSON.stringify(STAGING_ORIGIN)});
  return {
    pageId: state.pageId,
    navigationGeneration: state.navigationGeneration,
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
    rawRequests: state.rawRequests,
    rawResponses: state.rawResponses,
    rawTeamSelections: state.rawSelections,
    pageErrors: state.pageErrors,
    appConsoleErrors: state.appConsoleErrors,
    unexpectedRequestFailures: state.requestFailureSignals,
    overflow: state.overflow,
    renderPath: render.path,
    renderSentinel: render.sentinels[0] || '',
    viewport: page.viewportSize(),
    sessionPresentAtMark: mark.sessionPresentAtMark,
  };
}`;

const sanitizeFixturePath = (value, fixtureRunId) => {
  if (typeof value !== 'string') return '';
  const decoded = iterativePercentDecode(value);
  if (decoded === null) return 'invalid:';
  if (!fixtureRunId) return decoded;
  return decoded.split('/').map(segment => (
    segment.includes(fixtureRunId) ? ':fixture-resource' : segment
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

const closeRenderPath = (value, finalUrl) => {
  if (PUBLIC_RENDER_PATHS.includes(value)) return value;
  if (typeof finalUrl === 'string') {
    try {
      const protocol = new URL(finalUrl).protocol;
      if (['about:', 'data:', 'blob:', 'file:'].includes(protocol)) return 'offline:';
    } catch {
      // The caller below rejects any noncanonical hosted render path.
    }
  }
  throw new Error('Recorder render path must use the closed source-backed enum.');
};

const NON_PROTECTED_API_PATHS = new Set([
  '/api/auth/session',
  '/api/contact',
  '/api/email/reset-password',
  '/api/health',
  '/api/newsletter/subscribe',
  '/api/newsletter/unsubscribe',
]);

const REQUEST_FAILURE_CLASSES = Object.freeze([
  'aborted', 'timeout', 'name-resolution', 'connection', 'tls', 'policy-blocked', 'other',
]);
const REQUEST_FAILURE_TARGET_CLASSES = Object.freeze([
  'document', 'public-api', 'protected-api', 'firestore', 'identity', 'static', 'other',
]);
const REQUEST_FAILURE_RESOURCE_TYPES = Object.freeze(['fetch', 'xhr', 'other']);
const REQUEST_FAILURE_NAVIGATION_RELATIONSHIPS = Object.freeze([
  'current-document', 'prior-document', 'subresource', 'unknown',
]);
const IDENTITY_HOSTS = new Set([
  'identitytoolkit.googleapis.com', 'securetoken.googleapis.com', 'firebaseinstallations.googleapis.com',
]);

export function isExpectedPriorDocumentRscAbort(input) {
  try {
    if (
      typeof input?.failureText !== 'string' || input.failureText.toUpperCase() !== 'NET::ERR_ABORTED'
      || input?.method !== 'GET' || input?.resourceType !== 'fetch' || input?.isNavigationRequest !== false
      || input?.isMainFrame !== true || input?.isRscRequest !== true
      || !Number.isSafeInteger(input?.startHardNavigationGeneration) || input.startHardNavigationGeneration < 0
      || !Number.isSafeInteger(input?.currentHardNavigationGeneration) || input.currentHardNavigationGeneration < 0
      || input.startHardNavigationGeneration > input.currentHardNavigationGeneration
      || typeof input?.url !== 'string'
    ) return false;
    const target = new URL(input.url);
    return !target.username && !target.password && target.origin === STAGING_ORIGIN
      && !target.pathname.includes('%') && !target.pathname.includes('\\')
      && target.pathname !== '/api' && !target.pathname.startsWith('/api/');
  } catch {
    return false;
  }
}

export function isExpectedPriorDocumentFirestoreListenAbort(input) {
  try {
    if (
      typeof input?.failureText !== 'string' || input.failureText.toUpperCase() !== 'NET::ERR_ABORTED'
      || !['GET', 'POST'].includes(input?.method)
      || !['fetch', 'xhr'].includes(input?.resourceType)
      || input?.isNavigationRequest !== false || input?.isMainFrame !== true
      || input?.isRscRequest !== false
      || !Number.isSafeInteger(input?.startHardNavigationGeneration) || input.startHardNavigationGeneration < 0
      || !Number.isSafeInteger(input?.currentHardNavigationGeneration) || input.currentHardNavigationGeneration < 0
      || input.startHardNavigationGeneration > input.currentHardNavigationGeneration
      || typeof input?.url !== 'string'
    ) return false;
    const prefix = 'https://firestore.googleapis.com/google.firestore.v1.Firestore/Listen/channel?';
    if (!input.url.startsWith(prefix) || input.url.includes('#')) return false;
    const rawQuery = input.url.slice(prefix.length);
    if (rawQuery.length < 1 || rawQuery.length > 4_096) return false;
    const entries = [];
    for (const part of rawQuery.split('&')) {
      const separator = part.indexOf('=');
      if (separator <= 0) return false;
      entries.push([
        decodeURIComponent(part.slice(0, separator).replaceAll('+', ' ')),
        decodeURIComponent(part.slice(separator + 1).replaceAll('+', ' ')),
      ]);
    }
    const keys = entries.map(([key]) => key);
    if (keys.length !== new Set(keys).size) return false;
    const allowed = new Set([
      'database', 'VER', 'RID', 'CVER', 'X-HTTP-Session-Id', 'TYPE', 'SID', 'AID', 'CI', 'TO',
      'zx', 't', 'gsessionid', 'OSID', 'OAID',
    ]);
    if (keys.some(key => !allowed.has(key))) return false;
    const value = key => entries.find(([candidate]) => candidate === key)?.[1];
    const present = key => keys.includes(key);
    const digits = key => !present(key) || /^(?:0|[1-9][0-9]{0,9})$/.test(value(key));
    const token = key => !present(key) || /^[A-Za-z0-9_-]{1,512}$/.test(value(key));
    if (
      value('database') !== 'projects/the-squad-v2-staging/databases/(default)'
      || value('VER') !== '8'
      || !/^[a-z0-9]{1,128}$/.test(value('zx') ?? '')
      || !/^[1-3]$/.test(value('t') ?? '')
      || !digits('AID') || !digits('TO')
      || !token('SID') || !token('gsessionid') || !token('OSID') || !token('OAID')
      || present('OSID') !== present('OAID')
    ) return false;
    let queryKind = null;
    const rid = value('RID');
    if (/^[0-9]+$/.test(rid ?? '')) {
      if (value('TYPE') === 'terminate') {
        if (present('SID') && !present('CVER') && !present('AID') && !present('CI')
          && !present('TO') && !present('X-HTTP-Session-Id')) queryKind = 'terminate';
      } else if (present('CVER')) {
        if (value('CVER') === '22' && !present('SID') && !present('AID') && !present('CI')
          && !present('TO') && (!present('TYPE') || value('TYPE') === 'init')
          && (!present('X-HTTP-Session-Id') || value('X-HTTP-Session-Id') === 'gsessionid')) {
          queryKind = 'initial-forward';
        }
      } else if (present('SID') && present('AID') && !present('CI') && !present('TO')
        && !present('TYPE') && !present('X-HTTP-Session-Id')) queryKind = 'forward';
    } else if (rid === 'rpc' && present('SID') && present('AID') && ['0', '1'].includes(value('CI'))
      && value('TYPE') === 'xmlhttp' && !present('CVER') && !present('X-HTTP-Session-Id')) {
      queryKind = 'back-channel';
    }
    return input.method === 'GET'
      ? ['back-channel', 'terminate'].includes(queryKind)
      : ['initial-forward', 'forward', 'terminate'].includes(queryKind);
  } catch {
    return false;
  }
}

export function classifyRequestFailureSignal(input) {
  try {
  const failureText = typeof input?.failureText === 'string' ? input.failureText.toUpperCase() : '';
  let failureClass = 'other';
  if (failureText.includes('ERR_ABORTED')) failureClass = 'aborted';
  else if (failureText.includes('ERR_TIMED_OUT') || failureText.includes('ERR_CONNECTION_TIMED_OUT')) failureClass = 'timeout';
  else if (failureText.includes('ERR_NAME_NOT_RESOLVED') || failureText.includes('ERR_DNS_')) failureClass = 'name-resolution';
  else if (
    failureText.includes('ERR_CONNECTION_') || failureText.includes('ERR_NETWORK_CHANGED')
    || failureText.includes('ERR_INTERNET_DISCONNECTED') || failureText.includes('ERR_ADDRESS_UNREACHABLE')
  ) failureClass = 'connection';
  else if (failureText.includes('ERR_CERT_') || failureText.includes('ERR_SSL_') || failureText.includes('ERR_TLS_')) failureClass = 'tls';
  else if (
    failureText.includes('ERR_BLOCKED_BY_') || failureText.includes('ERR_ACCESS_DENIED')
    || failureText.includes('ERR_DISALLOWED_URL_SCHEME') || failureText.includes('ERR_UNSAFE_PORT')
  ) failureClass = 'policy-blocked';

  const resourceType = REQUEST_FAILURE_RESOURCE_TYPES.includes(input?.resourceType) ? input.resourceType : 'other';
  let targetClass = 'other';
  if (input?.isNavigationRequest === true && input?.isMainFrame === true) targetClass = 'document';
  else if (typeof input?.url === 'string') {
    try {
      const target = new URL(input.url);
      if (!target.username && !target.password && ['http:', 'https:'].includes(target.protocol)) {
        if (target.hostname === 'firestore.googleapis.com') targetClass = 'firestore';
        else if (IDENTITY_HOSTS.has(target.hostname)) targetClass = 'identity';
        else if (target.origin === STAGING_ORIGIN) {
          if (target.pathname.startsWith('/api/')) {
            targetClass = NON_PROTECTED_API_PATHS.has(target.pathname) ? 'public-api' : 'protected-api';
          } else if (['script', 'stylesheet', 'image', 'media', 'font'].includes(input?.resourceType)) targetClass = 'static';
        }
      }
    } catch {
      targetClass = 'other';
    }
  }

  let navigationRelationship = 'unknown';
  if (input?.isNavigationRequest === false) navigationRelationship = 'subresource';
  else if (input?.isNavigationRequest === true && input?.isMainFrame === true) {
    if (
      Number.isSafeInteger(input.startGeneration) && input.startGeneration >= 0
      && Number.isSafeInteger(input.currentGeneration) && input.currentGeneration >= 0
    ) {
      if (input.startGeneration === input.currentGeneration) navigationRelationship = 'current-document';
      else if (input.startGeneration < input.currentGeneration) navigationRelationship = 'prior-document';
    }
  }
  return { failureClass, targetClass, resourceType, navigationRelationship };
  } catch {
    return { failureClass: 'other', targetClass: 'other', resourceType: 'other', navigationRelationship: 'unknown' };
  }
}

const isClosedRequestFailureSignal = value => (
  value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === 4
  && ['failureClass', 'targetClass', 'resourceType', 'navigationRelationship'].every(key => Object.hasOwn(value, key))
  && REQUEST_FAILURE_CLASSES.includes(value.failureClass)
  && REQUEST_FAILURE_TARGET_CLASSES.includes(value.targetClass)
  && REQUEST_FAILURE_RESOURCE_TYPES.includes(value.resourceType)
  && REQUEST_FAILURE_NAVIGATION_RELATIONSHIPS.includes(value.navigationRelationship)
);

export function isProtectedResource(signal) {
  if (!signal || typeof signal !== 'object') return false;
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

const targetKindFromRawUrl = value => {
  if (typeof value !== 'string') return 'firestore-protected';
  const target = parseAbsoluteUrlValue(value);
  if (!target || !['http:', 'https:'].includes(target.protocol)) return null;
  const decodedPath = iterativePercentDecode(target.pathname);
  const pathname = decodedPath ?? target.pathname;
  if (target.hostname === 'firestore.googleapis.com') {
    if (pathname === '/google.firestore.v1.Firestore/Listen/channel') return 'firestore-listen';
    if (/^\/v1\/projects\/[^/]+\/databases\/[^/]+\/documents(?:\/[^:]*)?:runQuery$/.test(pathname)) {
      return 'firestore-run-query';
    }
    if (/^\/v1\/projects\/[^/]+\/databases\/[^/]+\/documents\//.test(pathname)) return 'firestore-document';
    return 'firestore-protected';
  }
  if (target.origin !== STAGING_ORIGIN || !pathname.startsWith('/api/')) return null;
  if (NON_PROTECTED_API_PATHS.has(pathname)) return null;
  if (pathname === '/api/schools/admins') return 'staging-join-admin-api';
  return 'staging-protected-api';
};

const failClosedScopes = Object.freeze({
  scopeEvidence: ['unscoped-resource'],
  resourceScopes: ['unscoped'],
});

const sanitizeResourceSignal = (
  item, fixtureRunId, activeListenTargetIds = new Set(), { forceUnscoped = false } = {},
) => {
  const raw = item && typeof item === 'object' && !Array.isArray(item) ? item : {};
  const targetKind = targetKindFromRawUrl(raw.url);
  if (targetKind === null) return null;
  const completeRaw = typeof raw.url === 'string'
    && raw.url.length > 0 && raw.url.length <= MAX_RAW_URL_BYTES
    && typeof raw.method === 'string'
    && typeof raw.resourceType === 'string'
    && typeof raw.body === 'string'
    && raw.body.length <= MAX_RAW_BODY_BYTES
    && typeof raw.frameUrl === 'string'
    && normalizeHeaders(raw.headers) !== null;
  const normalizedMethod = typeof raw.method === 'string' ? raw.method.toUpperCase() : '';
  const method = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'].includes(normalizedMethod) ? normalizedMethod : 'GET';
  const resourceType = ['fetch', 'xhr', 'other'].includes(raw.resourceType) ? raw.resourceType : 'other';
  const scopes = !forceUnscoped && completeRaw && fixtureRunId
    ? classifyFixtureResourceScopesValue(
      raw, fixtureRunId, 'qa-no-team', STAGING_ORIGIN, STAGING_PROJECT_ID, activeListenTargetIds,
    )
    : !forceUnscoped && completeRaw && targetKind === 'staging-join-admin-api'
      ? classifyFixtureResourceScopesValue(
        raw, undefined, 'qa-no-team', STAGING_ORIGIN, STAGING_PROJECT_ID, activeListenTargetIds,
      )
      : failClosedScopes;
  const signal = {
    targetKind,
    method,
    resourceType,
    initiatingFrameUrl: cleanUrl(raw.frameUrl, fixtureRunId),
    scopeEvidence: [...scopes.scopeEvidence],
    resourceScopes: [...scopes.resourceScopes],
  };
  validateResourceSignal(signal, 'Locally derived resource signal');
  return signal;
};

const sanitizeHttpResult = item => {
  const signal = sanitizeResourceSignal(item, undefined);
  if (signal === null) return null;
  const status = Number.isInteger(item?.status) && item.status >= 0 ? item.status : 0;
  return { targetKind: signal.targetKind, status };
};

const classifyTeamSelections = (values, fixtureRunId) => values.map(value => {
  const decoded = iterativePercentDecode(value);
  if (decoded !== null && fixtureRunId && decoded === `${fixtureRunId}-team-a`) return 'tenant-team-a';
  if (decoded !== null && fixtureRunId && decoded === `${fixtureRunId}-team-b`) return 'tenant-team-b';
  return 'tenant-other';
});

const bindRecorderGeneration = (raw, listenTargetState) => {
  const generation = raw?.navigationGeneration;
  if (!Number.isSafeInteger(generation) || generation < 0 || generation < listenTargetState.generation) {
    listenTargetState.activeTargetIds.clear();
    return false;
  }
  if (generation > listenTargetState.generation) {
    listenTargetState.activeTargetIds.clear();
    listenTargetState.generation = generation;
  }
  return true;
};

const bindFinalRecorderGeneration = (value, listenTargetState) => {
  if (!Object.hasOwn(value, 'navigationGeneration')) return;
  const generation = value.navigationGeneration;
  if (!Number.isSafeInteger(generation) || generation < 0 || generation < listenTargetState.generation) {
    listenTargetState.activeTargetIds.clear();
    throw new Error('Recorder navigation generation must be monotonic.');
  }
  if (generation > listenTargetState.generation) {
    listenTargetState.activeTargetIds.clear();
    listenTargetState.generation = generation;
  }
};

const sanitizeWindow = (value, {
  fixtureRunId, publicPageId, listenTargetState, expectedViewport, requireAuthenticatedStart = false,
  onDiagnosticCheckpoint,
} = {}) => {
  onDiagnosticCheckpoint?.('window-sample-contract', 'sample-contract-invalid');
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Signal sample must be an object.');
  const booleanFields = ['terminalReached', 'loadingVisible', 'sessionPresent', 'protectedRender'];
  const stringFields = ['pageId', 'finalUrl', 'finalPath', 'renderPath', 'renderSentinel'];
  const arrayFields = [
    'visibleSentinels', 'renderSignals', 'rawRequests', 'rawResponses', 'rawTeamSelections',
    'pageErrors', 'appConsoleErrors', 'unexpectedRequestFailures',
  ];
  const complete = booleanFields.every(field => typeof value[field] === 'boolean')
    && stringFields.every(field => typeof value[field] === 'string')
    && arrayFields.every(field => Array.isArray(value[field]))
    && ['unavailable', 'none', 'other'].includes(value.redirectReason)
    && Number.isInteger(value.overflow) && value.overflow >= 0;
  if (!complete) throw new Error('Recorder must return a complete signal sample.');
  onDiagnosticCheckpoint?.('window-observation-contract', 'observation-contract-invalid');
  if (expectedViewport && (
    value.viewport?.width !== expectedViewport.width || value.viewport?.height !== expectedViewport.height
  )) throw new Error('Recorder viewport does not match the verified context viewport.');
  if (requireAuthenticatedStart && value.sessionPresentAtMark !== true) {
    throw new Error('Retained stale session was not authenticated at action start.');
  }
  if (typeof publicPageId !== 'string' || !/^phase9-page-\d+$/.test(publicPageId)) {
    throw new Error('Client must assign a fixed local page identifier.');
  }
  onDiagnosticCheckpoint?.('window-visible-contract', 'visible-contract-invalid');
  if (value.visibleSentinels.some(item => typeof item !== 'string')) throw new Error('Recorder must return a complete signal sample.');
  if (value.visibleSentinels.some(item => !PUBLIC_VISIBLE_SENTINELS.includes(item))) {
    throw new Error('Recorder visible sentinels must use the closed source-backed enum.');
  }
  if (value.renderSentinel !== '' && !PUBLIC_VISIBLE_SENTINELS.includes(value.renderSentinel)) {
    throw new Error('Recorder render sentinel must use the closed source-backed enum.');
  }
  for (const field of ['rawRequests', 'rawResponses', 'rawTeamSelections']) {
    if (value[field].length > MAX_SIGNAL_COUNT) throw new Error(`Recorder ${field} exceeds the bounded signal history.`);
  }
  const rawRequestFailureSignals = Array.from(value.unexpectedRequestFailures);
  if (rawRequestFailureSignals.length !== value.unexpectedRequestFailures.length
    || rawRequestFailureSignals.length > MAX_SIGNAL_COUNT
    || rawRequestFailureSignals.some(item => !isClosedRequestFailureSignal(item))) {
    throw new Error('Recorder request failures must use the closed recorder schema.');
  }
  if (
    !listenTargetState
    || !(listenTargetState.activeTargetIds instanceof Set)
    || !Number.isSafeInteger(listenTargetState.generation)
    || listenTargetState.generation < 0
  ) throw new Error('Client must own private Listen target state.');
  onDiagnosticCheckpoint?.('window-resource-contract', 'resource-contract-invalid');
  const requests = [];
  for (const item of value.rawRequests) {
    const generationTrusted = bindRecorderGeneration(item, listenTargetState);
    const signal = sanitizeResourceSignal(
      item,
      fixtureRunId,
      listenTargetState.activeTargetIds,
      { forceUnscoped: !generationTrusted },
    );
    if (signal) requests.push(signal);
  }
  bindFinalRecorderGeneration(value, listenTargetState);
  const http = value.rawResponses.map(sanitizeHttpResult).filter(Boolean);
  const teamSelectionSignals = classifyTeamSelections(value.rawTeamSelections, fixtureRunId);
  const requestFailureMultiplicity = rawRequestFailureSignals.length === 1 ? 'single' : 'multiple';
  const unexpectedRequestFailureSignals = rawRequestFailureSignals.map(item => ({
    failureClass: item.failureClass,
    targetClass: item.targetClass,
    resourceType: item.resourceType,
    navigationRelationship: item.navigationRelationship,
    multiplicity: requestFailureMultiplicity,
  }));
  onDiagnosticCheckpoint?.('window-render-contract', 'render-contract-invalid');
  if (value.renderSignals.some(item => (
    !item || typeof item !== 'object' || Array.isArray(item)
    || !['heading', 'status'].includes(item.kind)
    || typeof item.pathname !== 'string' || typeof item.sentinel !== 'string'
  ))) throw new Error('Recorder must return typed render signals.');
  const renderSignals = value.renderSignals.slice(0, MAX_SIGNAL_COUNT).map(item => {
    const pathname = closeRenderPath(item.pathname, value.finalUrl);
    if (
      (item.kind === 'heading' && !LANDING_SENTINELS.includes(item.sentinel))
      || (item.kind === 'status' && (
        !['/login', 'offline:'].includes(pathname) || item.sentinel !== PENDING_UNAVAILABLE_SENTINEL
      ))
    ) throw new Error('Recorder render signals must use closed source-backed paths and sentinels.');
    return { kind: item.kind, pathname, sentinel: item.sentinel };
  });
  const protectedRequests = requests.filter(isProtectedResource);
  const protectedListeners = protectedRequests.filter(signal => signal.targetKind === 'firestore-listen');
  const sanitized = {
    pageId: publicPageId,
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
    protectedListenerStarts: protectedListeners.length,
    listenerSignals: protectedListeners,
    teamSelectionSignals,
    relevantHttpResults: http,
    pageErrors: count(value.pageErrors),
    appConsoleErrors: count(value.appConsoleErrors),
    unexpectedRequestFailures: count(value.unexpectedRequestFailures),
    unexpectedRequestFailureSignals,
    overflow: count(value.overflow),
  };
  onDiagnosticCheckpoint?.('window-output-contract', 'output-contract-invalid');
  assertNoFixtureIdentifierLeak(sanitized, 'Client action window');
  return sanitized;
};

const defaultExecute = async (argv, options) => {
  const captured = TRANSPORT_TOKENS.get(options.transport);
  if (!captured) throw new Error('Captured Playwright transport is required.');
  const [runtimePath, boundary, ...args] = argv;
  const runtimePolicy = validateRuntimePolicy(options.runtimePolicy ?? captured.runtimePolicy);
  if (runtimePath !== runtimePolicy.path || boundary !== 'captured-playwright-transport') {
    throw new Error('Pinned Node runtime command boundary is invalid.');
  }
  const materialized = await materializePlaywrightTransport(options.transport);
  try {
    await options.executionHooks?.beforeSpawn?.({
      root: materialized.root, entrypoint: materialized.entrypoint, runtimePath,
    });
    verifyMaterializedPlaywrightTransport(materialized);
    await verifyRuntime(runtimePolicy, options.env);
    verifyMaterializedPlaywrightTransport(materialized);
    await verifyExternalChrome(args, options);
    verifyMaterializedPlaywrightTransport(materialized);
    let child;
    const descriptorLaunch = Number.isSafeInteger(options.profileDirectoryDescriptor)
      && options.profileDirectoryDescriptor > 2;
    if (descriptorLaunch) verifyProfileDescriptorRuntime();
    await options.beforeSpawnCheck?.();
    const childArguments = descriptorLaunch
      ? ['-I', '-c', PROFILE_DESCRIPTOR_FCHDIR, runtimePolicy.path,
        '--input-type=commonjs', '--eval', PROFILE_DESCRIPTOR_LAUNCHER,
        '--', materialized.entrypoint, ...args]
      : [materialized.entrypoint, ...args];
    const completion = descriptorLaunch ? new Promise(resolvePromise => {
      const stdout = [];
      const stderr = [];
      let outputBytes = 0;
      let timedOut = false;
      let settled = false;
      const finish = result => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolvePromise({
          stdout: Buffer.concat(stdout).toString('utf8'),
          stderr: Buffer.concat(stderr).toString('utf8'),
          exitCode: result,
          timedOut,
        });
      };
      child = spawn(PROFILE_DESCRIPTOR_RUNTIME, childArguments, {
        argv0: PROFILE_DESCRIPTOR_RUNTIME,
        cwd: options.cwd,
        env: options.env,
        stdio: ['ignore', 'pipe', 'pipe', options.profileDirectoryDescriptor],
      });
      const collect = target => chunk => {
        outputBytes += chunk.length;
        if (outputBytes > options.maxOutputBytes) {
          child.kill('SIGKILL');
          return;
        }
        target.push(chunk);
      };
      child.stdout.on('data', collect(stdout));
      child.stderr.on('data', collect(stderr));
      child.once('error', () => finish(null));
      child.once('close', code => finish(Number.isInteger(code) ? code : null));
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, options.timeoutMs);
    }) : new Promise(resolvePromise => {
      child = execFile(runtimePolicy.path, childArguments, {
        argv0: runtimePolicy.path,
        cwd: options.cwd,
        env: options.env,
        timeout: options.timeoutMs,
        maxBuffer: options.maxOutputBytes,
        encoding: 'utf8',
      }, (error, stdout = '', stderr = '') => {
        resolvePromise({
          stdout,
          stderr,
          exitCode: error ? (Number.isInteger(error.code) ? error.code : null) : 0,
          timedOut: Boolean(error?.killed && error?.signal),
        });
      });
    });
    try {
      await options.executionHooks?.afterSpawn?.({
        pid: child.pid, root: materialized.root, entrypoint: materialized.entrypoint, runtimePath,
      });
    } catch (error) {
      child.kill('SIGKILL');
      await completion;
      throw error;
    }
    return await completion;
  } finally {
    rmSync(materialized.root, { recursive: true, force: true });
    if (existsSync(materialized.root)) throw new Error('Playwright transport materialization removal failed.');
  }
};

export async function executeCapturedPlaywrightTransportCommand(args, {
  transport = DEFAULT_CAPTURED_TRANSPORT, cwd = process.cwd(), timeoutMs = DEFAULT_TIMEOUT_MS,
  sourceEnvironment = process.env, guardianMarkerName, temporaryDirectory,
  executionHooks, runtimePolicy, chromePolicy, profileDirectoryDescriptor, beforeSpawnCheck,
} = {}) {
  if (!Array.isArray(args) || !(
    (args.length === 1 && args[0] === 'list')
    || (args.length === 2 && /^-s=[A-Za-z0-9_-]{1,64}$/.test(args[0]) && args[1] === 'close')
  )) throw new Error('Captured Playwright transport command is outside the closed guardian surface.');
  const captured = TRANSPORT_TOKENS.get(transport);
  if (!captured) throw new Error('Captured Playwright transport is required.');
  if (beforeSpawnCheck !== undefined && typeof beforeSpawnCheck !== 'function') {
    throw new Error('Playwright CLI spawn precondition must be a function.');
  }
  const selectedRuntime = validateRuntimePolicy(runtimePolicy ?? captured.runtimePolicy);
  const baseEnvironment = buildPlaywrightTransportEnvironment(sourceEnvironment, {
    guardianMarkerName, temporaryDirectory,
  });
  const env = profileDirectoryDescriptor === undefined ? baseEnvironment : Object.freeze({
    ...baseEnvironment, TMPDIR: '.', PHASE9_PROFILE_CWD: 'descriptor',
  });
  const result = await defaultExecute([selectedRuntime.path, 'captured-playwright-transport', ...args, '--json'], {
    cwd, env, timeoutMs, maxOutputBytes: MAX_OUTPUT_BYTES, transport, executionHooks, runtimePolicy: selectedRuntime,
    chromePolicy, profileDirectoryDescriptor, beforeSpawnCheck,
  });
  if (result.timedOut || result.exitCode !== 0) throw new Error('Captured Playwright transport command failed.');
  let output;
  try { output = JSON.parse(result.stdout); } catch { throw new Error('Captured Playwright transport response is invalid.'); }
  if (!output || typeof output !== 'object' || output.isError === true) throw new Error('Captured Playwright transport response is invalid.');
  return Object.hasOwn(output, 'result') ? output.result : output;
}

export function createPlaywrightCliClient({
  execute = defaultExecute,
  wrapperPath,
  transport = DEFAULT_CAPTURED_TRANSPORT,
  cwd = process.cwd(),
  env,
  sourceEnvironment = process.env,
  guardianMarkerName,
  executionHooks,
  runtimePolicy,
  chromePolicy,
  temporaryDirectory,
  verifyChromeBeforeLaunch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fixtureRunId,
  beforeCommand,
  profileDirectoryDescriptor,
  onDiagnosticCheckpoint,
} = {}) {
  if (typeof execute !== 'function') throw new Error('Playwright CLI execute transport must be a function.');
  if (wrapperPath !== undefined && (typeof wrapperPath !== 'string' || wrapperPath.length === 0)) throw new Error('Playwright CLI wrapper path is invalid.');
  if (wrapperPath === undefined && !TRANSPORT_TOKENS.has(transport)) throw new Error('Captured Playwright transport is required.');
  if (onDiagnosticCheckpoint !== undefined && typeof onDiagnosticCheckpoint !== 'function') {
    throw new Error('Diagnostic checkpoint hook must be a function.');
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) throw new Error('Playwright CLI timeout must be a positive integer.');
  if (beforeCommand !== undefined && typeof beforeCommand !== 'function') throw new Error('Playwright CLI command precondition must be a function.');
  if (profileDirectoryDescriptor !== undefined
    && (!Number.isSafeInteger(profileDirectoryDescriptor) || profileDirectoryDescriptor <= 2)) {
    throw new Error('Playwright CLI profile descriptor is invalid.');
  }
  if (fixtureRunId !== undefined) assertRunId(fixtureRunId);
  const opened = new Set();
  const currentTabs = new Map();
  const tabCounts = new Map();
  const armedTabs = new Set();
  const publicPageIds = new Map();
  const listenTargetStateByTab = new Map();
  const expectedViewportByTab = new Map();
  const authenticatedStartByTab = new Set();
  let publicPageSequence = 0;
  const captured = TRANSPORT_TOKENS.get(transport);
  const selectedRuntime = wrapperPath === undefined
    ? validateRuntimePolicy(runtimePolicy ?? captured.runtimePolicy)
    : runtimePolicy;
  const baseEnvironment = buildPlaywrightTransportEnvironment(env ?? sourceEnvironment, {
    guardianMarkerName, temporaryDirectory,
  });
  const closedEnvironment = profileDirectoryDescriptor === undefined ? baseEnvironment : Object.freeze({
    ...baseEnvironment, TMPDIR: '.', PHASE9_PROFILE_CWD: 'descriptor',
  });
  const tabKey = session => `${session}:${currentTabs.get(session) ?? 0}`;

  const command = async (args, session, { parseNestedJson = false } = {}) => {
    await beforeCommand?.();
    const sessionArgs = session ? [`-s=${session}`] : [];
    const argv = wrapperPath === undefined
      ? [selectedRuntime.path, 'captured-playwright-transport', ...sessionArgs, ...args, '--json']
      : [wrapperPath, ...sessionArgs, ...args, '--json'];
    let output;
    if (args[0] === 'open' && verifyChromeBeforeLaunch) {
      await verifyChromeBeforeLaunch([...sessionArgs, ...args, '--json']);
    }
    try {
      output = await execute(argv, {
        cwd, env: closedEnvironment, timeoutMs, maxOutputBytes: MAX_OUTPUT_BYTES, transport,
        executionHooks, runtimePolicy: selectedRuntime, chromePolicy, profileDirectoryDescriptor,
        beforeSpawnCheck: beforeCommand,
      });
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
    const key = tabKey(session);
    const installed = await executeRunCode(session, installRecorderSource());
    if (!publicPageIds.has(key)) {
      publicPageSequence += 1;
      publicPageIds.set(key, `phase9-page-${publicPageSequence}`);
    }
    listenTargetStateByTab.set(key, {
      activeTargetIds: new Set(),
      generation: Number.isSafeInteger(installed?.navigationGeneration) && installed.navigationGeneration >= 0
        ? installed.navigationGeneration
        : 0,
    });
    armedTabs.add(key);
  };
  const applyViewport = async (session, viewport) => {
    if (!viewport || !new Set(['390x844', '1440x900']).has(`${viewport.width}x${viewport.height}`)) {
      throw new Error('Viewport must be an exact reviewed Phase 9 viewport.');
    }
    const result = await executeRunCode(session, `async (page) => {
      await page.setViewportSize(${JSON.stringify(viewport)});
      return page.viewportSize();
    }`);
    if (result?.width !== viewport.width || result?.height !== viewport.height) {
      throw new Error('Playwright did not apply the exact context viewport.');
    }
    expectedViewportByTab.set(tabKey(session), Object.freeze({ ...viewport }));
    return `${result.width}x${result.height}`;
  };
  const forgetSession = session => {
    opened.delete(session); currentTabs.delete(session); tabCounts.delete(session);
    for (const collection of [armedTabs, publicPageIds, listenTargetStateByTab, expectedViewportByTab, authenticatedStartByTab]) {
      for (const key of [...collection.keys()]) if (key.startsWith(`${session}:`)) collection.delete(key);
    }
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
      onDiagnosticCheckpoint?.('observation-arm', 'observation-failed');
      const mark = await executeRunCode(session, MARK_SOURCE);
      const key = tabKey(session);
      const listenTargetState = listenTargetStateByTab.get(key);
      bindFinalRecorderGeneration(mark, listenTargetState);
      onDiagnosticCheckpoint?.('scenario-action', 'action-failed');
      await action();
      onDiagnosticCheckpoint?.('terminal-wait', 'terminal-not-reached');
      await terminal();
      onDiagnosticCheckpoint?.('observation-sample', 'observation-failed');
      const result = await executeRunCode(session, sampleSource(mark));
      if (!result || result.pageId !== mark.pageId) throw new Error('Action window must sample the same page as its pre-action mark.');
      onDiagnosticCheckpoint?.('window-validation', 'expectation-mismatch');
      const sample = sanitizeWindow(result, {
        fixtureRunId,
        publicPageId: publicPageIds.get(key),
        listenTargetState,
        expectedViewport: expectedViewportByTab.get(key),
        requireAuthenticatedStart: authenticatedStartByTab.delete(key),
        onDiagnosticCheckpoint,
      });
      return sample;
    },
    async tabNew(session, url = 'about:blank') {
      if (url !== 'about:blank') throw new Error('A new tab must open on about:blank before recorder arming.');
      const previousKey = tabKey(session);
      const viewport = expectedViewportByTab.get(previousKey);
      if (!viewport) throw new Error('A new tab requires an exact verified source viewport.');
      const result = await command(['tab-new', url], session);
      const index = tabCounts.get(session) ?? 1;
      tabCounts.set(session, index + 1);
      currentTabs.set(session, index);
      try {
        await applyViewport(session, viewport);
      } catch {
        try {
          await command(['close'], session);
          const inventory = await command(['list']);
          const names = inventory?.browsers?.map(item => typeof item === 'string' ? item : item?.name);
          if (!Array.isArray(names) || names.includes(session)) throw new Error('closure-unverified');
          forgetSession(session);
          throw new Error('New tab viewport application failed and the browser was closed.');
        } catch (closeError) {
          if (closeError?.message === 'New tab viewport application failed and the browser was closed.') throw closeError;
          throw new Error('New tab viewport failed; browser closure is unverified and ownership was retained.');
        }
      }
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
    async closeBrowser(session) {
      if (typeof session !== 'string' || !opened.has(session)) {
        throw new Error('Browser closure requires an exact session opened by this client.');
      }
      const result = await command(['close'], session);
      const inventory = await command(['list']);
      const names = inventory?.browsers?.map(item => typeof item === 'string' ? item : item?.name);
      if (!Array.isArray(names) || names.includes(session)) {
        throw new Error('Browser closure is unverified and session ownership was retained.');
      }
      forgetSession(session);
      return result;
    },
    listBrowsers: async () => command(['list']),
    closeAllBrowsers: async () => command(['close-all']),
  };
  CLIENT_INTERNALS.set(client, {
    executeRunCode, installRecorder, applyViewport, openBlank, command, opened, currentTabs, tabCounts, armedTabs,
    publicPageIds, listenTargetStateByTab, expectedViewportByTab, authenticatedStartByTab,
    nextPublicPageId: key => {
      if (!publicPageIds.has(key)) { publicPageSequence += 1; publicPageIds.set(key, `phase9-page-${publicPageSequence}`); }
    },
  });
  return client;
}

export function createPhase9ProductionCliClient(options = {}) {
  return createPlaywrightCliClient({ ...options, timeoutMs: 90_000 });
}

export async function acquireBlankBrowser(client, session) {
  const internals = CLIENT_INTERNALS.get(client);
  if (!internals) throw new Error('Browser acquisition requires a Playwright CLI client.');
  await internals.openBlank(session);
}

export async function armAcquiredSignalRecorder(client, session) {
  const internals = CLIENT_INTERNALS.get(client);
  if (!internals) throw new Error('Signal recorder requires a Playwright CLI client.');
  const current = await internals.executeRunCode(session, `async (page) => {
    // phase9:verify-about-blank
    return { url: page.url() };
  }`);
  if (current?.url !== 'about:blank') throw new Error('Signal recorder requires the exact current tab to be about:blank.');
  return internals.installRecorder(session);
}

export async function installSignalRecorder(client, session) {
  await acquireBlankBrowser(client, session);
  return armAcquiredSignalRecorder(client, session);
}

export async function setAndVerifyViewport(client, session, viewport) {
  const internals = CLIENT_INTERNALS.get(client);
  if (!internals) throw new Error('Viewport requires a Playwright CLI client.');
  return internals.applyViewport(session, viewport);
}

export async function attachExistingSignalRecorder(client, session, { width, height, marker, requireAuthenticated = false } = {}) {
  const internals = CLIENT_INTERNALS.get(client);
  if (!internals || typeof session !== 'string' || typeof marker !== 'string' || marker !== session) {
    throw new Error('Retained session attachment is invalid.');
  }
  const inventory = await internals.command(['list']);
  const matches = inventory?.browsers?.filter(item => (typeof item === 'string' ? item : item?.name) === session) ?? [];
  if (matches.length !== 1) throw new Error('Exact retained browser session is not live.');
  const result = await internals.executeRunCode(session, `async (page) => ({
    pageId: page.__phase9EvidenceRecorder?.pageId,
    navigationGeneration: page.__phase9EvidenceRecorder?.navigationGeneration,
    url: page.url(), viewport: page.viewportSize(), marker: page.__phase9RetainedSessionMarker,
  })`);
  const exactLocation = requireAuthenticated ? String(result?.url).startsWith(STAGING_ORIGIN) : result?.url === 'about:blank';
  if (!result?.pageId || result.marker !== marker || result.viewport?.width !== width || result.viewport?.height !== height
    || !exactLocation) throw new Error('Retained session identity or viewport changed before attachment.');
  internals.opened.add(session);
  internals.currentTabs.set(session, 0);
  internals.tabCounts.set(session, 1);
  const key = `${session}:0`;
  internals.nextPublicPageId(key);
  internals.armedTabs.add(key);
  internals.listenTargetStateByTab.set(key, { activeTargetIds: new Set(), generation: result.navigationGeneration ?? 0 });
  internals.expectedViewportByTab.set(key, Object.freeze({ width, height }));
  if (requireAuthenticated) internals.authenticatedStartByTab.add(key);
  return Object.freeze({ session, viewport: `${width}x${height}` });
}

export async function closeAndVerifyBrowsers(client) {
  await client.closeAllBrowsers();
  const result = await client.listBrowsers();
  if (!result || !Array.isArray(result.browsers)) throw new Error('Browser list response is incomplete.');
  if (result.browsers.length !== 0) throw new Error('Browser sessions remain after close-all.');
  return { browsers: [] };
}

async function smoke() {
  const client = createPlaywrightCliClient({
    temporaryDirectory: process.env.PHASE9_PLAYWRIGHT_TMP_ROOT,
  });
  const { observeAction } = await import('./signal-window.mjs');
  try {
    await installSignalRecorder(client, 'phase9-offline-smoke');
    await setAndVerifyViewport(client, 'phase9-offline-smoke', { width: 390, height: 844 });
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
