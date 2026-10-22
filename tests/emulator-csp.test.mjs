import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {execFileSync} from 'node:child_process';

const source = await readFile(new URL('../next.config.ts', import.meta.url), 'utf8');

test('loopback Firebase CSP origins require both development and emulator mode', () => {
  assert.match(source, /process\.env\.NODE_ENV !== 'production'[\s\S]+NEXT_PUBLIC_USE_FIREBASE_EMULATORS === 'true'/);
  assert.match(source, /http:\/\/127\.0\.0\.1:8080/);
  assert.match(source, /http:\/\/127\.0\.0\.1:9099/);
  assert.match(source, /http:\/\/127\.0\.0\.1:9199/);
  assert.match(source, /connect-src[^\n]+\$\{localEmulatorConnectSources\}/);
});

test('media policy permits only the Storage emulator in explicit local emulator mode', () => {
  for (const [nodeEnv, emulatorMode, permitted] of [
    ['development', 'true', true], ['development', 'false', false],
    ['production', 'true', false], ['production', 'false', false],
  ]) {
    const output = execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e',
      'import config from "./next.config.ts"; console.log(JSON.stringify(await config.headers()));',
    ], {cwd: new URL('..', import.meta.url), env: {...process.env, NODE_ENV: nodeEnv, NEXT_PUBLIC_USE_FIREBASE_EMULATORS: emulatorMode}, encoding: 'utf8'});
    for (const route of JSON.parse(output)) {
      const policy = route.headers.find(header => header.key === 'Content-Security-Policy').value;
      const mediaSources = policy.split('; ').find(directive => directive.startsWith('media-src ')).split(' ').slice(1);
      const localSources = mediaSources.filter(value => value.startsWith('http:'));
      assert.deepEqual(localSources, permitted ? ['http://127.0.0.1:9199', 'http://localhost:9199'] : []);
      assert.ok(mediaSources.includes('https:'));
      assert.ok(mediaSources.includes('blob:'));
    }
  }
});
