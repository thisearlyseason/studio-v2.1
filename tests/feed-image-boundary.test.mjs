import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import test from 'node:test';

test('cold image validation rejects a boundary-plus-one payload without regexp stack overflow',()=>{
  const script=`import assert from 'node:assert/strict';import {decodeFeedImage} from './src/lib/feed-policy.ts';
    const value='data:image/png;base64,'+Buffer.alloc(5*1024*1024+1).toString('base64');
    assert.throws(()=>decodeFeedImage(value),error=>error.message==='INVALID_IMAGE');`;
  const result=spawnSync(process.execPath,['--regexp-interpret-all','--import','tsx','--input-type=module','-e',script],{cwd:new URL('..',import.meta.url),encoding:'utf8',timeout:10000});
  assert.equal(result.status,0,result.stderr.slice(-1500));
});
