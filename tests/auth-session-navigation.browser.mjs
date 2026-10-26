// Real production Next router/cookies; fictional localhost session only.
// Reproduces a cached signed-out redirect, then exercises the actual app handlers.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import ts from 'typescript';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(new URL('..', import.meta.url).pathname);
const fixture = await fs.mkdtemp(path.join(root, 'scratch/auth-session-navigation-'));
const output = process.env.SQUAD_AUTH_NAVIGATION_OUTPUT || path.join(root, 'scratch/auth-session-navigation-result.json');
const result = { cases: [], externalRequests: [], errors: [] };
const source = async name => ts.createSourceFile(name, await fs.readFile(path.join(root, name), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const login = await source('src/app/login/page.tsx');
const admin = await source('src/app/admin/page.tsx');
let enter, exit;
function walk(node, visit) { visit(node); node.forEachChild(child => walk(child, visit)); }
walk(login, node => {
  if (ts.isVariableDeclaration(node) && node.name.getText(login) === 'enterAuthenticatedPage') enter = node.initializer.getText(login);
});
walk(admin, node => {
  if (!ts.isJsxElement(node) || node.openingElement.tagName.getText(admin) !== 'Button' || !node.getText(admin).includes('Exit Admin')) return;
  const click = node.openingElement.attributes.properties.find(a => ts.isJsxAttribute(a) && a.name.getText(admin) === 'onClick');
  if (click?.initializer && ts.isJsxExpression(click.initializer)) exit = click.initializer.expression.getText(admin);
});
assert.ok(enter && exit, 'Actual login and Exit Admin handlers must be present');
const compile = (name, value) => ts.transpileModule(`const ${name} = ${value};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const files = {
  'package.json': JSON.stringify({ name: 'isolated-auth-navigation', private: true, type: 'module' }),
  'next.config.mjs': 'export default {poweredByHeader:false,experimental:{cpus:2}};',
  'app/layout.js': 'export default function Layout({children}){return <html><body>{children}</body></html>}',
  'app/page.js': `import Link from 'next/link';export default async function Home({searchParams}){const mode=(await searchParams).mode||'baseline';return <><h1>Isolated session fixture</h1><Link href='/dashboard' prefetch={true}>Prefetch dashboard</Link><Link href={'/login?mode='+mode}>Open sign in</Link></>}`,
  'app/login/page.js': `'use client';import{useRouter}from'next/navigation';export default function Login(){const router=useRouter();const isStoreDistribution=false;${compile('enterAuthenticatedPage', enter)}return <><h1>Fixture sign in</h1><button onClick={async()=>{await fetch('/api/session',{method:'POST'});const mode=new URLSearchParams(location.search).get('mode');if(mode==='login')enterAuthenticatedPage('/dashboard');else router.push('/admin?mode='+mode)}}>Sign in fixture</button></>}`,
  'app/admin/page.js': `import{cookies}from'next/headers';import{redirect}from'next/navigation';import Exit from'./exit';export default async function Admin(){if((await cookies()).get('fixture_session')?.value!=='valid')redirect('/login');return <><h1>Fixture admin</h1><Exit/></>}`,
  'app/admin/exit.js': `'use client';import{useRouter}from'next/navigation';export default function Exit(){const router=useRouter();${compile('leaveAdmin', exit)}return <button onClick={()=>{if(new URLSearchParams(location.search).get('mode')==='exit')leaveAdmin();else router.push('/dashboard')}}>Exit admin</button>}`,
  'app/dashboard/page.js': `import{cookies}from'next/headers';import{redirect}from'next/navigation';export default async function Dashboard(){if((await cookies()).get('fixture_session')?.value!=='valid')redirect('/login');return <h1>Dashboard session verified</h1>}`,
  'app/api/session/route.js': `import{NextResponse}from'next/server';export function POST(){const r=NextResponse.json({ok:true});r.cookies.set('fixture_session','valid',{httpOnly:true,sameSite:'lax',path:'/'});return r}`,
};
let browser, server;
try {
  for (const [name, data] of Object.entries(files)) { const f=path.join(fixture,name);await fs.mkdir(path.dirname(f),{recursive:true});await fs.writeFile(f,data); }
  const next = path.join(root, 'node_modules/next/dist/bin/next');
  const built = spawnSync(process.execPath, [next, 'build', fixture], { cwd: root, env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' }, encoding: 'utf8', timeout: 180000, maxBuffer: 3_000_000 });
  assert.equal(built.status, 0, (built.stderr || built.stdout).slice(-3000));
  server = spawn(process.execPath, [next, 'start', fixture, '-H', '127.0.0.1', '-p', '9474'], { cwd: root, stdio: ['ignore','pipe','pipe'] });
  const origin='http://127.0.0.1:9474';
  for(let i=0;i<100;i++){try{const r=await fetch(origin);if(r.ok)break;}catch{}if(i===99)throw Error('Fixture did not start');await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({channel:'chrome',headless:true});
  for(const mode of ['baseline','exit','login']) {
    const context=await browser.newContext({serviceWorkers:'block'});
    await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!==origin){result.externalRequests.push(u.origin);return route.abort();}return route.continue();});
    const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>result.errors.push(e.message));
    const prefetched=page.waitForResponse(r=>new URL(r.url()).pathname==='/dashboard'&&r.request().headers()['rsc']==='1');
    await page.goto(origin+'/?mode='+mode);await prefetched;
    await page.getByRole('link',{name:'Open sign in'}).click();await page.getByRole('heading',{name:'Fixture sign in',exact:true}).waitFor();
    await page.getByRole('button',{name:'Sign in fixture'}).click();
    if(mode!=='login') {
      await page.getByRole('heading',{name:'Fixture admin',exact:true}).waitFor();
      assert.ok((await context.cookies()).some(c=>c.name==='fixture_session'&&c.value==='valid'));
      await page.getByRole('button',{name:'Exit admin',exact:true}).click();
    }
    if(mode==='baseline') {
      await page.getByRole('heading',{name:'Fixture sign in',exact:true}).waitFor();
      assert.ok((await context.cookies()).some(c=>c.name==='fixture_session'&&c.value==='valid'));
      // Prove the same cookie passes a fresh request: the cached redirect is stale.
      await page.goto(origin+'/dashboard');await page.getByRole('heading',{name:'Dashboard session verified'}).waitFor();
      result.cases.push('legacy cached redirect reproduces despite valid cookie; fresh request succeeds');
    } else {
      await page.getByRole('heading',{name:'Dashboard session verified'}).waitFor();
      assert.equal(new URL(page.url()).pathname,'/dashboard');
      result.cases.push(mode==='exit'?'actual Exit Admin handler bypasses stale redirect':'actual web login handler bypasses stale redirect');
    }
    await context.close();
  }
  const anonymous=await browser.newContext();const p=await anonymous.newPage();await p.goto(origin+'/dashboard');await p.getByRole('heading',{name:'Fixture sign in',exact:true}).waitFor();await anonymous.close();
  result.cases.push('fresh unauthenticated dashboard request still denied');
  assert.deepEqual(result.externalRequests,[]);assert.deepEqual(result.errors,[]);result.status='PASS';
} catch(error) {result.status='FAIL';result.failure=error.stack;process.exitCode=1;}
finally {
  await browser?.close();if(server){server.kill('SIGTERM');await new Promise(resolve=>{if(server.exitCode!==null)return resolve();server.once('exit',resolve);});}
  await fs.rm(fixture,{recursive:true,force:true});result.fixtureBrowserServerAndBuildRemoved=true;
  await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
