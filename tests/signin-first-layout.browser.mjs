// Actual dashboard client layout; auth/team/Next boundaries are controlled.
// This tests fail-closed rendering, not a Firebase session or deployed editor.
import {build} from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'/Users/tylerans/.npm/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs');
const root=path.resolve(new URL('..',import.meta.url).pathname);
const out=process.env.AUDIT_OUTPUT;assert(out);await fs.mkdir(out,{recursive:true});
const shared=`import{useSyncExternalStore}from'react';import{flushSync}from'react-dom';let state=window.initialState;const listeners=new Set();window.auditSet=next=>flushSync(()=>{state={...state,...next};listeners.forEach(f=>f())});export function useStateFixture(){return useSyncExternalStore(f=>{listeners.add(f);return()=>listeners.delete(f)},()=>state)};export const auth={currentUser:null};export const router={push:p=>window.navigation.push(p),replace:p=>window.navigation.push(p)};`;
const stubs={
 'audit-state':shared,
 '@/firebase':`import{useStateFixture,auth}from'audit-state';export function useUser(){return useStateFixture().auth}export function useAuth(){return auth}export function useFirestore(){return {}}`,
 '@/components/providers/team-provider':`import{useStateFixture}from'audit-state';export function useTeam(){return useStateFixture().team}`,
 'next/navigation':`import{router}from'audit-state';export function useRouter(){return router}export function usePathname(){return'/dashboard'}const query=new URLSearchParams();export function useSearchParams(){return query}`,
 'next/link':`import React from'react';export default function Link(p){return <a {...p}/>}`,
 '@/components/layout/Shell':`import React from'react';export default function Shell({children}){return <main data-private-shell>{children}</main>}`,
 '@/components/layout/ErrorBoundary':`import React from'react';export function ErrorBoundary({children}){return <>{children}</>}`,
 '@/components/ui/button':`import React from'react';export function Button({variant,size,...p}){return <button {...p}/>}`,
 '@/lib/db-seeder':`export function seedGuestDemoTeam(){throw Error('No seeding allowed')}`,
 'firebase/auth':`export function signOut(){throw Error('No real auth operation allowed')}`,
 '@/hooks/use-toast':`export function toast(){}`,
 '@/lib/client-auth':`export const DEMO_EXIT_PENDING_KEY='demo-exit',DEMO_START_KEY='demo-start';export function getAuthToken(){throw Error('No auth operation allowed')}export function authHeader(){return{}}export function clearBrowserSession(){throw Error('No session mutation allowed')}export function markDemoExitPending(){throw Error('No demo operation allowed')}`,
};
for(const name of ['AlertOverlay','QuotaResolutionOverlay','BetaNotificationBanner'])stubs['@/components/layout/'+name]=`export function ${name}(){return null}`;
stubs['@/components/StripePaywall']='export function StripePaywall(){return null}';
await build({stdin:{contents:`import React from'react';import{createRoot}from'react-dom/client';import Layout from'./src/app/(dashboard)/layout';createRoot(document.getElementById('root')).render(<Layout><div data-private-child>Private management content</div></Layout>);`,resolveDir:root,loader:'tsx'},bundle:true,format:'iife',platform:'browser',outfile:path.join(out,'bundle.js'),jsx:'automatic',define:{'process.env.NODE_ENV':'"production"','process.env.NEXT_PUBLIC_APP_DISTRIBUTION':JSON.stringify(process.env.AUDIT_DISTRIBUTION||'web')},alias:{'@':root+'/src'},plugins:[{name:'controlled-boundaries',setup(b){b.onResolve({filter:/.*/},a=>Object.hasOwn(stubs,a.path)?{path:a.path,namespace:'fixture'}:undefined);b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:stubs[a.path],loader:'jsx',resolveDir:root}));}}]});
const result={scope:'Actual client layout with controlled auth/team/Next boundaries; no provider calls',cases:[],errors:[],blockedRequests:[]};let server,browser;
const absent={user:null,isUserLoading:false,isAuthResolved:true};
const pending={...absent,isUserLoading:true,isAuthResolved:false};
const profile={id:'audit-coach',role:'coach',plan_type:'free'};
const user={uid:'audit-coach',emailVerified:true,isAnonymous:false};
const team={teams:[],isTeamsLoading:false,isSeedingDemo:false,setIsSeedingDemo:()=>{},user:null,activeTeam:null,isPrimaryClubAuthority:false,isSchoolMode:false,isEliteClubMode:false,isParent:false,isSuperAdmin:false};
try{
 server=http.createServer(async(req,res)=>{if(req.url==='/bundle.js'){res.setHeader('content-type','text/javascript');res.end(await fs.readFile(path.join(out,'bundle.js')))}else if(req.url==='/'){res.setHeader('content-type','text/html');res.end('<!doctype html><html><body><div id="root"></div><script src="/bundle.js"></script></body></html>')}else{res.writeHead(404);res.end()}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({channel:'chrome',headless:true});
 async function scenario(name,auth,teamOverrides,action,expected){
  const context=await browser.newContext();const page=await context.newPage();
  page.on('pageerror',e=>result.errors.push({name,error:e.message}));
  await context.route('**/*',r=>{const q=r.request();if(q.method()==='GET'&&new URL(q.url()).origin===origin)return r.continue();result.blockedRequests.push(q.method()+' '+q.url());return r.abort()});
  await context.addInitScript(({auth,team})=>{window.navigation=[];window.initialState={auth,team:{...team,setIsSeedingDemo:()=>{}}};const original=setTimeout;window.setTimeout=(f,ms,...args)=>{if(ms===30000){window.auditTimeout=f;return 999999}return original(f,ms,...args)};window.fetch=()=>{throw Error('Unexpected fetch forbidden')};},{auth,team:{...team,...teamOverrides}});
  try{await page.goto(origin);await page.waitForFunction(()=>typeof window.auditTimeout==='function');await action(page);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));const count=await page.locator('[data-private-child]').count();const shell=await page.locator('[data-private-shell]').count();const row={name,privateChild:count,privateShell:shell,navigation:await page.evaluate(()=>window.navigation)};result.cases.push(row);if(process.env.AUDIT_REPRODUCE!=='1'){assert.equal(count,expected,name);assert.equal(shell,expected,name)}}finally{await context.close()}
 }
 const skip=async p=>{const b=p.getByRole('button',{name:'Skip Loading',exact:true});if(await b.count())await b.click()};
 const timeout=async p=>{await p.evaluate(()=>window.auditTimeout());if(process.env.AUDIT_REPRODUCE!=='1'){await p.getByRole('link',{name:'Go to sign in',exact:true}).waitFor();assert.equal(await p.getByRole('link',{name:'Go to sign in',exact:true}).getAttribute('href'),'/login?returnTo=%2Fdashboard')}};
 await scenario('unresolved-auth-skip',pending,{},skip,0);
 await scenario('unresolved-auth-hard-timeout',pending,{},timeout,0);
 await scenario('signed-out-skip',absent,{},skip,0);
 await scenario('signed-out-timeout-stale-profile',absent,{user:profile},timeout,0);
 await scenario('authenticated-missing-profile-timeout',{...absent,user}, {},timeout,0);
 await scenario('authenticated-ready',{...absent,user},{user:profile},async()=>{},1);
 await scenario('authenticated-team-loading-skip',{...absent,user},{user:profile,isTeamsLoading:true},skip,1);
 await scenario('session-lost-after-ready',{...absent,user},{user:profile},async p=>{await p.locator('[data-private-child]').waitFor();await p.evaluate(()=>window.auditSet({auth:{user:null,isAuthResolved:true,isUserLoading:false}}));await timeout(p)},0);
 const otherUser={uid:'audit-other',emailVerified:true,isAnonymous:false};
 const switchUser=async p=>p.evaluate(other=>window.auditSet({auth:{user:other,isAuthResolved:true,isUserLoading:false}}),otherUser);
 await scenario('changed-user-stale-profile',{...absent,user:otherUser},{user:profile},skip,0);
 await scenario('changed-user-after-skip',{...absent,user},{user:profile,isTeamsLoading:true},async p=>{await skip(p);await p.locator('[data-private-child]').waitFor();await switchUser(p)},0);
 await scenario('changed-user-after-timeout',{...absent,user},{user:profile,isTeamsLoading:true},async p=>{await p.evaluate(()=>window.auditTimeout());await p.locator('[data-private-child]').waitFor();await switchUser(p);await p.getByRole('link',{name:'Go to sign in',exact:true}).waitFor()},0);
 await scenario('changed-user-matching-profile-recovers',{...absent,user:otherUser},{user:profile},async p=>{assert.equal(await p.locator('[data-private-child]').count(),0);await p.evaluate(()=>window.auditSet({team:{...window.initialState.team,user:{id:'audit-other',role:'coach',plan_type:'free'}}}))},1);
 await scenario('history-return-after-signout',{...absent,user},{user:profile},async p=>{await p.locator('[data-private-child]').waitFor();await p.evaluate(()=>{history.pushState({},'','?history=private');window.auditSet({auth:{user:null,isAuthResolved:true,isUserLoading:false}});history.back()});await p.waitForURL(url=>!url.search);await p.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})))},0);
 assert.deepEqual(result.errors,[]);assert.deepEqual(result.blockedRequests,[]);
 result.status=process.env.AUDIT_REPRODUCE==='1'?'BASELINE_OBSERVED':'PASSED';
}catch(e){result.status='FAILED';result.failure=e.stack;process.exitCode=1}finally{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));result.ownedBrowserAndServerClosed=true;await fs.writeFile(path.join(out,'results.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result))}
