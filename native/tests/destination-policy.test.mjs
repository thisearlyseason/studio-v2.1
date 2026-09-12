import assert from 'node:assert';
import { after, before, test } from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const nativeRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const fixtures = JSON.parse(readFileSync(join(nativeRoot, 'policy', 'fixtures.json'), 'utf8'));
const buildDirectory = mkdtempSync(join(tmpdir(), 'squad-native-policy-'));
const swiftExecutable = join(buildDirectory, 'swift-policy-probe');
const javaClasses = join(buildDirectory, 'java-classes');
const commandTimeout = 20_000;

function run(command, commandArguments, options = {}) {
  return spawnSync(command, commandArguments, {
    encoding: 'utf8',
    timeout: commandTimeout,
    ...options,
  });
}

function requireSuccess(result, description) {
  assert.strictEqual(
    result.status,
    0,
    `${description} failed\nstdout:\n${result.stdout ?? ''}\nstderr:\n${result.stderr ?? ''}`,
  );
  assert.strictEqual(result.error, undefined, `${description} did not complete: ${result.error}`);
}

function resolveSwiftToolchain() {
  const compilerResult = run('xcrun', ['--find', 'swiftc']);
  requireSuccess(compilerResult, 'Swift compiler lookup');
  const compiler = compilerResult.stdout.trim();
  assert.notStrictEqual(compiler, '', 'Swift compiler lookup returned an empty path');

  const sdkResult = run('xcrun', ['--show-sdk-path']);
  requireSuccess(sdkResult, 'Swift SDK lookup');
  const sdk = sdkResult.stdout.trim();
  assert.notStrictEqual(sdk, '', 'Swift SDK lookup returned an empty path');
  return { compiler, sdk };
}

function resolveJavaHome() {
  return process.env.JAVA_HOME || '/Applications/Android Studio.app/Contents/jbr/Contents/Home';
}

const probes = new Map();

before(() => {
  const swiftToolchain = resolveSwiftToolchain();
  const swiftCompile = run(swiftToolchain.compiler, [
    '-sdk',
    swiftToolchain.sdk,
    join(nativeRoot, 'ios', 'Policy', 'StoreDestination.swift'),
    join(nativeRoot, 'tests', 'PolicyProbe.swift'),
    '-o',
    swiftExecutable,
  ]);
  requireSuccess(swiftCompile, 'Swift policy compilation');

  const javaHome = resolveJavaHome();
  const javac = join(javaHome, 'bin', 'javac');
  const java = join(javaHome, 'bin', 'java');
  mkdirSync(javaClasses);
  const javaCompile = run(javac, [
    '-d',
    javaClasses,
    join(nativeRoot, 'android', 'policy', 'pro', 'thesquad', 'shell', 'StoreDestination.java'),
    join(nativeRoot, 'tests', 'PolicyProbe.java'),
  ]);
  requireSuccess(javaCompile, 'Java policy compilation');

  probes.set('Swift', (arguments_) => {
    const result = run(swiftExecutable, arguments_);
    requireSuccess(result, `Swift probe ${JSON.stringify(arguments_)}`);
    return result.stdout.trim();
  });
  probes.set('Java', (arguments_) => {
    const result = run(java, ['-cp', javaClasses, 'PolicyProbe', ...arguments_]);
    requireSuccess(result, `Java probe ${JSON.stringify(arguments_)}`);
    return result.stdout.trim();
  });
});

after(() => {
  rmSync(buildDirectory, { recursive: true, force: true });
});

for (const platform of ['Swift', 'Java']) {
  test(`${platform} policy fixtures`, async (suite) => {
    const probe = () => probes.get(platform);

    for (const row of fixtures.configuration) {
      await suite.test(`normalizes or rejects configuration: ${JSON.stringify(row.input)}`, () => {
        assert.strictEqual(probe()(['configuration', row.input]), row.want ?? 'INVALID');
      });
    }

    for (const row of fixtures.navigation) {
      await suite.test(`denies or permits navigation: ${JSON.stringify(row.input)}`, () => {
        assert.strictEqual(
          probe()(['navigation', 'https://store.example.test', row.input]),
          String(row.want),
        );
      });
    }

    for (const row of fixtures.bootstrap) {
      await suite.test(`accepts or rejects bootstrap metadata: ${JSON.stringify(row)}`, () => {
        assert.strictEqual(
          probe()([
            'bootstrap',
            'https://store.example.test',
            String(row.status),
            row.finalURL,
            String(row.redirected),
            row.distribution === null ? 'NULL' : row.distribution,
          ]),
          String(row.want),
        );
      });
    }
  });
}
