'use strict';

const Module = require('node:module');
const childProcess = require('node:child_process');
const crypto = require('node:crypto');
const path = require('node:path');

const guardianMarkerName = 'PHASE9_GUARDIAN_RUN_MARKER';
const guardianMarkerNameSha256 = '585c21d0652b1f1c5dd8168796ee2599745f8a1a9885e3178ac29b057f0044c3';
const chromeBinary = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

if (!globalThis.__phase9PlaywrightTransportModuleGuard) {
  let cursor = __dirname;
  while (path.basename(cursor) !== 'node_modules') {
    const parent = path.dirname(cursor);
    if (parent === cursor) throw new Error('Playwright transport module root is invalid.');
    cursor = parent;
  }
  const transportRoot = `${path.dirname(cursor)}${path.sep}`;
  const originalLoad = Module._load;
  const builtins = new Set(Module.builtinModules.flatMap(name => [name, `node:${name}`]));
  Module._load = function phase9ClosedModuleLoad(request, parent, isMain) {
    if (builtins.has(request)) return originalLoad.call(this, request, parent, isMain);
    const resolved = Module._resolveFilename(request, parent, isMain);
    if (typeof resolved !== 'string' || !resolved.startsWith(transportRoot)) {
      throw new Error('Playwright transport refused an external JavaScript module.');
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  const guardianMarker = process.env[guardianMarkerName];
  if (guardianMarker !== undefined) {
    if (crypto.createHash('sha256').update(guardianMarkerName).digest('hex') !== guardianMarkerNameSha256
      || !/^[0-9a-f]{64}$/.test(guardianMarker)) {
      throw new Error('Playwright transport guardian marker is invalid.');
    }
    const originalSpawn = childProcess.spawn;
    childProcess.spawn = function phase9MarkedChromeSpawn(file, args, options) {
      const markedArgs = file === chromeBinary
        ? [...args, `--${guardianMarkerName}=${guardianMarker}`]
        : args;
      return originalSpawn.call(this, file, markedArgs, options);
    };
  }
  Object.defineProperty(globalThis, '__phase9PlaywrightTransportModuleGuard', {
    configurable: false, enumerable: false, writable: false, value: true,
  });
}
