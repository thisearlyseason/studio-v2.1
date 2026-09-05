import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { build } from 'esbuild';

async function loadRoute() {
  const stubs = {
    'next/server': `export class NextResponse extends Response { static json(body, init={}) { return new NextResponse(JSON.stringify(body), {...init, headers:{'content-type':'application/json'}}); } } export class NextRequest extends Request {}`,
    '@/lib/firebase-admin': `export const adminDb = globalThis.__FAMILY_CHILD_DB;`,
    '@/lib/api-auth': `export async function verifyFirebaseToken(){return globalThis.__FAMILY_CHILD_AUTH;} export function assertNonAnonymous(){return null;}`,
    '@/lib/server-request-guards': `export class RequestBodyError extends Error { constructor(message,status=400){super(message);this.status=status;} } export async function enforceUserRateLimit(){return null;} export async function readJsonBodyWithLimit(req){return req.json();}`,
    'node:crypto': `export function randomBytes(){return {toString(){return 'runtimechild1';}}}`,
    'firebase-admin/firestore': `export const FieldValue={arrayRemove:value=>({arrayRemove:value})};`,
  };
  const result = await build({
    entryPoints:[fileURLToPath(new URL('../src/app/api/family/children/route.ts',import.meta.url))], bundle:true, format:'esm', platform:'node', write:false, logLevel:'silent',
    plugins:[{name:'stubs',setup(esbuild){esbuild.onResolve({filter:/.*/},args=>Object.hasOwn(stubs,args.path)?{path:args.path,namespace:'stub'}:null);esbuild.onLoad({filter:/.*/,namespace:'stub'},args=>({contents:stubs[args.path],loader:'js'}));}}],
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}#${Math.random()}`);
}

function memoryDb(initial) {
  const records=new Map(Object.entries(initial).map(([key,value])=>[key,structuredClone(value)]));
  const snap=ref=>({id:ref.id,ref,exists:records.has(ref.path),data:()=>structuredClone(records.get(ref.path))});
  class Ref { constructor(path){this.path=path;this.id=path.split('/').at(-1);} collection(name){return new Collection(`${this.path}/${name}`);} async get(){return snap(this);} async set(value){records.set(this.path,structuredClone(value));} async update(value){const before=records.get(this.path)||{};const after={...before};for(const [key,item] of Object.entries(value)){after[key]=item?.arrayRemove?(before[key]||[]).filter(v=>v!==item.arrayRemove):item;}records.set(this.path,after);} }
  class Collection { constructor(path){this.path=path;} doc(id){return new Ref(`${this.path}/${id}`);} where(field,_op,value){return new Query(this.path,field,value);} }
  class Query { constructor(path,field,value){this.path=path;this.field=field;this.value=value;} async get(){const depth=this.path.split('/').length+1;const docs=[...records].filter(([path,data])=>path.startsWith(`${this.path}/`)&&path.split('/').length===depth&&data[this.field]===this.value).map(([path])=>snap(new Ref(path)));return {docs,empty:docs.length===0};} }
  const db={collection:path=>new Collection(path),async recursiveDelete(ref){for(const key of [...records.keys()])if(key===ref.path||key.startsWith(`${ref.path}/`))records.delete(key);},batch(){const ops=[];return{delete:ref=>ops.push(()=>records.delete(ref.path)),update:(ref,value)=>ops.push(()=>ref.update(value)),async commit(){for(const op of ops)await op();}};}};
  return {db,records};
}

const request=(method,body)=>new Request('http://127.0.0.1/api/family/children',{method,headers:{'content-type':'application/json'},body:JSON.stringify(body)});

test('verified guardian creates, unlinks, and removes only their own disposable child', async()=>{
  const {db,records}=memoryDb({'users/parent-a':{role:'parent'},'teams/team-a':{isActive:true},'players/other':{parentId:'parent-b',joinedTeamIds:['team-a']}});
  globalThis.__FAMILY_CHILD_DB=db; globalThis.__FAMILY_CHILD_AUTH={uid:'parent-a',role:'parent'};
  const route=await loadRoute();
  const created=await route.POST(request('POST',{firstName:'Run',lastName:'Child',dateOfBirth:'2012-02-03',parentId:'parent-b'}));
  assert.equal(created.status,201); const {childId}=await created.json();
  assert.equal(records.get(`players/${childId}`).parentId,'parent-a');
  records.set(`players/${childId}`,{...records.get(`players/${childId}`),joinedTeamIds:['team-a']});
  records.set(`teams/team-a/members/${childId}`,{playerId:childId,parentId:'parent-a'});
  const unlinked=await route.PATCH(request('PATCH',{childId,teamId:'team-a',guardianUid:'parent-b'}));
  assert.equal(unlinked.status,200); assert.deepEqual(records.get(`players/${childId}`).joinedTeamIds,[]); assert.equal(records.has(`teams/team-a/members/${childId}`),false);
  const removed=await route.DELETE(request('DELETE',{childId}));
  assert.equal(removed.status,200); assert.equal(records.has(`players/${childId}`),false);
  assert.equal((await route.DELETE(request('DELETE',{childId:'other'}))).status,404);
});

test('guardian cannot partially remove a child with an independently enabled login', async()=>{
  const {db,records}=memoryDb({
    'users/parent-a':{role:'parent'},
    'players/activated-child':{parentId:'parent-a',userId:'youth-user',hasLogin:true,joinedTeamIds:['team-a']},
    'teams/team-a/members/youth-user':{playerId:'activated-child',userId:'youth-user'},
    'users/youth-user/teamMemberships/team-a':{teamId:'team-a'},
  });
  globalThis.__FAMILY_CHILD_DB=db; globalThis.__FAMILY_CHILD_AUTH={uid:'parent-a',role:'parent'};
  const route=await loadRoute();
  const removed=await route.DELETE(request('DELETE',{childId:'activated-child'}));
  assert.equal(removed.status,409);
  assert.match((await removed.json()).error,/login-enabled athlete/i);
  assert.equal(records.has('players/activated-child'),true);
  assert.equal(records.has('teams/team-a/members/youth-user'),true);
  assert.equal(records.has('users/youth-user/teamMemberships/team-a'),true);
});
