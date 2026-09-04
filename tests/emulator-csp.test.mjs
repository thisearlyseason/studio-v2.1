import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../next.config.ts', import.meta.url), 'utf8');

test('loopback Firebase CSP origins require both development and emulator mode', () => {
  assert.match(source, /process\.env\.NODE_ENV !== 'production'[\s\S]+NEXT_PUBLIC_USE_FIREBASE_EMULATORS === 'true'/);
  assert.match(source, /http:\/\/127\.0\.0\.1:8080/);
  assert.match(source, /http:\/\/127\.0\.0\.1:9099/);
  assert.match(source, /http:\/\/127\.0\.0\.1:9199/);
  assert.match(source, /connect-src[^\n]+\$\{localEmulatorConnectSources\}/);
});
