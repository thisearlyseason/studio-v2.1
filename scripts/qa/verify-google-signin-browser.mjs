import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

// Exercise the real Login page. Only external authentication, routing and image
// boundaries are replaced; Firebase's interactive popup is deliberately deferred.
const cli = process.env.PLAYWRIGHT_CLI;
if (!cli) throw new Error('Set PLAYWRIGHT_CLI to the installed Playwright CLI wrapper.');
const session = `google-signin-${process.pid}`;
const exec = promisify(execFile);
const stubs = {
  'next/navigation': `export const useRouter=()=>({push(){},replace(){}});`,
  'next/link': `import React from 'react';export default function Link({href,children,...p}){return <a href={href} {...p}>{children}</a>}`,
  'next/image': `import React from 'react';export default function Image({fill,priority,quality,unoptimized,...p}){return <img {...p}/>}`,
  '@/firebase': `const auth={};const db={};export const useAuth=()=>auth;export const useFirestore=()=>db;export const useUser=()=>({user:null,isUserLoading:false});`,
  'firebase/firestore': `export const doc=()=>({});export const getDoc=async()=>({exists:()=>false});export const updateDoc=async()=>{};`,
  'firebase/auth': `export class GoogleAuthProvider{};export const browserPopupRedirectResolver={};
    export function signInWithPopup(auth,provider,resolver){if(!(provider instanceof GoogleAuthProvider)||resolver!==browserPopupRedirectResolver)throw Error('Mismatched popup provider');window.popupAttempts=(window.popupAttempts||0)+1;return new Promise((resolve,reject)=>{window.finishPopup=resolve;window.failPopup=reject;});}
    export const signInWithEmailAndPassword=async()=>{};export const signInAnonymously=async()=>{};export const signOut=async()=>{};export const sendPasswordResetEmail=async()=>{};`,
  '@/lib/client-auth': `export const clearBrowserSession=async()=>{};export const establishBrowserSession=async()=>{};export const bootstrapDemoWorkspace=async()=>{};`,
};
const bundle = await build({
  stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import Login from './src/app/login/page';import {Toaster} from './src/components/ui/toaster';createRoot(document.getElementById('root')).render(<><Login/><Toaster/></>);`, loader: 'tsx', resolveDir: process.cwd() },
  bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' }, alias: { '@': path.join(process.cwd(), 'src') },
  plugins: [{ name: 'external-login-boundaries', setup(b) {
    b.onResolve({ filter: /.*/ }, args => Object.hasOwn(stubs,args.path) ? { path: args.path, namespace: 'boundary' } : null);
    b.onLoad({ filter: /.*/, namespace: 'boundary' }, args => ({ contents: stubs[args.path], loader: 'tsx', resolveDir: process.cwd() }));
  } }],
});
const server = createServer((req,res) => {
  if (req.url === '/app.js') { res.setHeader('Content-Type','text/javascript');res.end(bundle.outputFiles[0].text); }
  else if(req.url === '/favicon.ico') { res.writeHead(204);res.end(); }
  else { res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><body><div id="root"></div><script src="/app.js"></script></body></html>'); }
});
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
const run = async args => {
  const {stdout,stderr} = await exec(cli,[`-s=${session}`,...args],{timeout:45000,maxBuffer:1024*1024});
  assert.ok(!stdout.includes('### Error'),stdout+stderr);
  return stdout;
};
try {
  await run(['open',`http://127.0.0.1:${server.address().port}`]);
  const result = await run(['run-code',`async page=>{
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.getByRole('button',{name:'Continue with Google',exact:true}).waitFor();
    await page.clock.install();
    await page.getByRole('button',{name:'Continue with Google',exact:true}).click();
    await page.clock.fastForward(16001);
    if(await page.getByText('Google Login Failed',{exact:true}).count())throw Error('Active interactive popup incorrectly failed after 15 seconds');
    if(!await page.getByRole('button',{name:/Waiting for Google|Continue with Google/}).isDisabled())throw Error('Pending sign-in can be started twice');
    await page.evaluate(()=>window.finishPopup({user:{uid:'qa-user'}}));
    await page.getByRole('button',{name:'Continue with Google',exact:true}).waitFor();
    if(await page.getByRole('button',{name:'Continue with Google',exact:true}).isDisabled())throw Error('Successful popup did not release loading');
    await page.getByRole('button',{name:'Continue with Google',exact:true}).click();
    await page.evaluate(()=>window.failPopup({code:'auth/popup-closed-by-user',message:'Firebase: Error (auth/popup-closed-by-user).'}));
    await page.getByRole('button',{name:'Continue with Google',exact:true}).waitFor();
    if(await page.getByText('Google Login Failed',{exact:true}).count())throw Error('User cancellation is misreported as a failure');
    await page.getByRole('button',{name:'Continue with Google',exact:true}).click();
    await page.evaluate(()=>window.failPopup({code:'auth/popup-blocked',message:'Firebase: Error (auth/popup-blocked).'}));
    await page.getByText('Google Login Failed',{exact:true}).waitFor();
    if(!await page.getByText(/Allow pop-ups.*try again/).isVisible())throw Error('Blocked popup has no actionable recovery');
    await page.getByRole('button',{name:'Continue with Google',exact:true}).click();
    await page.evaluate(()=>window.finishPopup({user:{uid:'qa-user'}}));
    await page.getByRole('button',{name:'Continue with Google',exact:true}).waitFor();
    if(await page.evaluate(()=>window.popupAttempts)!==4)throw Error('Retry did not open exactly one new attempt');
    if(errors.length)throw Error(errors.join('; '));
    return {pendingBeyond15Seconds:true,success:true,cancellation:true,blockedRecovery:true,retry:true,errors};
  }`]);
  console.log(result);
  console.log('PASS: real Login page preserves pending Google interaction, resolves success, treats cancellation normally, and allows recovery/retry. External provider boundary is simulated.');
} finally {
  await run(['close']).catch(()=>{});
  await new Promise(resolve=>server.close(resolve));
}
