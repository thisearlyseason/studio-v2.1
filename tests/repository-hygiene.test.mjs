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

function fixtureArtifactViolations(files) {
  const credentialArtifact = /(?:^|\/)(?:qa-phase7|qa-fixture)[^/]*(?:credential|manifest)[^/]*\.(?:json|env)$/i;
  const secretPatterns = [
    new RegExp(['-----BEGIN ', 'PRIVATE KEY-----'].join('')),
    new RegExp(['"private_', 'key"\\s*:'].join(''), 'i'),
    new RegExp(['"type"\\s*:\\s*"service_', 'account"'].join(''), 'i'),
    new RegExp(['"password"\\s*:\\s*"', '[^"\\n]+"'].join(''), 'i'),
    new RegExp(['"__session"\\s*:\\s*"', '[^"\\n]+"'].join(''), 'i'),
  ];
  const contentAllowlist = new Set([
    'scripts/qa-fixtures/lifecycle.mjs',
    'tests/qa-fixture-safety.test.mjs',
    'tests/repository-hygiene.test.mjs',
  ]);
  const violations = [];
  for (const { file, contents } of files) {
    if (credentialArtifact.test(file)) violations.push(`${file}: tracked fixture credential/manifest artifact`);
    if (contentAllowlist.has(file)) continue;
    for (const pattern of secretPatterns) {
      if (pattern.test(contents)) violations.push(`${file}: fixture secret material pattern`);
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

test('fixture hygiene regression recognizes unsafe artifacts while retaining narrow source allowlists', () => {
  const privateKey = ['-----BEGIN ', 'PRIVATE KEY-----'].join('');
  assert.deepEqual(fixtureArtifactViolations([
    { file: 'tmp/qa-phase7-run-credential.json', contents: '{}' },
    { file: 'docs/leaked.txt', contents: privateKey },
  ]), [
    'tmp/qa-phase7-run-credential.json: tracked fixture credential/manifest artifact',
    'docs/leaked.txt: fixture secret material pattern',
  ]);
  assert.deepEqual(fixtureArtifactViolations([
    { file: 'scripts/qa-fixtures/lifecycle.mjs', contents: privateKey },
  ]), []);
});
