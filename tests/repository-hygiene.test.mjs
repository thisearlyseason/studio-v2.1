import assert from 'node:assert/strict';
import { isUtf8 } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { chmodSync, lstatSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import test from 'node:test';

function repositoryFiles() {
  return execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { encoding: 'utf8' },
  ).split('\0').filter(Boolean);
}

function repositoryScanFiles() {
  return repositoryFiles().map(file => {
    try {
      if (!lstatSync(file).isFile()) return { file, contents: null };
      const contents = readFileSync(file);
      if (!isUtf8(contents) || contents.includes(0)) return { file, contents: null };
      return { file, contents: contents.toString('utf8') };
    } catch {
      return { file, contents: null };
    }
  });
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

function fixtureArtifactViolations(files) {
  const credentialArtifact = /(?:^|\/)(?:qa-phase7|qa-fixture)[^/]*(?:credential|manifest|storage[-_]?state)[^/]*\.(?:json|env)$/i;
  const secretPatterns = [
    { name: 'private-key-pem', pattern: new RegExp(['-----BEGIN ', 'PRIVATE KEY-----'].join('')) },
    { name: 'private-key-json', pattern: new RegExp(['"private_', 'key"\\s*:\\s*"', '[^"\\n]+"'].join(''), 'i') },
    { name: 'service-account', pattern: new RegExp(['"type"\\s*:\\s*"service_', 'account"'].join(''), 'i') },
    { name: 'password', pattern: new RegExp(['"password"\\s*:\\s*"', '[^"\\n]+"'].join(''), 'i') },
    { name: 'token', pattern: new RegExp(['"(?:access_|refresh_|id_)?token"\\s*:\\s*"', '[^"\\n]+"'].join(''), 'i') },
    { name: 'cookie-or-session', pattern: new RegExp(['"(?:cookie|session|__', 'session)"\\s*:\\s*"', '[^"\\n]+"'].join(''), 'i') },
    {
      name: 'playwright-session-cookie',
      pattern: new RegExp([
        '\\{',
        '(?=[^{}]{0,2048}"name"\\s*:\\s*"__',
        'session")',
        '(?=[^{}]{0,2048}"value"\\s*:\\s*"[^"\\n]+")',
        '[^{}]{0,2048}\\}',
      ].join(''), 'i'),
    },
  ];
  const violations = [];
  for (const { file, contents } of files) {
    if (credentialArtifact.test(file)) violations.push(`${file}: tracked fixture credential/manifest artifact`);
    if (typeof contents !== 'string') continue;
    const json = parseJson(contents);
    if (containsPhase7Manifest(json)) violations.push(`${file}: tracked Phase 7 manifest payload`);
    const literalSecret = containsLiteralSecret(file, contents, secretPatterns);
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
  for (const { file, contents } of repositoryScanFiles()) {
    if (typeof contents !== 'string') continue;
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
    binary: `${stem}.bin`,
    embeddedState: `${stem}.capture`,
    multilineSecret: `${stem}.txt`,
    privateKey: `${stem}.keymaterial`,
    unreadable: `${stem}.blocked`,
  };
  t.after(() => {
    for (const file of Object.values(paths)) {
      try {
        chmodSync(file, 0o600);
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
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
  writeFileSync(paths.binary, Buffer.concat([Buffer.from([0, 1, 2, 3]), Buffer.from(privateKey)]));
  writeFileSync(paths.unreadable, 'ordinary non-secret text');
  chmodSync(paths.unreadable, 0o000);

  const violations = fixtureArtifactViolations(repositoryScanFiles())
    .filter(item => item.startsWith(stem))
    .sort();
  assert.deepEqual(violations, [
    `${paths.embeddedState}: fixture secret material pattern`,
    `${paths.multilineSecret}: fixture secret material pattern`,
    `${paths.privateKey}: fixture secret material pattern`,
  ].sort());
});
