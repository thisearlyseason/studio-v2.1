import { build } from 'esbuild';
import { createServer } from 'node:http';
import { mkdir, readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

// Real web purchase components, synthetic identity and local responses only.
// No provider, Firebase, credentials, purchases or hosted writes.
const port=9366, root=process.cwd(), out=resolve('scratch/saas-tax-implementation/browser');
await mkdir(out,{recursive:true});
const seams={
 '@/firebase':`export function useUser(){return {user:window.fixture.identity}} export function useAuth(){return {currentUser:{isAnonymous:false}}}`,
 '@/components/providers/team-provider':`import {useSyncExternalStore} from 'react'; export function useTeam(){return useSyncExternalStore(l=>{window.fixture.listeners.add(l);return()=>window.fixture.listeners.delete(l)},()=>window.fixture.account)}`,
 '@/lib/client-auth':`export async function getAuthToken(){return 'local-synthetic-auth'} export function authHeader(){return {}}`,
 'next/navigation':`export function usePathname(){return '/local-tax-fixture'} export function useRouter(){return {push:p=>{document.getElementById('fixture-status').textContent='Local navigation: '+p}}}`,
 '@/lib/use-subscription-capabilities':`export function useSubscriptionCapabilities(){return {planChangesAllowed:true,addonsAllowed:true,portalAllowed:true}}`,
 '@/components/SquadIdentity':`export function SquadIdentity(){return null}`,
 '@/components/native-billing/NativeSubscriptions':`export function NativeSubscriptions(){return null}`,
 '@/hooks/use-toast':`export function toast(v){document.getElementById('fixture-status').textContent=v.title+': '+v.description}`,
};
for(const [name,source]of Object.entries({pricing:'src/app/(dashboard)/pricing/page',billing:'src/app/(dashboard)/dashboard/billing/page',paywall:'src/components/StripePaywall'})) {
 await build({stdin:{resolveDir:root,loader:'tsx',contents:`
 import React from 'react';import{createRoot}from'react-dom/client';
 import ${name==='paywall'?'{StripePaywall as Page}':'Page'} from './${source}';
 import{PRICING_CONFIG,EXTRA_TEAM_CONFIG}from'./src/lib/pricing';
 const profile={id:'local-tax-owner',email:'synthetic@example.test',plan_type:'free',billing_cycle:'monthly',isDemo:false,team_limit:0};
 window.fixture={identity:{uid:profile.id},listeners:new Set(),requests:[],account:{isPro:false,user:profile,userProfile:profile,teams:[],activeTeam:{id:'local-team-a',name:'Local team'},proQuotaStatus:{remaining:0,used:0,total:0},isPaywallOpen:true,setIsPaywallOpen:()=>{},updateTeamPlan:async()=>{}}};
 window.fetch=async(path,options={})=>{
  if(path==='/api/billing/display-catalog')return new Response(JSON.stringify({prices:[...PRICING_CONFIG.flatMap(p=>[[p.monthlyPriceId,p.monthlyPrice,'month'],[p.annualPriceId,p.annualPrice,'year']]),[EXTRA_TEAM_CONFIG.monthlyPriceId,15.99,'month'],[EXTRA_TEAM_CONFIG.annualPriceId,159,'year']].map(([id,amount,interval])=>({id,amount:Number(String(amount).replace(/[$,]/g,'')),currency:'USD',formatted:'USD '+Number(String(amount).replace(/[$,]/g,'')).toFixed(2),interval,fetchedAt:Date.now()}))}),{status:200});
  if(!['/api/checkout','/api/stripe/create-checkout','/api/subscription/update','/api/stripe/customer-portal'].includes(path))throw Error('External network forbidden in local fixture');
  window.fixture.requests.push({path,body:JSON.parse(options.body)});document.getElementById('fixture-request').textContent=JSON.stringify(window.fixture.requests);
  return new Response(JSON.stringify({error:'Local test stopped before any provider action.'}),{status:409});
 };
 function change(which){const f=window.fixture;const old=f.account;const profile={...old.user};if(which==='account'){profile.id+='b';f.identity={uid:profile.id};}if(which==='subscriber'){profile.stripe_subscription_id='sub_local';profile.stripe_customer_id='cus_local';profile.plan_type='team';}
 f.account={...old,user:profile,userProfile:profile,...(which==='team'?{activeTeam:{id:old.activeTeam.id+'b'}}:{}),...(which==='subscriber'?{isPro:true}:{})};for(const l of f.listeners)l();}
 createRoot(document.getElementById('root')).render(<><aside style={{background:'#fff',color:'#000',padding:8}}>LOCAL TEST ONLY — synthetic account, no payment provider.<button onClick={()=>change('team')}>Switch test team</button><button onClick={()=>change('account')}>Switch test account</button><button onClick={()=>change('subscriber')}>Load existing subscriber</button><p role="status" id="fixture-status"/><output id="fixture-request">[]</output></aside><Page/></>);
 `},bundle:true,jsx:'automatic',platform:'browser',format:'iife',outfile:out+'/'+name+'.js',define:{'process.env':'{}','process.env.NEXT_PUBLIC_APP_DISTRIBUTION':JSON.stringify('web'),'process.env.NODE_ENV':JSON.stringify('development')},logLevel:'silent',plugins:[{name:'local-boundaries',setup(b){b.onResolve({filter:/.*/},a=>Object.hasOwn(seams,a.path)?{path:a.path,namespace:'fixture'}:undefined);b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:seams[a.path],resolveDir:root}));}}]});
}
let css='';for(const file of await readdir('.next/static/css'))if(file.endsWith('.css'))css+=await readFile('.next/static/css/'+file,'utf8');
const server=createServer(async(req,res)=>{
 const path=new URL(req.url,'http://127.0.0.1').pathname;
 if(path==='/app.css'){res.setHeader('Content-Type','text/css');res.end(css);return;}
 if(/^\/(pricing|billing|paywall)\.js$/.test(path)){res.setHeader('Content-Type','text/javascript');res.end(await readFile(out+path));return;}
 if(!['/pricing','/billing','/paywall'].includes(path)){res.statusCode=404;res.end();return;}
 res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="'+path+'.js"></script></body></html>');
});server.listen(port,'127.0.0.1',()=>console.log('Local tax UI fixtures ready: http://127.0.0.1:'+port+'/pricing'));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
