import assert from 'node:assert/strict';
import { isUtf8 } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import test from 'node:test';

function enumerateRepositoryFromGit(repositoryRoot = process.cwd()) {
  const tracked = execFileSync(
    'git',
    ['ls-files', '--cached', '--stage', '-z'],
    { cwd: repositoryRoot, encoding: 'utf8' },
  ).split('\0').filter(Boolean).map(record => {
    const match = /^(\d{6}) ([0-9a-f]{40,64}) (\d+)\t([\s\S]+)$/u.exec(record);
    if (!match) throw new Error('Git returned an invalid tracked-file record.');
    return { mode: match[1], oid: match[2], stage: Number(match[3]), file: match[4] };
  });
  const untracked = execFileSync(
    'git',
    ['ls-files', '--others', '--exclude-standard', '-z'],
    { cwd: repositoryRoot, encoding: 'utf8' },
  ).split('\0').filter(Boolean).map(file => ({ file }));
  return { tracked, untracked };
}

function repositoryPathIsConfined(file, repositoryRoot) {
  if (typeof file !== 'string' || file.length === 0 || isAbsolute(file)) return false;
  const fromRoot = relative(repositoryRoot, resolve(repositoryRoot, file));
  return fromRoot !== '' && !fromRoot.startsWith('..') && !isAbsolute(fromRoot);
}

let cachedGitBlobs = null;

function readGitBlobs(tracked, repositoryRoot) {
  const oids = [...new Set(tracked.map(entry => entry.oid))];
  const cacheKey = `${repositoryRoot}\0${oids.join('\0')}`;
  if (cachedGitBlobs?.key === cacheKey) return cachedGitBlobs.values;
  if (oids.length === 0) return new Map();
  const output = execFileSync('git', ['cat-file', '--batch'], {
    cwd: repositoryRoot,
    input: `${oids.join('\n')}\n`,
    maxBuffer: 1024 * 1024 * 1024,
  });
  const values = new Map();
  let offset = 0;
  for (const requestedOid of oids) {
    const headerEnd = output.indexOf(0x0a, offset);
    if (headerEnd === -1) throw new Error('Git blob batch omitted a header.');
    const [resolvedOid, type, sizeText] = output.subarray(offset, headerEnd).toString('ascii').split(' ');
    const size = Number(sizeText);
    if (resolvedOid !== requestedOid || type !== 'blob' || !Number.isSafeInteger(size) || size < 0) {
      throw new Error('Git blob batch returned an invalid header.');
    }
    const bodyStart = headerEnd + 1;
    const bodyEnd = bodyStart + size;
    if (bodyEnd >= output.length || output[bodyEnd] !== 0x0a) throw new Error('Git blob batch returned truncated bytes.');
    values.set(requestedOid, Buffer.from(output.subarray(bodyStart, bodyEnd)));
    offset = bodyEnd + 1;
  }
  if (offset !== output.length) throw new Error('Git blob batch returned unexpected trailing bytes.');
  cachedGitBlobs = { key: cacheKey, values };
  return values;
}

