import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {communicationDb} from './helpers/communication-route-harness.mjs';
test('signup notifications use verified admin identities, deduplicate, and retry email without losing in-app history',async()=>{
 const {db,records}=communicationDb({'users/new':{plan_type:'team'},'users/admin':{role:'superadmin'},'users/forged':{role:'superadmin'}});
 let fail=false;const emails=[];
 const auth={getUser:async()=>({email:'new@example.test',displayName:'<Member>',providerData:[{}],metadata:{creationTime:new Date().toISOString()}}),getUsers:async()=>({users:[{uid:'admin',email:'owner@example.test',customClaims:{role:'superadmin'}},{uid:'forged',email:'forged@example.test',customClaims:{}}]})};
 globalThis.signupTest={db,auth,resend:{emails:{send:async(m,o)=>{if(fail)return {error:{message:'unavailable'}};emails.push({m,o});return {data:{id:'email-'+emails.length}};}}}};
 const stubs={'@/lib/firebase-admin':'export const adminDb=globalThis.signupTest.db;export const getAdminAuth=()=>globalThis.signupTest.auth;','@/lib/server-resend-client':'export const getResend=()=>globalThis.signupTest.resend;'};
 const b=await build({entryPoints:['src/lib/server-signup-notification.ts'],bundle:true,platform:'node',format:'esm',write:false,plugins:[{name:'boundaries',setup(b){b.onResolve({filter:/.*/},a=>stubs[a.path]?{path:a.path,namespace:'stub'}:undefined);b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:stubs[a.path],loader:'js'}));}}]});
 const {notifySignup}=await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'));
 assert.equal(await notifySignup('new','free'),'sent');assert.equal(await notifySignup('new','free'),'already_processed');assert.equal(emails.length,1);assert.deepEqual(emails[0].m.to,['owner@example.test']);assert.match(emails[0].m.html,/&lt;Member&gt;/);
 fail=true;await assert.rejects(notifySignup('new','paid','sub_a'));assert.equal([...records.values()].filter(r=>r.emailStatus==='failed').length,1);
 fail=false;assert.equal(await notifySignup('new','paid','sub_a'),'sent');assert.equal(await notifySignup('new','paid','sub_a'),'already_processed');assert.equal(emails.length,2);assert.equal([...records.values()].filter(r=>r.emailStatus==='sent').length,2);
 const oldOwner=process.env.OWNER_NOTIFICATION_EMAIL;
 try {
  process.env.OWNER_NOTIFICATION_EMAIL='actual-owner@example.test';
  auth.getUserByEmail=async email=>({uid:'actual-admin',email,customClaims:{role:'superadmin'}});
  assert.equal(await notifySignup('new','free'),'sent');
  assert.deepEqual(emails.at(-1).m.to,['actual-owner@example.test']);
  assert.equal(await notifySignup('new','free'),'already_processed');
  auth.getUserByEmail=async email=>({uid:'not-admin',email,customClaims:{role:'coach'}});
  await assert.rejects(notifySignup('new','paid','sub_bad'),/No verified superadmin/);
 } finally { if(oldOwner===undefined)delete process.env.OWNER_NOTIFICATION_EMAIL;else process.env.OWNER_NOTIFICATION_EMAIL=oldOwner; }
 delete globalThis.signupTest;
});
test('signup route keeps signup identity server-owned and limits test/history actions to superadmins',async()=>{
 const {db}=communicationDb({});let auth={uid:'member',role:'coach',signInProvider:'password'};const calls=[];
 globalThis.signupRouteTest={db,getAuth:()=>auth,notify:async(...args)=>calls.push(args)};
 const stubs={'@/lib/firebase-admin':'export const adminDb=globalThis.signupRouteTest.db;','@/lib/api-auth':'export const verifyFirebaseToken=async()=>globalThis.signupRouteTest.getAuth();','@/lib/server-signup-notification':'export const notifySignup=globalThis.signupRouteTest.notify;','next/server':'export class NextResponse extends Response {static json(body,init={}){return new NextResponse(JSON.stringify(body),init)}}'};
 const b=await build({entryPoints:['src/app/api/admin/signup-alerts/route.ts'],bundle:true,platform:'node',format:'esm',write:false,plugins:[{name:'boundaries',setup(b){b.onResolve({filter:/.*/},a=>stubs[a.path]?{path:a.path,namespace:'stub'}:undefined);b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:stubs[a.path],loader:'js'}));}}]});
 const route=await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'));
 const req=q=>new Request('https://example.test/api/admin/signup-alerts'+q,{method:'POST',body:JSON.stringify({uid:'victim',kind:'paid',email:'attacker@example.test'})});
 assert.equal((await route.POST(req(''))).status,200);assert.deepEqual(calls,[['member','free']]);
 assert.equal((await route.POST(req('?test=true'))).status,403);assert.equal((await route.GET(req(''))).status,403);
 auth={...auth,signInProvider:'anonymous'};assert.equal((await route.POST(req(''))).status,403);
 auth={uid:'admin',role:'superadmin',signInProvider:'password'};assert.equal((await route.GET(req(''))).status,200);assert.equal((await route.POST(req('?test=true'))).status,200);assert.equal(calls.length,3);
 delete globalThis.signupRouteTest;
});
