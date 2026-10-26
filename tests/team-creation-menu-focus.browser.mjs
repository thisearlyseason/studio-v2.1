// Actual Shell menu state/roots and new-team form; fictional router and team.
// Touch-focus regression only: no account, team, purchase or external request.
import { build } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import ts from 'typescript';
import postcss from 'postcss';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(new URL('..', import.meta.url).pathname);
const source = path.resolve(process.env.INPUT_SOURCE || root);
const out = process.env.AUDIT_OUTPUT;
assert(out, 'AUDIT_OUTPUT must point to an ignored scratch directory');
await fs.mkdir(out, { recursive: true });
const shell = await fs.readFile(path.join(source, 'src/components/layout/Shell.tsx'), 'utf8');
const ast = ts.createSourceFile('Shell.tsx', shell, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let menu = '', state = '';
const roots = [];
function walk(node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'SquadSwitcherMenu') menu = node.getText(ast);
  if (ts.isVariableStatement(node) && node.declarationList.declarations.some(d => ts.isArrayBindingPattern(d.name) && d.name.elements[0]?.getText(ast) === 'mobileSwitcherOpen')) state = node.getText(ast);
  if (ts.isJsxElement(node) && node.openingElement.tagName.getText(ast) === 'DropdownMenu' && node.openingElement.attributes.getText(ast).includes('mobileSwitcherOpen')) roots.push(node.getText(ast));
  ts.forEachChild(node, walk);
}
walk(ast);
assert(menu && state && roots.length === 2, 'extract actual menu state and both mounted roots');
const entry = `import React,{useState,Suspense}from'react';import{createRoot}from'react-dom/client';
import{NavigationFeedback,useNavigationRouter}from'${source}/src/components/layout/navigation-feedback';
import NewTeam from'${source}/src/app/(dashboard)/teams/new/page';
import{Button}from'@/components/ui/button';import{Avatar,AvatarImage,AvatarFallback}from'@/components/ui/avatar';import{Badge}from'@/components/ui/badge';
import{DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuLabel,DropdownMenuSeparator,DropdownMenuTrigger}from'@/components/ui/dropdown-menu';
import{Settings,UserPlus,ChevronDown,ChevronRight,PlusCircle,Zap,CheckCircle2,Star,Building,Shield,Users,Trophy,Lock}from'lucide-react';import{cn}from'@/lib/utils';
const usePageContextSwitch=()=>()=>true;
${menu}
function Controls(){const router=useNavigationRouter();${state}
const{activeTeam,user}=window.team;const teams=[activeTeam],setActiveTeam=()=>{},isSchoolMode=false,isPrimaryClubAuthority=false,isEliteAccount=false,isEliteClubMode=false;
return <>{window.modern&&(${roots[0]})}<div className="md:hidden">${roots[1]}</div></>}
let ready=true,pending;function Destination({route}){if(!ready)throw pending;return route==='new'?<NewTeam/>:<h1>Dashboard</h1>}
window.team={activeTeam:{id:'demo-fixture',name:'Apex Demo Squad',isDemo:true},user:{id:'qa-fixture',role:'coach'},proQuotaStatus:{remaining:0},createNewTeam:()=>{window.teamWrites++;throw Error('NO_TEAM_WRITES_ALLOWED')},setActiveTeam:()=>{}};
window.teamWrites=0;window.modern=new URLSearchParams(location.search).get('modern')==='1';
function App(){const[route,setRoute]=useState('dashboard');window.routeTo=()=>{ready=false;pending=new Promise(resolve=>setTimeout(()=>{ready=true;history.pushState({},'','/teams/new?tier=starter');resolve()},200));setRoute('new')};return <NavigationFeedback><Controls/><Suspense fallback={<p>Loading form</p>}><Destination route={route}/></Suspense></NavigationFeedback>}
createRoot(document.getElementById('root')).render(<App/>);`;
const stubs = {
  router: `export function useRouter(){return {push:()=>window.routeTo(),back:()=>{}}}export function useSearchParams(){return new URLSearchParams('tier=starter')}`,
  link: `import React from'react';export default function Link({href,children,...p}){return <a href={href} {...p}>{children}</a>}`,
  team: `export const useTeam=()=>window.team;`,
  distribution: `export const isStoreDistribution=true;`,
};
const aliases = { 'next/navigation': 'router', 'next/link': 'link', '@/components/providers/team-provider': 'team', '@/lib/app-distribution': 'distribution' };
await build({
  stdin: { contents: entry, resolveDir: root, loader: 'tsx' }, bundle: true, format: 'iife', platform: 'browser', jsx: 'automatic', outfile: path.join(out, 'bundle.js'),
  plugins: [{ name: 'fictional-boundaries', setup(b) {
    b.onResolve({ filter: /^(next\/|@\/)/ }, args => {
      if (aliases[args.path]) return { path: aliases[args.path], namespace: 'fixture' };
      if (!args.path.startsWith('@/')) return;
      const base = path.join(source, 'src', args.path.slice(2));
      const extension = ['', '.tsx', '.ts', '.js'].find(ext => ts.sys.fileExists(base + ext));
      assert.notEqual(extension, undefined, 'real source dependency exists: ' + base);
      return { path: base + extension };
    });
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ resolveDir: root, loader: 'jsx', contents: stubs[args.path] }));
  } }],
});
const config = (await import(path.join(root, 'postcss.config.mjs'))).default;
const name = Object.keys(config.plugins)[0], plugin = (await import(name)).default;
const css = await postcss([plugin(name === 'tailwindcss' ? { config: path.join(source, 'tailwind.config.ts') } : { base: source })]).process(await fs.readFile(path.join(source, 'src/app/globals.css'), 'utf8'), { from: path.join(source, 'src/app/globals.css') });
const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', req.url === '/bundle.js' ? 'application/javascript' : req.url === '/style.css' ? 'text/css' : 'text/html');
  res.end(req.url === '/bundle.js' ? await fs.readFile(path.join(out, 'bundle.js')) : req.url === '/style.css' ? css.css : '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const result = { scope: 'Actual native Shell menu state/roots, form, Radix layers and CSS; fictional router/team; no physical keyboard or device acceptance claimed', cases: [], errors: [], externalRequests: [] };
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  for (const viewport of [{ width: 412, height: 915 }, { width: 768, height: 1024 }, { width: 1280, height: 900 }]) {
    for (const modern of [false, true]) {
      // Classic uses the context bar on phones; desktop classic uses a distinct sidebar menu.
      if (!modern && viewport.width >= 768) continue;
      const context = await browser.newContext({ viewport, hasTouch: true, isMobile: viewport.width < 768 });
      const page = await context.newPage();
      page.setDefaultTimeout(6000);
      page.on('pageerror', error => result.errors.push(error.message));
      await context.route('**/*', route => {
        if (new URL(route.request().url()).origin === origin) return route.continue();
        result.externalRequests.push(route.request().url());return route.abort();
      });
      for (const triggerIndex of modern && viewport.width < 768 ? [0, 1] : [0]) {
        await page.goto(origin + '/?modern=' + Number(modern));
        await page.getByRole('heading', { name: 'Dashboard', exact: true }).waitFor();
        await page.getByRole('button', { name: 'Switch squad', exact: true }).nth(triggerIndex).tap();
        assert.equal(await page.getByRole('menu').count(), 1, 'exactly one accessible modal menu');
        // Cancellation and reopening must not leave an outside-pointer lock either.
        await page.keyboard.press('Escape');
        await page.getByRole('menu').waitFor({ state: 'detached' });
        await page.waitForFunction(() => getComputedStyle(document.body).pointerEvents !== 'none');
        await page.getByRole('button', { name: 'Switch squad', exact: true }).nth(triggerIndex).tap();
        await page.getByRole('menuitem', { name: 'Create Free Team', exact: true }).tap();
        const teamName = page.getByPlaceholder('e.g. Metro Elite U14');
        await teamName.waitFor();
        await page.getByRole('status').waitFor({ state: 'detached' });
        await page.getByRole('menu').waitFor({ state: 'detached' });
        assert.notEqual(await page.evaluate(() => getComputedStyle(document.body).pointerEvents), 'none');
        await teamName.tap();
        assert(await teamName.evaluate(el => el === document.activeElement), 'touch focuses name');
        await page.keyboard.type('Local focus check');
        assert.equal(await teamName.inputValue(), 'Local focus check');
        const fields = page.locator('textarea');
        await fields.first().tap();await page.keyboard.type('Local biography');
        assert.equal(await fields.first().inputValue(), 'Local biography');
        const title = page.getByPlaceholder('e.g. 2025 League Waiver');
        await title.tap();await page.keyboard.type('Local protocol');
        assert.equal(await title.inputValue(), 'Local protocol');
        await fields.last().tap();await page.keyboard.type('Local terms');
        assert.equal(await fields.last().inputValue(), 'Local terms');
        await page.getByRole('combobox').first().tap();
        await page.getByRole('option', { name: 'Youth (Minor Support)', exact: true }).tap();
        await teamName.tap();await page.keyboard.type(' retained');
        // A touch places the caret where tapped, rather than at the end.
        assert.equal((await teamName.inputValue()).replace(' retained', ''), 'Local focus check');
        assert.equal(await page.locator('[inert]').count(), 0);
        assert.equal(await page.evaluate(() => window.teamWrites), 0);
        result.cases.push({ viewport, modern, triggerIndex, typedFields: 4, selectAndReturnFocus: true, modalCancelAndReopen: true, teamWrites: 0 });
        if (viewport.width === 412 && triggerIndex === 0) await page.screenshot({ path: path.join(out, modern ? 'modern-focus.png' : 'classic-focus.png') });
      }
      await context.close();
    }
  }
  assert.deepEqual(result.errors, []);assert.deepEqual(result.externalRequests, []);
  result.status = 'PASS';
} catch (error) {
  result.status = 'FAIL';result.failure = error.stack;process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
  await fs.rm(path.join(out, 'bundle.js'), { force: true });
  result.ownedBrowserAndServerClosed = true;
  await fs.writeFile(path.join(out, 'results.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
}
