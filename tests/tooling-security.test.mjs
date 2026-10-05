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
function bindings(file,names){
 const src=fs.readFileSync(path.join(firebaseRoot,file),'utf8');
 const imports=names.map(name=>src.split('\n').find(line=>line.startsWith('const '+name+' = ')));
 assert.ok(imports.every(Boolean));
 return vm.runInNewContext(imports.join('\n')+'\n({'+names.join(',')+'})',{require:createRequire(path.join(firebaseRoot,file))});
}
async function collect(input,...streams){const out=[];await pipeline(Readable.from([input]),...streams,new Writable({objectMode:true,write(x,_,cb){out.push(x);cb();}}));return out;}
test('Firebase auth import keeps user extraction with the fixed upstream parser',async()=>{
 const {Pick,StreamArray}=bindings('lib/commands/auth-import.js',['Pick','StreamArray']);
 const result=await collect('{"users":[{"localId":"safe"}]}',Pick.withParser({filter:/^users$/}),StreamArray.streamArray());
 assert.deepEqual(result.map(x=>x.value),[{localId:'safe'}]);
 await assert.rejects(collect('{"meta":'.repeat(2000)+'1'+'}'.repeat(2000),Pick.withParser({filter:/^users$/}),StreamArray.streamArray()),/depth/i);
 require('firebase-tools/lib/commands/auth-import');
});
test('Firebase database import keeps filtered object streaming',async()=>{
 const {Filter,StreamObject}=bindings('lib/database/import.js',['Filter','StreamObject']);
 const result=await collect('{"data":{"a":1,"b":2},"ignored":3}',Filter.withParser({filter:'data'}),StreamObject.streamObject());
 assert.deepEqual(result.map(x=>({key:x.key,value:x.value})),[{key:'data',value:{a:1,b:2}}]);
 await assert.rejects(collect('{"meta":'.repeat(2000)+'1'+'}'.repeat(2000),Filter.withParser({filter:'data'}),StreamObject.streamObject()),/depth/i);
 require('firebase-tools/lib/database/import');
});
test('Firebase Next manifest parsing preserves dependency extraction',async()=>{
 const {stream_json_1,Pick_1,StreamObject_1}=bindings('lib/frameworks/next/index.js',['stream_json_1','Pick_1','StreamObject_1']);
 const result=await collect('{"dependencies":{"next":{"version":"15.5.25","dependencies":{"nested":{"version":"1"}}},"react":{"version":"19"}}}',stream_json_1.parser({packValues:false,packKeys:true,streamValues:false}),Pick_1.pick({filter:'dependencies'}),StreamObject_1.streamObject());
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
