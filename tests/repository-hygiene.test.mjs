import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { extname } from 'node:path';
import test from 'node:test';

const TEXT_EXTENSIONS = new Set([
  '',
  '.cjs',
  '.css',
  '.html',
  '.js',
  '.json',
  '.jsx',
  '.md',
  '.mjs',
  '.py',
  '.rules',
  '.sh',
  '.ts',
  '.tsx',
  '.txt',
  '.yaml',
  '.yml',
]);

function repositoryFiles() {
  return execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { encoding: 'utf8' },
  ).split('\0').filter(Boolean);
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
    && isRecord(value.transitions)
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
  for (const { file, contents } of files) {
    if (credentialArtifact.test(file)) violations.push(`${file}: tracked fixture credential/manifest artifact`);
    const json = parseJson(contents);
    if (containsPhase7Manifest(json)) violations.push(`${file}: tracked Phase 7 manifest payload`);
    const literalSecret = contents.split('\n').some(line => secretPatterns.some(({ name, pattern }) => (
      pattern.test(line) && !isNarrowSecretException(file, name, line)
    )));
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
  for (const file of repositoryFiles()) {
    if (!existsSync(file)) continue;
    if (!TEXT_EXTENSIONS.has(extname(file))) continue;

    const contents = readFileSync(file, 'utf8');
    for (const value of retiredValues) {
      if (contents.includes(value)) {
        violations.push(`${file}: contains a retired QA credential or identifier`);
      }
    }
  }

  assert.deepEqual(violations, []);
});

test('tracked repository rejects fixture credential artifacts and secret material patterns', () => {
  const files = repositoryFiles()
    .filter(file => existsSync(file) && TEXT_EXTENSIONS.has(extname(file)))
    .map(file => ({ file, contents: readFileSync(file, 'utf8') }));
  assert.deepEqual(fixtureArtifactViolations(files), []);
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
