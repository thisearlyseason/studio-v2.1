'use strict';

const Module = require('node:module');
const path = require('node:path');

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
  Object.defineProperty(globalThis, '__phase9PlaywrightTransportModuleGuard', {
    configurable: false, enumerable: false, writable: false, value: true,
  });
}
