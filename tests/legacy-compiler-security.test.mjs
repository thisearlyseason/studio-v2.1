import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
const require=createRequire(import.meta.url);
const braces=require('braces');
const fixtures={
setCycle:"const a={type:'root'};a.nodes=new Set([a]);",
setDepth:"const a={type:'root'};let n=a;for(let i=0;i<12000;i++){const c={type:'root'};n.nodes=new Set([c]);n=c;}",
arrayLikeCycle:"const a={type:'root'};a.nodes={0:a,length:1};",
functionParent:"const p=function(){};p.parent=p;const a={type:'text',nodes:[],parent:p};",
customIterator:"const a={type:'root',nodes:[]};a.nodes[Symbol.iterator]=function*(){throw Error('ITERATOR_EXECUTED')};",
nodeAccessor:"const a={type:'root'};Object.defineProperty(a,'nodes',{get(){throw Error('GETTER_EXECUTED')}});",
arrayAccessor:"const a={type:'root',nodes:[]};Object.defineProperty(a.nodes,0,{get(){throw Error('GETTER_EXECUTED')}});",
proxyNode:"const a=new Proxy({}, {get(){throw Error('PROXY_EXECUTED')},ownKeys(){throw Error('PROXY_EXECUTED')}});",
proxyArray:"const a={type:'root',nodes:new Proxy([],{get(){throw Error('PROXY_EXECUTED')}})};",
nonIndexNumericProperty:"const a={type:'root',nodes:[]};a.nodes['4294967295']=1;",
sparseArray:"const a={type:'root',nodes:new Array(2)};",
objectValue:"const a={type:'text',value:{toString(){throw Error('COERCION_EXECUTED')}}};"
};

test('private legacy compiler installed bytes match immutable provenance',()=>{
 const r=spawnSync(process.execPath,['scripts/security/verify-legacy-compiler.mjs'],{encoding:'utf8',timeout:10000});
 assert.equal(r.error,undefined);assert.equal(r.status,0,r.stderr);
});
test('legacy compiler rejects malformed direct ASTs without executing user hooks',()=>{
 for(const [name,setup]of Object.entries(fixtures))for(const method of ['compile','stringify','expand']){
  const code="const b=require('braces');"+setup+"try{b."+method+"(a);console.log('ACCEPTED')}catch(e){console.log(e.name+':'+e.message)}";
  const r=spawnSync(process.execPath,['-e',code],{encoding:'utf8',timeout:1500,maxBuffer:2048});
  assert.equal(r.error,undefined,name+' '+method);assert.equal(r.status,0,name+' '+method);assert.match(r.stdout,/^SyntaxError:/,name+' '+method);
 }
});
test('legacy compiler bounds deep ASTs and rejects node and parent cycles',()=>{
 const a={type:'root',nodes:[]};let n=a;for(let i=0;i<12000;i++){const c={type:'root',nodes:[]};n.nodes.push(c);n=c}
 const cycle={type:'root',nodes:[]};cycle.nodes.push(cycle);
 const parent={type:'text',value:'x'};parent.parent=parent;
 for(const method of ['compile','stringify','expand'])for(const value of [a,cycle])assert.throws(()=>braces[method](value),SyntaxError);
 // Only expand follows the supplied .parent chain; compile/stringify use traversal parents.
 assert.throws(()=>braces.expand(parent),SyntaxError);
});
test('legacy compiler preserves ordinary fixed application glob semantics',()=>{
 assert.deepEqual(braces.expand('./src/**/*.{js,ts,jsx,tsx,mdx}'),['./src/**/*.js','./src/**/*.ts','./src/**/*.jsx','./src/**/*.tsx','./src/**/*.mdx']);
 assert.deepEqual(braces.expand('{a,b}{1..3}'),['a1','a2','a3','b1','b2','b3']);
});
