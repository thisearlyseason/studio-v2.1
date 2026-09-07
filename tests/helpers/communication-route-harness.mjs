import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import {jsPDF} from 'jspdf';

// Only network/SDK boundaries are replaced; the route and authority policy run unchanged.
export async function loadCommunicationRoute(relativePath, db, auth) {
  const key = `communication_${Date.now()}_${Math.random()}`;
  globalThis[key] = { db, auth, jsPDF };
  const stubs = {
    'jspdf': `export const jsPDF = globalThis[${JSON.stringify(key)}].jsPDF;`,
    'resend': `export class Resend { batch = {send: async (messages, options) => {const db=globalThis[${JSON.stringify(key)}].db;db.emails.push(structuredClone({messages, options}));if(db.emailSendFailure)return {error:{message:db.emailSendFailure}};return {data:{data:messages.map((_,i)=>({id:'test-email-'+i}))}};}}; }`,
    'next/server': `export class NextResponse extends Response { static json(body, init={}) { return new NextResponse(JSON.stringify(body), init); } }`,
    '@/lib/firebase-admin': `export const adminDb = globalThis[${JSON.stringify(key)}].db; export function getAdminStorageBucketName() {return 'demo-test.appspot.com';}`,
    'firebase-admin/storage': `export function getStorage() {return {bucket:()=>globalThis[${JSON.stringify(key)}].db.bucket};}`,
    'firebase-admin/firestore': `export class FieldPath {constructor(...segments){this.segments=segments;}} export const FieldValue={increment:value=>({__increment:value}),serverTimestamp:()=>({__serverTimestamp:true}),arrayUnion:(...values)=>({__arrayUnion:values}),arrayRemove:(...values)=>({__arrayRemove:values}),delete:()=>({__delete:true})};`,
    'firebase-admin': `export const firestore={FieldValue:{serverTimestamp:()=>({__serverTimestamp:true})}};`,
    '@/lib/server-notification-delivery': `export async function sendNotificationToUsers(input){const db=globalThis[${JSON.stringify(key)}].db;db.notifications.push(structuredClone(input));db.onNotificationSend?.();if(db.notificationSendFailure)throw new Error(db.notificationSendFailure);return db.notificationResult||{fcmSuccessCount:0,fcmFailureCount:0,webPushSuccessCount:0,webPushFailureCount:0};}`,
    '@/lib/api-auth': `export async function verifyFirebaseToken() { return globalThis[${JSON.stringify(key)}].auth; } export function assertNonAnonymous(auth){return auth;}`,
    '@/lib/server-request-guards': `export class RequestBodyError extends Error {} export async function enforceUserRateLimit() { return null; } export async function readJsonBodyWithLimit(req) { return req.json(); }`,
  };
  const result = await build({ entryPoints: [fileURLToPath(new URL(relativePath, import.meta.url))], bundle:true, format:'esm', platform:'node', write:false, logLevel:'silent', plugins:[{ name:'communication-boundaries', setup(bundler) {
    bundler.onResolve({filter:/.*/}, args => Object.hasOwn(stubs,args.path) ? {path:args.path,namespace:'boundary'} : null);
    bundler.onLoad({filter:/.*/,namespace:'boundary'},args=>({contents:stubs[args.path],loader:'js'}));
  }}] });
  const route = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
  return { route, dispose() { delete globalThis[key]; } };
}