function repositoryScanFiles({
  repositoryRoot = process.cwd(),
  enumerateRepository = enumerateRepositoryFromGit,
  readBlob,
  lstat,
  readFile,
} = {}) {
  let repository;
  try {
    repository = enumerateRepository(repositoryRoot);
    if (!repository || !Array.isArray(repository.tracked) || !Array.isArray(repository.untracked)) {
      throw new Error('Repository enumeration returned an invalid shape.');
    }
  } catch {
    return [{ file: '<repository>', enumerationError: true }];
  }

  const entries = [];
  const regularTracked = repository.tracked.filter(entry => new Set(['100644', '100755']).has(entry.mode));
  let gitBlobs = null;
  if (!readBlob) {
    try {
      gitBlobs = readGitBlobs(regularTracked, repositoryRoot);
    } catch {
      // Each affected regular blob receives a fail-closed entry below.
    }
  }
  const loadBlob = readBlob || (entry => {
    if (!gitBlobs?.has(entry.oid)) throw new Error('Git blob is unavailable.');
    return gitBlobs.get(entry.oid);
  });
  for (const tracked of repository.tracked) {
    if (!repositoryPathIsConfined(tracked.file, repositoryRoot)) {
      return [{ file: '<repository>', confinementError: true }];
    }
    if (!new Set(['100644', '100755']).has(tracked.mode)) {
      entries.push({ file: tracked.file, contents: null, rawBytes: null });
      continue;
    }
    try {
      const rawBytes = Buffer.from(loadBlob(tracked, repositoryRoot));
      const contents = isUtf8(rawBytes) && !rawBytes.includes(0) ? rawBytes.toString('utf8') : null;
      entries.push({ file: tracked.file, contents, rawBytes });
    } catch {
      entries.push({ file: tracked.file, contents: null, rawBytes: null, blobReadError: true });
    }
  }

  const statFile = lstat || (file => lstatSync(resolve(repositoryRoot, file)));
  const readWorktreeFile = readFile || (file => readFileSync(resolve(repositoryRoot, file)));
  for (const untracked of repository.untracked) {
    if (!repositoryPathIsConfined(untracked.file, repositoryRoot)) {
      return [{ file: '<repository>', confinementError: true }];
    }
    let file;
    try {
      file = statFile(untracked.file);
    } catch {
      entries.push({ file: untracked.file, contents: null, rawBytes: null, statError: true });
      continue;
    }
    if (!file.isFile() || file.isSymbolicLink?.()) {
      entries.push({ file: untracked.file, contents: null, rawBytes: null });
      continue;
    }
    try {
      const rawBytes = Buffer.from(readWorktreeFile(untracked.file));
      const contents = isUtf8(rawBytes) && !rawBytes.includes(0) ? rawBytes.toString('utf8') : null;
      entries.push({ file: untracked.file, contents, rawBytes });
    } catch {
      entries.push({ file: untracked.file, contents: null, rawBytes: null, readError: true });
    }
  }
  return entries;
}

