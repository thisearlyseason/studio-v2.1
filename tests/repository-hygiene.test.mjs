import assert from 'node:assert/strict';
import { isUtf8 } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import test from 'node:test';

function repositoryFiles() {
  return execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { encoding: 'utf8' },
  ).split('\0').filter(Boolean);
}

function repositoryScanFiles({ lstat = lstatSync, readFile = readFileSync } = {}) {
  return repositoryFiles().map(file => {
    try {
      if (!lstat(file).isFile()) return { file, contents: null, rawBytes: null, readError: false };
    } catch {
      return { file, contents: null, rawBytes: null, readError: false };
    }
    try {
      const rawBytes = readFile(file);
      const contents = isUtf8(rawBytes) && !rawBytes.includes(0) ? rawBytes.toString('utf8') : null;
      return { file, contents, rawBytes, readError: false };
    } catch {
      return { file, contents: null, rawBytes: null, readError: true };
    }
  });
}

function asciiScanContents(file) {
  if (typeof file.contents === 'string') return file.contents;
  if (Buffer.isBuffer(file.rawBytes)) return file.rawBytes.toString('latin1');
  return null;
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
  if (Array.isArray(value)) return value.some(containsPhase7Manifest);
  if (!isRecord(value)) return false;
  if (
    value.version === 2
    && typeof value.runId === 'string'
    && value.runId.startsWith('qa-phase7-')
    && value.projectId === 'the-squad-v2-staging'
    && Array.isArray(value.authUids)
    && Array.isArray(value.firestorePaths)
    && ['planned', 'partial', 'seeded', 'cleaned'].includes(value.state)
  ) {
    return true;
  }
  return Object.values(value).some(containsPhase7Manifest);
}

function containsSecretJsonPayload(value) {
  if (Array.isArray(value)) return value.some(containsSecretJsonPayload);
  if (!isRecord(value)) return false;
  if (value.name === ['__', 'session'].join('') && typeof value.value === 'string' && value.value.length > 0) {
    return true;
  }
  return Object.values(value).some(containsSecretJsonPayload);
}

function isNarrowSecretException(file, patternName, line) {
  if (patternName !== 'cookie-or-session' || !new Set(['package-lock.json', 'functions/package-lock.json']).has(file)) {
    return false;
  }
  return new RegExp(['^\\s*"cookie"\\s*:\\s*"[~^]\\d+\\.\\d+\\.\\d+"', ',?\\s*$'].join('')).test(line);
}

function containsLiteralSecret(file, contents, secretPatterns) {
  return secretPatterns.some(({ name, pattern }) => {
    const matcher = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
    return [...contents.matchAll(matcher)].some(match => {
      const lineStart = contents.lastIndexOf('\n', match.index) + 1;
      const nextLineBreak = contents.indexOf('\n', match.index + match[0].length);
      const lineEnd = nextLineBreak === -1 ? contents.length : nextLineBreak;
      return !isNarrowSecretException(file, name, contents.slice(lineStart, lineEnd));
    });
  });
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

// One layer covers a JavaScript string; three permits nested serializers while bounding adversarial decode work.
const MAX_SERIALIZED_JSON_DEPTH = 3;

function containsDecodedSessionCookie(value, remainingDepth) {
  return remainingDepth > 0
    && typeof value === 'string'
    && value.includes('{')
    && containsEmbeddedSessionCookie(value, remainingDepth - 1);
}

function containsEmbeddedSessionCookie(contents, remainingDepth = MAX_SERIALIZED_JSON_DEPTH) {
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
    if (containsDecodedSessionCookie(key.value, remainingDepth)) return true;
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
    if (containsDecodedSessionCookie(value.value, remainingDepth)) return true;
    const frame = objectFrames.at(-1);
    if (key.value === 'name' && value.value === ['__', 'session'].join('')) frame.hasSessionName = true;
    if (key.value === 'value' && typeof value.value === 'string' && value.value.length > 0) frame.hasValue = true;
    if (frame.hasSessionName && frame.hasValue) return true;
    index = value.end;
  }
  return false;
}

function fixtureArtifactViolations(files) {
  const credentialArtifact = /(?:^|\/)(?:qa-phase7|qa-fixture)[^/]*(?:credential|manifest|storage[-_]?state)[^/]*\.(?:json|env)$/i;
  const secretPatterns = [
    { name: 'private-key-pem', pattern: new RegExp(['-----BEGIN ', 'PRIVATE KEY-----'].join('')) },
    { name: 'private-key-json', pattern: new RegExp(['"private_', 'key"\\s*:\\s*"', '[^"\\n]+"'].join(''), 'i') },
    { name: 'service-account', pattern: new RegExp(['"type"\\s*:\\s*"service_', 'account"'].join(''), 'i') },
    { name: 'password', pattern: new RegExp(['"password"\\s*:\\s*"', '[^"\\n]+"'].join(''), 'i') },
    { name: 'token', pattern: new RegExp(['"(?:access_|refresh_|id_)?token"\\s*:\\s*"', '[^"\\n]+"'].join(''), 'i') },
    { name: 'cookie-or-session', pattern: new RegExp(['"(?:cookie|session|__', 'session)"\\s*:\\s*"', '[^"\\n]+"'].join(''), 'i') },
  ];
  const violations = [];
  for (const fileEntry of files) {
    const { file, contents, readError } = fileEntry;
    if (credentialArtifact.test(file)) violations.push(`${file}: tracked fixture credential/manifest artifact`);
    if (readError) violations.push(`${file}: repository regular file could not be read`);
    const scanContents = asciiScanContents(fileEntry);
    if (scanContents === null) continue;
    const json = typeof contents === 'string' ? parseJson(contents) : null;
    if (containsPhase7Manifest(json)) violations.push(`${file}: tracked Phase 7 manifest payload`);
    const literalSecret = containsLiteralSecret(file, scanContents, secretPatterns)
      || containsEmbeddedSessionCookie(scanContents);
    if (containsSecretJsonPayload(json) || literalSecret) {
      violations.push(`${file}: fixture secret material pattern`);
    }
  }
  return violations;
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
    const contents = asciiScanContents(fileEntry);
    if (contents === null) continue;
    for (const value of retiredValues) {
      if (contents.includes(value)) {
        violations.push(`${file}: contains a retired QA credential or identifier`);
      }
    }
  }

  assert.deepEqual(violations, []);
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
  const cookie = JSON.stringify({ cookie: 'fixture-cookie-value' });
  const session = JSON.stringify({ session: 'fixture-session-value' });

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
    'scripts/qa-fixtures/lifecycle.mjs: fixture secret material pattern',
    'tests/qa-fixture-safety.test.mjs: fixture secret material pattern',
    'tests/qa-fixture-safety.test.mjs: fixture secret material pattern',
    'tests/repository-hygiene.test.mjs: fixture secret material pattern',
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
