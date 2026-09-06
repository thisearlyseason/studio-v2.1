import assert from 'node:assert/strict';
import test from 'node:test';
import {libraryDataUrlBlob} from '../src/lib/library-client-upload.ts';
test('Library FileReader bytes become a Blob locally without CSP-blocked data URL fetch',async()=>{
  const original=globalThis.fetch;globalThis.fetch=()=>{throw Error('connect-src blocks data URLs');};
  try{const blob=libraryDataUrlBlob('data:application/pdf;base64,JVBERi0xLjQ=');assert.equal(blob.type,'application/pdf');assert.equal(await blob.text(),'%PDF-1.4');}finally{globalThis.fetch=original;}
});
test('Library local conversion rejects malformed and over-limit encoded inputs before allocation',()=>{
  for(const value of ['data:application/pdf;base64,@@@@','data:text/plain,unencoded','data:application/pdf;base64,'+'A'.repeat(14_000_000)])assert.throws(()=>libraryDataUrlBlob(value));
});
