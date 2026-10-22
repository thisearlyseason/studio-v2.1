import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import {build} from 'esbuild';
import {pathToFileURL} from 'node:url';
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const state={calls:[],cookie:null,decoded:null,authError:null,profile:{role:'coach'}};
globalThis.__signinAudit=state;
process.env.SQUAD_PAGES_ENABLED='true';process.env.NEXT_PUBLIC_SQUAD_PAGES_ENABLED='true';
delete process.env.SQUAD_PAGES_PREVIEW_FIXTURES;
class NextResponse extends Response{
 static json(value,options){return new NextResponse(JSON.stringify(value),options)}
 static redirect(url){return new NextResponse(null,{status:307,headers:{location:String(url)}})}
 static rewrite(url,options={}){return new NextResponse(null,{...options,headers:{'x-middleware-rewrite':String(url)}})}
 static next(){return new NextResponse(null,{headers:{'x-audit-next':'true'}})}
 cookies={delete:name=>this.headers.append('set-cookie',name+'=; Max-Age=0')};
}
globalThis.__signinResponse=NextResponse;
const stubs={
 'server-only':'',
 'next/server':'export const NextResponse=globalThis.__signinResponse;export class NextRequest extends Request{};',
 'next/headers':`export async function cookies(){return{get:()=>globalThis.__signinAudit.cookie?{value:globalThis.__signinAudit.cookie}:undefined}}`,
 'next/navigation':`export function redirect(path){throw Object.assign(Error('REDIRECT'),{redirect:path})}`,
 '@/lib/firebase-admin':`const s=globalThis.__signinAudit;export function ensureAdminInit(){s.calls.push('admin-init')}export function getAdminProjectId(){return 'synthetic-audit-project'}export function getAdminStorageBucketName(){return 'synthetic.invalid'}export const adminDb={collection(){s.calls.push('database');return{doc(){return{async get(){return{exists:!!s.profile,data:()=>s.profile}}}}}}};export function getAdminAuth(){return{async verifySessionCookie(cookie,revoked){s.calls.push(['session',cookie,revoked]);if(s.authError)throw s.authError;return s.decoded}}}`,
 'firebase-admin':`export const apps=[];export function auth(){return{async verifyIdToken(token,revoked){const s=globalThis.__signinAudit;s.calls.push(['id-token',token,revoked]);if(s.authError)throw s.authError;return s.decoded},async verifySessionCookie(cookie,revoked){const s=globalThis.__signinAudit;s.calls.push(['session',cookie,revoked]);if(s.authError)throw s.authError;return s.decoded}}}export const firestore={FieldValue:{serverTimestamp(){throw Error('Provider mutation forbidden')}}};`,
 'firebase-admin/firestore':`export class Timestamp{};export class FieldPath{};export const FieldValue={serverTimestamp(){throw Error('Provider mutation forbidden')}};export function getFirestore(){throw Error('Provider forbidden')}`,
 'firebase-admin/auth':`export function getAuth(){throw Error('Provider forbidden')}`,
 'firebase-admin/storage':`export function getStorage(){throw Error('Storage forbidden')}`,
 'resend':`export class Resend{emails={send(){throw Error('Mail forbidden')}}}`,
 '@/lib/squad-pages/route-status':`export async function squadPublicRouteExists(){return true}export function squadPageNotFoundResponse(){return new Response(null,{status:404})}`,
};
async function load(entry){
 const built=await build({entryPoints:[path.join(root,entry)],bundle:true,platform:'node',format:'esm',packages:'external',write:false,logLevel:'silent',alias:{'@':root+'/src'},define:{'process.env.NEXT_PUBLIC_APP_DISTRIBUTION':JSON.stringify(process.env.AUDIT_DISTRIBUTION||'web')},plugins:[{name:'provider-boundaries',setup(b){b.onResolve({filter:/.*/},a=>Object.hasOwn(stubs,a.path)?{path:a.path,namespace:'audit'}:null);b.onLoad({filter:/.*/,namespace:'audit'},a=>({contents:stubs[a.path],loader:'js'}));}}]});
 const folder=path.join(root,'output/signin-first-boundaries');await fs.mkdir(folder,{recursive:true});const file=path.join(folder,crypto.randomUUID()+'.mjs');await fs.writeFile(file,built.outputFiles[0].text);return import(pathToFileURL(file).href);
}
const middleware=await load('src/middleware.ts');
const server=await load('src/lib/server-dashboard-auth.ts');
const api=await load('src/lib/api-auth.ts');
function reset(){state.calls=[];state.cookie=null;state.decoded={uid:'audit-user',email_verified:true,firebase:{sign_in_provider:'password'}};state.authError=null;state.profile={role:'coach'}}
function request(p,method='GET',auth){const url='http://127.0.0.1:9311'+p;const req=new Request(url,{method,headers:auth?{authorization:auth}:undefined,...(method==='POST'||method==='PATCH'?{body:'{}',headers:{'content-type':'application/json',...(auth?{authorization:auth}:{})}}:{})});req.nextUrl=new URL(url);req.nextUrl.clone=()=>new URL(url);req.cookies={get:()=>state.cookie?{value:state.cookie}:undefined};return req}
const privatePaths=['/dashboard','/dashboard/public-page','/roster','/settings','/team','/teams/new','/club','/competition','/family','/admin','/subscriptions','/subscriptions/','/pricing','/leagues/registration/audit-league'];
test('every dashboard-group page rejects a signed-out request before rendering',async()=>{
 const group=path.join(root,'src/app/(dashboard)');const pages=(await fs.readdir(group,{recursive:true})).filter(p=>p.endsWith('page.tsx'));
 assert(pages.length>=35);
 for(const page of pages){reset();const pathname='/'+page.replace(/\/?page\.tsx$/,'').split('/').map(s=>s.startsWith('[')?'signin-audit':s).join('/');const r=await middleware.middleware(request(pathname));assert([307,403].includes(r.status),pathname+' must be gated, received '+r.status);assert.deepEqual(state.calls,[],pathname)}
});
for(const p of privatePaths)test('middleware signed-out gate '+p,async()=>{reset();const r=await middleware.middleware(request(p+'?view=audit'));if(process.env.AUDIT_DISTRIBUTION==='store'&&p==='/pricing'){assert.equal(r.status,403);return}assert.equal(r.status,307);const u=new URL(r.headers.get('location'));assert.equal(u.pathname,'/login');assert.equal(u.searchParams.get('returnTo'),p+'?view=audit');assert.deepEqual(state.calls,[])});
test('expired or revoked session cannot pass protected middleware',async()=>{for(const code of ['auth/session-cookie-expired','auth/session-cookie-revoked']){reset();state.cookie='synthetic';state.authError=Object.assign(Error(code),{code});const r=await middleware.middleware(request('/subscriptions'));assert.equal(r.status,307);assert.match(r.headers.get('set-cookie'),/__session=;/);assert(state.calls.some(x=>Array.isArray(x)&&x[0]==='session'&&x[2]===true));assert(!state.calls.includes('database'))}});
test('valid verified session passes; unverified identity cannot pass',async()=>{reset();state.cookie='synthetic';assert.equal((await middleware.middleware(request('/dashboard'))).headers.get('x-audit-next'),'true');state.decoded.email_verified=false;assert.equal((await middleware.middleware(request('/dashboard'))).status,307)});
test('public marketing, support, Pages and operational registration routes stay outside private gate',async()=>{for(const p of ['/','/login','/privacy','/terms','/safety','/how-to','/sports','/sports-hub','/p','/leagues/scorekeeper/audit','/tournaments/preview','/register/squad','/events/register/']){reset();const r=await middleware.middleware(request(p));assert.notEqual(r.status,307,p);assert(!state.calls.some(x=>Array.isArray(x)&&x[0]==='session'),p)}});
test('server template requires an actual session even where middleware formerly missed',async()=>{for(const p of ['/subscriptions','/pricing','/leagues/registration/audit']){reset();await assert.rejects(server.requireDashboardSession(p),e=>e.redirect==='/api/auth/session?returnTo='+encodeURIComponent(p));assert.deepEqual(state.calls,[])}});
test('server template rejects expired session, missing profile, blocked account and unauthorized admin',async()=>{reset();state.cookie='synthetic';state.authError=Error('expired');await assert.rejects(server.requireDashboardSession('/dashboard'),e=>e.redirect?.startsWith('/api/auth/session'));reset();state.cookie='synthetic';state.profile=null;await assert.rejects(server.requireDashboardSession('/dashboard'),e=>e.redirect==='/onboarding');state.profile={role:'coach',accountStatus:'disabled'};await assert.rejects(server.requireDashboardSession('/dashboard'),e=>e.redirect?.startsWith('/api/auth/session'));state.profile={role:'coach'};await assert.rejects(server.requireDashboardSession('/admin'),e=>e.redirect==='/dashboard')});
test('shared API verifier denies missing bearer before SDK/database access',async()=>{reset();assert.equal((await api.verifyFirebaseToken(request('/api/audit'))).status,401);assert.deepEqual(state.calls,[])});
test('shared API verifier checks revoked and expired tokens before database access',async()=>{for(const code of ['auth/id-token-expired','auth/id-token-revoked','auth/argument-error']){reset();state.authError=Object.assign(Error(code),{code});assert.equal((await api.verifyFirebaseToken(request('/api/audit','GET','Bearer synthetic-invalid'))).status,401);assert(state.calls.some(x=>Array.isArray(x)&&x[0]==='id-token'&&x[2]===true));assert(!state.calls.includes('database'))}});
test('shared API verifier denies unverified/disabled users and anonymous management',async()=>{reset();state.decoded.email_verified=false;assert.equal((await api.verifyFirebaseToken(request('/api/audit','GET','Bearer synthetic'))).status,403);assert(!state.calls.includes('database'));reset();state.profile={accountStatus:'disabled'};assert.equal((await api.verifyFirebaseToken(request('/api/audit','GET','Bearer synthetic'))).status,403);assert.equal(api.assertNonAnonymous({uid:'demo',signInProvider:'anonymous'}).status,403)});
const handlers={
 'teams/chat':['GET','POST','PATCH'],'teams/games':['POST'],'teams/create':['POST'],'teams/join':['POST'],'teams/season-reset':['POST'],
 'teams/events/action':['POST'],'teams/alerts':['GET'],'teams/members/lifecycle':['POST'],'teams/library':['POST'],
 'facilities/update':['POST'],'facilities/delete':['POST'],'organizations/squads':['GET','POST','DELETE'],'organizations/waivers':['POST','PATCH','DELETE'],
 'schools/admins':['POST','PATCH','DELETE'],'admin/moderation':['GET','POST'],'leagues/lifecycle':['POST','PATCH','DELETE'],
 'tournaments/lifecycle':['POST'],'registrations/config':['POST'],'family/children':['POST','PATCH','DELETE'],'family/teams':['GET'],
 'squad-pages':['GET','POST'],'squad-pages/entities':['GET'],
};
for(const [p,methods] of Object.entries(handlers))test('actual private handler denies unauthenticated '+p,async()=>{
 const prior=process.env.SQUAD_PAGES_ENABLED;process.env.SQUAD_PAGES_ENABLED='true';
 try{const route=await load('src/app/api/'+p+'/route.ts');for(const method of methods){reset();assert.equal(typeof route[method],'function',p+' '+method);const response=await route[method](request('/api/'+p,method));assert.equal(response.status,401,p+' '+method);assert.deepEqual(state.calls,[],p+' must stop before providers/database')}}finally{if(prior===undefined)delete process.env.SQUAD_PAGES_ENABLED;else process.env.SQUAD_PAGES_ENABLED=prior}
});
