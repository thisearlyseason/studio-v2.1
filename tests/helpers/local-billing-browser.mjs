import { build } from 'esbuild';
import { createServer } from 'node:http';
import { mkdir, readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

// Local-only browser fixture. Real PricingPage and CSS, controlled synthetic
// account and responses. No credentials, Firebase writes or Stripe requests.
const port = 9365;
const destination = resolve('output/local-billing-browser');
await mkdir(destination, { recursive: true });
const seams = {
  '@/firebase': `export function useUser(){return {user:{uid:'local-browser-owner'}}} export function useAuth(){return {}}`,
  '@/components/providers/team-provider': `export function useTeam(){return window.__billingFixture.account}`,
  '@/lib/client-auth': `export async function getAuthToken(){return 'local-fixture-not-a-credential'} export function authHeader(){return {}}`,
  'next/navigation': `export function useRouter(){return {push:path=>{window.__billingFixture.navigation.push(path);document.getElementById('fixture-navigation').textContent=path}}}`,
  '@/hooks/use-toast': `export function toast(value){window.__billingFixture.toasts.push(value);document.getElementById('fixture-toast').textContent=value.title+': '+value.description}`,
};
await build({
  stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import PricingPage from './src/app/(dashboard)/pricing/page';
    window.__billingFixture={account:{isPro:true,userProfile:{plan_type:'team',billing_cycle:'monthly',stripe_subscription_id:'sub_local'}},requests:[],toasts:[],navigation:[],mode:'pending'};
    window.fetch=async(path,options)=>{
      if(!['/api/subscription/update','/api/stripe/customer-portal','/api/checkout'].includes(path))throw Error('External network forbidden in local fixture');
      const fixture=window.__billingFixture;
      fixture.requests.push({path,body:JSON.parse(options.body)});
      if(fixture.mode==='interrupted')throw Error('Simulated interrupted connection');
      const body=path==='/api/stripe/customer-portal'?{url:'http://127.0.0.1:${port}/portal'}:fixture.mode==='pending'?{pending:true,message:'Payment confirmation is pending. The plan will update after Stripe confirms payment.'}:fixture.mode==='declined'?{error:'Payment was declined.'}:{success:true};
      return new Response(JSON.stringify(body),{status:fixture.mode==='pending'?202:fixture.mode==='declined'?402:200,headers:{'Content-Type':'application/json'}});
    };
    createRoot(document.getElementById('root')).render(<PricingPage/>);
  ` },
  bundle: true, platform: 'browser', format: 'iife', outfile: destination+'/app.js', define: {'process.env':'{}'}, logLevel:'silent',
  plugins: [{name:'local-account-boundaries',setup(b){b.onResolve({filter:/.*/},a=>Object.hasOwn(seams,a.path)?{path:a.path,namespace:'fixture'}:undefined);b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:seams[a.path]}));}}],
});
let css='';
try { for(const file of await readdir('.next/static/css')) if(file.endsWith('.css'))css+=await readFile('.next/static/css/'+file,'utf8'); } catch { throw Error('Build CSS is required for browser layout evidence'); }
const server=createServer(async(req,res)=>{
  if(req.url==='/app.js'){res.setHeader('Content-Type','text/javascript');res.end(await readFile(destination+'/app.js'));return;}
  if(req.url==='/app.css'){res.setHeader('Content-Type','text/css');res.end(css);return;}
  if(req.url==='/portal'){res.end('Local simulated portal destination; no Stripe request');return;}
  res.setHeader('Content-Type','text/html');res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body><aside style="background:#fff;color:#000;padding:8px">LOCAL SIMULATION — synthetic account, no payment provider</aside><div role="status" id="fixture-toast"></div><div id="fixture-navigation"></div><div id="root"></div><script src="/app.js"></script></body></html>`);
});
server.listen(port,'127.0.0.1',()=>console.log('Local simulated billing UI: http://127.0.0.1:'+port));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>process.exit(0)));
