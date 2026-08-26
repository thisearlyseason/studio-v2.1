#!/usr/bin/env node
'use strict';

// The reviewed Phase 9 transport deliberately omits @playwright/cli's update
// notifier and skill drift check. The runtime closure is supplied by the
// deterministic artifact builder beside this source file.
const { program } = require('playwright-core/lib/tools/cli-client/program');

let phase9FetchCalls = 0;
Object.defineProperty(globalThis, 'fetch', {
  configurable: false,
  enumerable: false,
  writable: false,
  value: () => {
    phase9FetchCalls += 1;
    throw new Error('Node-side transport fetch is disabled.');
  },
});
if (process.env.PHASE9_TRANSPORT_FETCH_AUDIT === '1') {
  process.once('exit', () => process.stderr.write(`phase9-transport-fetch-calls=${phase9FetchCalls}\n`));
}
program({ embedderVersion: '0.1.18' });
