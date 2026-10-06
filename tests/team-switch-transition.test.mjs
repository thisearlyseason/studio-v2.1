import assert from 'node:assert/strict';
import test from 'node:test';
import {execFileSync} from 'node:child_process';
test('actual team provider excludes stale canonical and cross-account render state',()=>{const result=execFileSync(process.execPath,[new URL('./helpers/team-switch-harness.mjs',import.meta.url).pathname,new URL('../src/components/providers/team-provider.tsx',import.meta.url).pathname],{encoding:'utf8'});assert.match(result,/"checks":12,"passed":12,"failed":0/)});
test('actual hook reference transition reproduces retained-data interval without network',()=>{const result=execFileSync(process.execPath,[new URL('./helpers/team-switch-hook-harness.mjs',import.meta.url).pathname],{encoding:'utf8'});assert.equal(result.match(/PASS/g).length,2)});