export function communicationDb(initial,{beforeTransaction,serializeTransactions=false}={}) {
  const records = new Map(Object.entries(initial).map(([path,value])=>[path,structuredClone(value)]));
  const objects = new Map();
  let sequence=0;
  const applyUpdate=(prior,value)=>{
    const next=structuredClone(prior);
    for(const [key,item] of Object.entries(value)) {
      const parts=key.split('.');let target=next;
      for(const part of parts.slice(0,-1)) target=target[part] ||= {};
      const field=parts.at(-1);
      if(item?.__delete)delete target[field];
      else if(item?.__increment)target[field]=Number(target[field]||0)+item.__increment;
      else if(item?.__arrayUnion)target[field]=[...new Set([...(Array.isArray(target[field])?target[field]:[]),...item.__arrayUnion])];
      else if(item?.__arrayRemove)target[field]=(Array.isArray(target[field])?target[field]:[]).filter(entry=>!item.__arrayRemove.includes(entry));
      else target[field]=structuredClone(item);
    }
    return next;
  };
  const snapshot = ref => ({ref,id:ref.id,exists:records.has(ref.path),data:()=>structuredClone(records.get(ref.path))});
  class Ref {
    constructor(path) {this.path=path;this.id=path.split('/').at(-1);}
    collection(name) {return new Query(`${this.path}/${name}`);}
    async get() {return snapshot(this);}
    async create(value) {if(records.has(this.path)) throw Object.assign(new Error('exists'),{code:6});records.set(this.path,structuredClone(value));}
    async set(value) {records.set(this.path,structuredClone(value));}
    async update(value) {
      records.set(this.path,applyUpdate(records.get(this.path),value));
    }
    async delete() {records.delete(this.path);}
  }
  class Query {
    constructor(path,filters=[],group=false) {Object.assign(this,{path,filters,group});}
    doc(id=`generated-${++sequence}`) {return new Ref(`${this.path}/${id}`);}
    where(field,operator,value) {
      if(!['==','array-contains'].includes(operator)) throw Error('Unsupported test query');
      return new Query(this.path,[...this.filters,[field,operator,value]],this.group);
    }
    limit(max) {const query=new Query(this.path,this.filters,this.group);query.max=max;return query;}
    orderBy() {return this;}
    async get() {
      const docs=[...records].filter(([path,value])=>(this.group ? path.split('/').at(-2)===this.path : path.startsWith(`${this.path}/`)&&path.split('/').length===this.path.split('/').length+1)&&this.filters.every(([field,operator,want])=>operator==='array-contains'?Array.isArray(value[field])&&value[field].includes(want):value[field]===want)).slice(0,this.max).map(([path])=>snapshot(new Ref(path)));
      return {docs,size:docs.length,empty:docs.length===0};
    }
  }
  const notifications=[];let transactionTail=Promise.resolve();
  const executeTransaction=async work=>{
    if(beforeTransaction) await beforeTransaction({records});
    const pending=[];
    const result=await work({get:ref=>ref.get(),update:(ref,...args)=>pending.push(()=>{if(args[0]?.segments){const value={};value[args[0].segments.join('.')]=args[1];records.set(ref.path,applyUpdate(records.get(ref.path),value));}else records.set(ref.path,applyUpdate(records.get(ref.path),args[0]));}),create:(ref,value)=>pending.push(()=>ref.create(value)),set:(ref,value)=>pending.push(()=>ref.set(value)),delete:ref=>pending.push(()=>ref.delete())});
    for(const write of pending) await write(); return result;
  };
  const db={notifications,emails:[],collection:path=>new Query(path),doc:path=>new Ref(path),collectionGroup:path=>new Query(path,[],true),async runTransaction(work) {
    if(!serializeTransactions)return executeTransaction(work);
    const run=transactionTail.then(()=>executeTransaction(work));transactionTail=run.catch(()=>{});return run;
  },batch() {const pending=[];return {delete:ref=>pending.push(()=>ref.delete()),set:(ref,value)=>pending.push(()=>ref.set(value)),async commit(){for(const write of pending)await write();}};}};
  db.bucket={file:path=>({
    async save(bytes,options) {if(objects.has(path)&&options?.preconditionOpts?.ifGenerationMatch===0) throw Object.assign(Error('precondition'),{code:412});objects.set(path,{bytes:Buffer.from(bytes),metadata:{...options.metadata,size:bytes.length}});},
    async exists(){return [objects.has(path)];},
    async getMetadata(){return [objects.get(path)?.metadata];},
    async download(){return [objects.get(path)?.bytes];},
    async delete(){objects.delete(path);},
  })};
  return {db,records,objects,notifications};
}

export function communicationRequest(body) {return new Request('http://127.0.0.1/api/teams/feed/action',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});}
