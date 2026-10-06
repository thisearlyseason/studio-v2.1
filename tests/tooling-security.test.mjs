import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pipeline } from 'node:stream/promises';
import { Readable, Writable } from 'node:stream';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
const require=createRequire(import.meta.url);
const firebaseRoot=path.dirname(require.resolve('firebase-tools/package.json'));
// Exercise the actual import declarations installed in Firebase, not a parallel
// mock adapter. A future CLI change must fail these checks for manual review.
async function bindings(file){
 const src=fs.readFileSync(path.join(firebaseRoot,file),'utf8');
 const declaration=src.split('\n').find(line=>line.startsWith('const streamJson_1 = '));
 assert.ok(declaration, 'Expected native upstream streamJson loader import');
 assert.match(src, /streamJson_1\.loadStreamJson/);
 const loader=vm.runInNewContext(declaration+'\nstreamJson_1',{require:createRequire(path.join(firebaseRoot,file))});
 return loader.loadStreamJson();
}
async function collect(bindings,input,...streams){const out=[];await pipeline(bindings.chain([Readable.from([input]),...streams]),new Writable({objectMode:true,write(x,_,cb){out.push(x);cb();}}));return out;}
test('Firebase auth import keeps user extraction with the fixed upstream parser',async()=>{
 const native=await bindings('lib/commands/auth-import.js');
 const {pick,streamArray}=native;
 const result=await collect(native,'{"users":[{"localId":"safe"}]}',pick.withParser({filter:/^users$/}),streamArray());
 assert.deepEqual(result.map(x=>x.value),[{localId:'safe'}]);
 await assert.rejects(collect(native,'{"meta":'.repeat(2000)+'1'+'}'.repeat(2000),pick.withParser({filter:/^users$/}),streamArray()),/depth/i);
 require('firebase-tools/lib/commands/auth-import');
});
test('Firebase database import keeps filtered object streaming',async()=>{
 const native=await bindings('lib/database/import.js');
 const {filter,streamObject}=native;
 const result=await collect(native,'{"data":{"a":1,"b":2},"ignored":3}',filter.withParser({filter:'data'}),streamObject());
 assert.deepEqual(result.map(x=>({key:x.key,value:x.value})),[{key:'data',value:{a:1,b:2}}]);
 await assert.rejects(collect(native,'{"meta":'.repeat(2000)+'1'+'}'.repeat(2000),filter.withParser({filter:'data'}),streamObject()),/depth/i);
 require('firebase-tools/lib/database/import');
});
test('Firebase Next manifest parsing preserves dependency extraction',async()=>{
 const native=await bindings('lib/frameworks/next/utils.js');
 const {parser,pick,streamObject}=native;
 const result=await collect(native,'{"dependencies":{"next":{"version":"15.5.25","dependencies":{"nested":{"version":"1"}}},"react":{"version":"19"}}}',parser({packValues:false,packKeys:true,streamValues:false}),pick({filter:'dependencies'}),streamObject());
 assert.deepEqual(result.map(x=>x.key),['next','react']);
 require('firebase-tools/lib/frameworks/next/index');
});
test('CSV parser remains CommonJS compatible and cannot replace record prototypes',()=>{
 const {parse}=require('csv-parse/sync');
 assert.deepEqual(parse('id,email\n1,test@example.test',{columns:true}),[{id:'1',email:'test@example.test'}]);
 const rows=parse('__proto__,name\nmalicious,safe',{columns:true});
 assert.equal(Object.getPrototypeOf(rows[0]),Object.prototype);
 assert.equal(rows[0].name,'safe');
 assert.equal({}.malicious,undefined);
});
