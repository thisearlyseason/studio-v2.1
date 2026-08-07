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