function scanRepresentations(file) {
  const representations = new Set();
  if (typeof file.contents === 'string') representations.add(file.contents);
  if (Buffer.isBuffer(file.rawBytes)) {
    representations.add(file.rawBytes.toString('latin1'));
    if (file.rawBytes.length % 2 === 0 && file.rawBytes.includes(0)) {
      representations.add(file.rawBytes.toString('utf16le'));
      const bigEndian = Buffer.from(file.rawBytes);
      bigEndian.swap16();
      representations.add(bigEndian.toString('utf16le'));
    }
  }
  return [...representations];
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseJson(contents) {
  try {
    return JSON.parse(contents);
  } catch {
    return null;
  }
}

function containsPhase7Manifest(value) {
  const pending = [value];
  while (pending.length > 0) {
    const candidate = pending.pop();
    if (Array.isArray(candidate)) {
      for (const child of candidate) pending.push(child);
      continue;
    }
    if (!isRecord(candidate)) continue;
    if (
      candidate.version === 2
      && typeof candidate.runId === 'string'
      && candidate.runId.startsWith('qa-phase7-')
      && candidate.projectId === 'the-squad-v2-staging'
      && Array.isArray(candidate.authUids)
      && Array.isArray(candidate.firestorePaths)
      && ['planned', 'partial', 'seeded', 'cleaned'].includes(candidate.state)
    ) return true;
    for (const child of Object.values(candidate)) pending.push(child);
  }
  return false;
}

function containsSecretJsonPayload(value) {
  const pending = [value];
  while (pending.length > 0) {
    const payload = pending.pop();
    if (Array.isArray(payload)) {
      for (const child of payload) pending.push(child);
      continue;
    }
    if (!isRecord(payload)) continue;
    if (payload.name === ['__', 'session'].join('') && typeof payload.value === 'string' && payload.value.length > 0) {
      return true;
    }
    for (const [key, candidate] of Object.entries(payload)) {
      const normalizedKey = key.toLowerCase();
      if (typeof candidate === 'string' && candidate.length > 0) {
        if (normalizedKey === ['private_', 'key'].join('')) return true;
        if (normalizedKey === ['pass', 'word'].join('')) return true;
        if (normalizedKey === 'type' && candidate === ['service_', 'account'].join('')) return true;
        if (
          /^(?:(?:access|refresh|id)_)?token$/u.test(normalizedKey)
          && credentialShaped(candidate)
        ) return true;
        if (new Set(['cookie', 'session']).has(normalizedKey) && credentialShaped(candidate)) return true;
      }
      if (candidate && typeof candidate === 'object') pending.push(candidate);
    }
  }
  return false;
}

function credentialShaped(value) {
  if (typeof value !== 'string') return false;
  const tokenShaped = candidate => (
    /^(?:ya29\.|1\/\/)[A-Za-z0-9._~-]{8,}$/u.test(candidate)
    || /^[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}$/u.test(candidate)
  );
  if (tokenShaped(value)) return true;
  const cookie = /(?:^|;\s*)[^=;\s]+\s*=\s*([^;\s]+)/u.exec(value);
  return Boolean(cookie && tokenShaped(cookie[1]));
}

function readJsonString(contents, start) {
  let escaped = false;
  for (let index = start + 1; index < contents.length; index += 1) {
    if (escaped) {
      escaped = false;
    } else if (contents[index] === '\\') {
      escaped = true;
    } else if (contents[index] === '"') {
      try {
        return { end: index, value: JSON.parse(contents.slice(start, index + 1)) };
      } catch {
        return { end: index, value: null };
      }
    }
  }
  return { end: contents.length - 1, value: null };
}

function skipWhitespace(contents, start) {
  let index = start;
  while (index < contents.length && /\s/u.test(contents[index])) index += 1;
  return index;
}

function containsEmbeddedSessionCookie(contents) {
  const objectFrames = [];
  for (let index = 0; index < contents.length; index += 1) {
    if (contents[index] === '{') {
      objectFrames.push({ hasSessionName: false, hasValue: false });
      continue;
    }
    if (contents[index] === '}') {
      objectFrames.pop();
      continue;
    }
    if (contents[index] !== '"') continue;

    const key = readJsonString(contents, index);
    if (objectFrames.length === 0) {
      index = key.end;
      continue;
    }
    const colon = skipWhitespace(contents, key.end + 1);
    if (key.value === null || contents[colon] !== ':') {
      index = key.end;
      continue;
    }
    const valueStart = skipWhitespace(contents, colon + 1);
    if (contents[valueStart] !== '"') {
      index = key.end;
      continue;
    }
    const value = readJsonString(contents, valueStart);
    const frame = objectFrames.at(-1);
    if (key.value === 'name' && value.value === ['__', 'session'].join('')) frame.hasSessionName = true;
    if (key.value === 'value' && typeof value.value === 'string' && value.value.length > 0) frame.hasValue = true;
    if (frame.hasSessionName && frame.hasValue) return true;
    index = value.end;
  }
  return false;
}

function decodedTextVariants(contents) {
  const texts = [];
  const queued = [contents];
  const seen = new Set();
  const byteBudget = (Buffer.byteLength(contents, 'utf8') * 4) + 65536;
  let consumed = 0;
  for (let queueIndex = 0; queueIndex < queued.length; queueIndex += 1) {
    const text = queued[queueIndex];
    if (seen.has(text)) continue;
    seen.add(text);
    consumed += Buffer.byteLength(text, 'utf8');
    if (consumed > byteBudget) return { texts, limitExceeded: true };
    texts.push(text);
    for (let index = 0; index < text.length; index += 1) {
      if (text[index] !== '"') continue;
      const parsed = readJsonString(text, index);
      if (typeof parsed.value === 'string' && parsed.value.includes('{') && !seen.has(parsed.value)) {
        queued.push(parsed.value);
      }
      index = parsed.end;
    }
  }
  return { texts, limitExceeded: false };
}

function jsonValuesInText(contents) {
  const values = [];
  const whole = parseJson(contents);
  if (whole !== null) return [whole];
  const objectStarts = [];
  for (let index = 0; index < contents.length; index += 1) {
    if (contents[index] === '"') {
      index = readJsonString(contents, index).end;
      continue;
    }
    if (contents[index] === '{') {
      objectStarts.push(index);
      continue;
    }
    if (contents[index] !== '}' || objectStarts.length === 0) continue;
    const start = objectStarts.pop();
    if (objectStarts.length > 0) continue;
    const parsed = parseJson(contents.slice(start, index + 1));
    if (parsed !== null) values.push(parsed);
  }
  return values;
}

function containsBase64ServiceAccount(contents) {
  const assignment = /FIREBASE_SERVICE_ACCOUNT_JSON["']?\s*(?::|=)\s*["']?([A-Za-z0-9+/_-]{40,}={0,2})/gu;
  for (const match of contents.matchAll(assignment)) {
    try {
      const decoded = Buffer.from(match[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
      const payload = JSON.parse(decoded);
      if (containsSecretJsonPayload(payload)) return true;
    } catch {
      // Only valid encoded service-account payloads are credential artifacts.
    }
  }
  return false;
}

function inspectStructuredContents(contents) {
  const variants = decodedTextVariants(contents);
  if (variants.limitExceeded) return { manifest: false, secret: false, limitExceeded: true };
  let manifest = false;
  let secret = false;
  const privateKeyMarker = ['-----BEGIN ', 'PRIVATE KEY-----'].join('');
  for (const text of variants.texts) {
    const values = jsonValuesInText(text);
    if (values.some(containsPhase7Manifest)) manifest = true;
    if (
      text.includes(privateKeyMarker)
      || containsBase64ServiceAccount(text)
      || values.some(containsSecretJsonPayload)
      || containsEmbeddedSessionCookie(text)
    ) secret = true;
  }
  return { manifest, secret, limitExceeded: false };
}

function fixtureArtifactViolations(files) {
  const credentialArtifact = /(?:^|\/)(?:qa-phase7|qa-fixture)[^/]*(?:credential|manifest|storage[-_]?state)[^/]*\.(?:json|env)$/i;
  const violations = new Set();
  for (const fileEntry of files) {
    const { file } = fileEntry;
    if (fileEntry.enumerationError) violations.add('<repository>: repository enumeration failed');
    if (fileEntry.confinementError) violations.add('<repository>: repository enumeration escaped the repository');
    if (fileEntry.statError) violations.add(`${file}: repository file could not be stated`);
    if (fileEntry.blobReadError) violations.add(`${file}: repository Git blob could not be read`);
    if (fileEntry.readError) violations.add(`${file}: repository regular file could not be read`);
    if (credentialArtifact.test(file)) violations.add(`${file}: tracked fixture credential/manifest artifact`);
    let manifest = false;
    let secret = false;
    let limitExceeded = false;
    for (const representation of scanRepresentations(fileEntry)) {
      const result = inspectStructuredContents(representation);
      manifest ||= result.manifest;
      secret ||= result.secret;
      limitExceeded ||= result.limitExceeded;
    }
    if (limitExceeded) violations.add(`${file}: repository structured-content scan limit exceeded`);
    if (manifest) violations.add(`${file}: tracked Phase 7 manifest payload`);
    if (secret) violations.add(`${file}: fixture secret material pattern`);
  }
  return [...violations];
}

test('tracked repository does not contain retired QA credentials or identifiers', () => {
  const retiredValues = [
    ['example', '@gmail.com'].join(''),
    ['tester_k995dt', '@example.com'].join(''),
    ['thisearlyseason', '@gmail.com'].join(''),
    ['password', '123'].join(''),
    ['Password', '123!'].join(''),
    ['00MS', 'YWPZ'].join(''),
    ['VaxrWL1o4Mhd60VoxE9o', 'TZFKCir1'].join(''),
    ['ai2QThECAwfkAFw608m7', 'TgPZTmk2'].join(''),
    ['localhost:', '9002'].join(''),
  ];

  const violations = [];
  for (const fileEntry of repositoryScanFiles()) {
    const { file } = fileEntry;
    for (const contents of scanRepresentations(fileEntry)) {
      for (const value of retiredValues) {
        if (!contents.includes(value)) continue;
        violations.push(`${file}: contains a retired QA credential or identifier`);
        break;
      }
    }
  }

  assert.deepEqual([...new Set(violations)], []);
});

test('tracked repository rejects fixture credential artifacts and secret material patterns', () => {
  assert.deepEqual(fixtureArtifactViolations(repositoryScanFiles()), []);
});

test('fixture hygiene regression recognizes unsafe artifact names and secret material', () => {
  const privateKey = ['-----BEGIN ', 'PRIVATE KEY-----'].join('');
  assert.deepEqual(fixtureArtifactViolations([
    { file: 'tmp/qa-phase7-run-credential.json', contents: '{}' },
    { file: 'docs/leaked.txt', contents: privateKey },
  ]), [
    'tmp/qa-phase7-run-credential.json: tracked fixture credential/manifest artifact',
    'docs/leaked.txt: fixture secret material pattern',
  ]);
});

test('fixture hygiene detects Phase 7 manifests and Playwright session cookies by payload shape', () => {
  const runId = 'qa-phase7-20260824T140000Z-ab12cd34ef56';
  const manifest = JSON.stringify({
    version: 2,
    runId,
    projectId: 'the-squad-v2-staging',
    authUids: [`${runId}-owner-a`],
    firestorePaths: [`qaAuditRuns/${runId}`],
    state: 'seeded',
    transitions: {},
  });
  const storageState = JSON.stringify({
    cookies: [{
      name: ['__', 'session'].join(''),
      value: ['eyJhbGciOiJSUzI1NiJ9', 'eyJzdWIiOiJxYS11c2VyIn0', 'signature'].join('.'),
      domain: 'staging.example.test',
      path: '/',
      expires: -1,
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
    }],
    origins: [],
  });
  const privateKey = [
    ['-----BEGIN ', 'PRIVATE KEY-----'].join(''),
    'MIIEvQIBADANBgkqhkiG9w0BAQEFAASC',
    ['-----END ', 'PRIVATE KEY-----'].join(''),
  ].join('\n');
  const serviceAccount = JSON.stringify({ type: ['service_', 'account'].join('') });
  const password = JSON.stringify({ [['pass', 'word'].join('')]: 'FixtureOnly-Password-Value' });
  const token = JSON.stringify({ [['access_', 'token'].join('')]: 'ya29.fixture-token-value' });
  const credentialValue = ['eyJhbGciOiJSUzI1NiJ9', 'eyJzdWIiOiJxYS11c2VyIn0', 'signature'].join('.');
  const cookie = JSON.stringify({ cookie: `__session=${credentialValue}` });
  const session = JSON.stringify({ session: credentialValue });

  assert.deepEqual(fixtureArtifactViolations([
    { file: 'tmp/manifest.json', contents: manifest },
    { file: 'tmp/session.json', contents: storageState },
    { file: 'scripts/qa-fixtures/lifecycle.mjs', contents: privateKey },
    { file: 'scripts/qa-fixtures/lifecycle.mjs', contents: serviceAccount },
    { file: 'tests/qa-fixture-safety.test.mjs', contents: password },
    { file: 'tests/qa-fixture-safety.test.mjs', contents: token },
    { file: 'tests/repository-hygiene.test.mjs', contents: cookie },
    { file: 'tests/repository-hygiene.test.mjs', contents: session },
  ]), [
    'tmp/manifest.json: tracked Phase 7 manifest payload',
    'tmp/session.json: fixture secret material pattern',
    'scripts/qa-fixtures/lifecycle.mjs: fixture secret material pattern',
    'tests/qa-fixture-safety.test.mjs: fixture secret material pattern',
    'tests/repository-hygiene.test.mjs: fixture secret material pattern',
  ]);
});

test('fixture hygiene detects a long embedded Playwright session cookie in reversed property order', () => {
  const storageState = JSON.stringify({
    cookies: [{
      value: `header.${'x'.repeat(3000)}.signature`,
      name: ['__', 'session'].join(''),
    }],
    origins: [],
  });

  assert.deepEqual(fixtureArtifactViolations([
    { file: 'tmp/browser.capture', contents: `window.fixtureState = ${storageState};\n` },
  ]), [
    'tmp/browser.capture: fixture secret material pattern',
  ]);
});

test('fixture hygiene detects short and long Playwright storage state serialized inside JavaScript strings', () => {
  const sessionName = ['__', 'session'].join('');
  const shortStorageState = JSON.stringify({
    cookies: [{ name: sessionName, value: 'short-fixture-token' }],
    origins: [],
  });
  const longStorageState = JSON.stringify({
    cookies: [{ value: `header.${'x'.repeat(3000)}.signature`, name: sessionName }],
    origins: [],
  });

  assert.deepEqual(fixtureArtifactViolations([
    { file: 'tmp/serialized-short.js', contents: `const state = ${JSON.stringify(shortStorageState)};\n` },
    { file: 'tmp/serialized-long.js', contents: `const state = ${JSON.stringify(longStorageState)};\n` },
  ]), [
    'tmp/serialized-short.js: fixture secret material pattern',
    'tmp/serialized-long.js: fixture secret material pattern',
  ]);
});

test('fixture hygiene detects a schema-valid Phase 7 manifest with omitted transitions', () => {
  const runId = 'qa-phase7-20260824T140000Z-ab12cd34ef56';
  const manifest = JSON.stringify({
    version: 2,
    runId,
    projectId: 'the-squad-v2-staging',
    authUids: [`${runId}-owner-a`],
    firestorePaths: [`qaAuditRuns/${runId}`],
    state: 'partial',
  });

  assert.deepEqual(fixtureArtifactViolations([
    { file: 'tmp/manifest.json', contents: manifest },
  ]), [
    'tmp/manifest.json: tracked Phase 7 manifest payload',
  ]);
});

test('repository scan detects extension-independent embedded and multiline secret payloads safely', t => {
  const stem = `hygiene-probe-${process.pid}-${Date.now()}`;
  const paths = {
    embeddedState: `${stem}.capture`,
    multilineSecret: `${stem}.txt`,
    privateKey: `${stem}.keymaterial`,
  };
  t.after(() => {
    for (const file of Object.values(paths)) {
      try {
        unlinkSync(file);
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
    }
  });

  const privateKey = [
    ['-----BEGIN ', 'PRIVATE KEY-----'].join(''),
    'MIIEvQIBADANBgkqhkiG9w0BAQEFAASC',
    ['-----END ', 'PRIVATE KEY-----'].join(''),
  ].join('\n');
  const storageState = JSON.stringify({
    cookies: [{
      name: ['__', 'session'].join(''),
      value: ['eyJhbGciOiJSUzI1NiJ9', 'eyJzdWIiOiJxYS11c2VyIn0', 'signature'].join('.'),
    }],
    origins: [],
  }, null, 2);
  const passwordField = ['pass', 'word'].join('');
  const multilineSecret = ['{', `  "${passwordField}"`, '  :', '  "FixtureOnly-Password-Value"', '}'].join('\n');
  writeFileSync(paths.privateKey, privateKey);
  writeFileSync(paths.embeddedState, `window.fixtureState = ${storageState};\n`);
  writeFileSync(paths.multilineSecret, multilineSecret);

  const violations = fixtureArtifactViolations(repositoryScanFiles())
    .filter(item => item.startsWith(stem))
    .sort();
  assert.deepEqual(violations, [
    `${paths.embeddedState}: fixture secret material pattern`,
    `${paths.multilineSecret}: fixture secret material pattern`,
    `${paths.privateKey}: fixture secret material pattern`,
  ].sort());
});

test('repository scan detects ASCII secrets in binary files and fails closed on unreadable regular files', t => {
  const stem = `hygiene-byte-probe-${process.pid}-${Date.now()}`;
  const paths = {
    binary: `${stem}.blob`,
    unreadable: `${stem}.blocked`,
  };
  t.after(() => {
    for (const file of Object.values(paths)) {
      try {
        unlinkSync(file);
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
    }
  });

  const privateKey = ['-----BEGIN ', 'PRIVATE KEY-----'].join('');
  writeFileSync(paths.binary, Buffer.concat([
    Buffer.from([0xff, 0x00, 0xfe]),
    Buffer.from(privateKey, 'ascii'),
  ]));
  writeFileSync(paths.unreadable, 'ordinary non-secret text');

  const violations = fixtureArtifactViolations(repositoryScanFiles({
    readFile(file) {
      if (file === paths.unreadable) throw new Error('deterministic fixture read failure');
      return readFileSync(file);
    },
  }))
    .filter(item => item.startsWith(stem))
    .sort();
  assert.deepEqual(violations, [
    `${paths.binary}: fixture secret material pattern`,
    `${paths.unreadable}: repository regular file could not be read`,
  ].sort());
});

test('repository enumeration errors fail closed with no path or command disclosure', () => {
  assert.deepEqual(fixtureArtifactViolations(repositoryScanFiles({
    enumerateRepository() {
      throw new Error('sensitive git diagnostic');
    },
  })), [
    '<repository>: repository enumeration failed',
  ]);
});

test('repository stat, Git-blob read, and escaped-path errors fail closed', () => {
  const tracked = { file: 'tracked-unreadable.bin', mode: '100644', oid: 'a'.repeat(40) };
  const untracked = { file: 'untracked-unreadable.bin' };
  assert.deepEqual(fixtureArtifactViolations(repositoryScanFiles({
    enumerateRepository: () => ({ tracked: [tracked], untracked: [] }),
    readBlob() {
      throw new Error('sensitive object-store diagnostic');
    },
  })), [
    'tracked-unreadable.bin: repository Git blob could not be read',
  ]);
  assert.deepEqual(fixtureArtifactViolations(repositoryScanFiles({
    enumerateRepository: () => ({ tracked: [], untracked: [untracked] }),
    lstat() {
      throw new Error('sensitive stat diagnostic');
    },
  })), [
    'untracked-unreadable.bin: repository file could not be stated',
  ]);
  assert.deepEqual(fixtureArtifactViolations(repositoryScanFiles({
    enumerateRepository: () => ({ tracked: [], untracked: [{ file: '../outside.bin' }] }),
  })), [
    '<repository>: repository enumeration escaped the repository',
  ]);
});

test('tracked regular files are scanned from Git blobs without following the worktree', () => {
  const privateKey = ['-----BEGIN ', 'PRIVATE KEY-----'].join('');
  assert.deepEqual(fixtureArtifactViolations(repositoryScanFiles({
    enumerateRepository: () => ({
      tracked: [{ file: 'tracked-secret.bin', mode: '100644', oid: 'b'.repeat(40) }],
      untracked: [],
    }),
    readBlob: () => Buffer.from(privateKey, 'ascii'),
    lstat() {
      throw new Error('tracked worktree state must not be consulted');
    },
    readFile() {
      throw new Error('tracked worktree bytes must not be consulted');
    },
  })), [
    'tracked-secret.bin: fixture secret material pattern',
  ]);
});

test('repository scan never follows tracked or untracked symlinks', () => {
  assert.deepEqual(fixtureArtifactViolations(repositoryScanFiles({
    enumerateRepository: () => ({
      tracked: [{ file: 'tracked-link', mode: '120000', oid: 'c'.repeat(40) }],
      untracked: [{ file: 'untracked-link' }],
    }),
    readBlob() {
      throw new Error('tracked symlink blob must not be inspected');
    },
    lstat: () => ({ isFile: () => false, isSymbolicLink: () => true }),
    readFile() {
      throw new Error('untracked symlink target must not be inspected');
    },
  })), []);
});

test('fixture hygiene detects manifest objects in wrapped serialized and binary content', () => {
  const runId = 'qa-phase7-20260824T140000Z-ab12cd34ef56';
  const manifest = JSON.stringify({
    version: 2,
    runId,
    projectId: 'the-squad-v2-staging',
    authUids: [`${runId}-owner-a`],
    firestorePaths: [`qaAuditRuns/${runId}`],
    state: 'partial',
  });
  let serialized = manifest;
  for (let layer = 0; layer < 5; layer += 1) serialized = JSON.stringify(serialized);

  assert.deepEqual(fixtureArtifactViolations([
    { file: 'tmp/whole.capture', contents: manifest },
    { file: 'tmp/wrapped.capture', contents: `window.fixtureManifest = ${manifest};\n` },
    { file: 'tmp/serialized.capture', contents: `const fixtureManifest = ${serialized};\n` },
    {
      file: 'tmp/binary.capture',
      contents: null,
      rawBytes: Buffer.concat([Buffer.from([0x00, 0xff, 0x00]), Buffer.from(manifest, 'ascii')]),
    },
  ]), [
    'tmp/whole.capture: tracked Phase 7 manifest payload',
    'tmp/wrapped.capture: tracked Phase 7 manifest payload',
    'tmp/serialized.capture: tracked Phase 7 manifest payload',
    'tmp/binary.capture: tracked Phase 7 manifest payload',
  ]);
});

test('fixture hygiene detects supported encoded and escaped credential forms', () => {
  const privateKey = [
    ['-----BEGIN ', 'PRIVATE KEY-----'].join(''),
    'MIIEvQIBADANBgkqhkiG9w0BAQEFAASC',
    ['-----END ', 'PRIVATE KEY-----'].join(''),
  ].join('\n');
  const serviceAccount = JSON.stringify({
    type: ['service_', 'account'].join(''),
    private_key: privateKey,
  });
  const envName = ['FIREBASE_SERVICE_', 'ACCOUNT_JSON'].join('');
  const encodedServiceAccount = Buffer.from(serviceAccount, 'utf8').toString('base64');
  const passwordKey = ['pass', 'word'].join('');
  const escapedPassword = JSON.stringify(JSON.stringify({ [passwordKey]: 'FixtureOnly-Password-Value' }));
  const utf16Le = Buffer.from(privateKey, 'utf16le');
  const utf16Be = Buffer.from(utf16Le);
  utf16Be.swap16();

  assert.deepEqual(fixtureArtifactViolations([
    { file: 'tmp/service-account.env', contents: `${envName}=${encodedServiceAccount}\n` },
    { file: 'tmp/private-key-le.bin', contents: null, rawBytes: utf16Le },
    { file: 'tmp/private-key-be.bin', contents: null, rawBytes: utf16Be },
    { file: 'tmp/escaped-password.js', contents: `const payload = ${escapedPassword};\n` },
  ]), [
    'tmp/service-account.env: fixture secret material pattern',
    'tmp/private-key-le.bin: fixture secret material pattern',
    'tmp/private-key-be.bin: fixture secret material pattern',
    'tmp/escaped-password.js: fixture secret material pattern',
  ]);
});

test('fixture hygiene scans session state beyond three serialization layers with bounded work', () => {
  const sessionName = ['__', 'session'].join('');
  let encoded = JSON.stringify({
    cookies: [{ name: sessionName, value: ['eyJhbGciOiJSUzI1NiJ9', 'eyJzdWIiOiJxYS11c2VyIn0', 'signature'].join('.') }],
    origins: [],
  });
  for (let layer = 0; layer < 7; layer += 1) encoded = JSON.stringify(encoded);

  assert.deepEqual(fixtureArtifactViolations([
    { file: 'tmp/deep-session.js', contents: `const state = ${encoded};\n` },
  ]), [
    'tmp/deep-session.js: fixture secret material pattern',
  ]);
});

test('fixture hygiene handles deeply nested JSON without recursive scanner overflow', () => {
  const runId = 'qa-phase7-20260824T140000Z-ab12cd34ef56';
  const manifest = JSON.stringify({
    version: 2,
    runId,
    projectId: 'the-squad-v2-staging',
    authUids: [`${runId}-owner-a`],
    firestorePaths: [`qaAuditRuns/${runId}`],
    state: 'partial',
  });
  const depth = 12000;
  const nested = `${'{"wrapper":'.repeat(depth)}${manifest}${'}'.repeat(depth)}`;
  assert.deepEqual(fixtureArtifactViolations([
    { file: 'tmp/deeply-nested.json', contents: nested },
  ]), [
    'tmp/deeply-nested.json: tracked Phase 7 manifest payload',
  ]);
});

test('fixture hygiene distinguishes credential-shaped token and session values from harmless configuration', () => {
  const tokenKey = ['to', 'ken'].join('');
  const sessionKey = ['ses', 'sion'].join('');
  const credentialToken = ['eyJhbGciOiJSUzI1NiJ9', 'eyJzdWIiOiJxYS11c2VyIn0', 'signature'].join('.');
  assert.deepEqual(fixtureArtifactViolations([
    { file: 'docs/harmless-token.json', contents: JSON.stringify({ [tokenKey]: 'blue' }) },
    { file: 'docs/harmless-session.json', contents: JSON.stringify({ [sessionKey]: 'strict' }) },
    { file: 'tmp/credential-token.json', contents: JSON.stringify({ [tokenKey]: credentialToken }) },
    { file: 'tmp/credential-session.json', contents: JSON.stringify({ [sessionKey]: credentialToken }) },
  ]), [
    'tmp/credential-token.json: fixture secret material pattern',
    'tmp/credential-session.json: fixture secret material pattern',
  ]);
});
