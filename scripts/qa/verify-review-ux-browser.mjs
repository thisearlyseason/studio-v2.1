import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { promisify } from 'node:util';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import ts from 'typescript';

// Run with PLAYWRIGHT_CLI=/path/to/playwright_cli.sh node scripts/qa/verify-review-ux-browser.mjs.
// These are rendered component checks; final routing/auth acceptance belongs to the deployed app.
const cli = process.env.PLAYWRIGHT_CLI;
assert.ok(cli, 'Set PLAYWRIGHT_CLI to the installed Playwright CLI wrapper.');
const exec = promisify(execFile);
const session = `review-ux-${process.pid}`;
const cwd = process.cwd();

async function sourceTree(file) {
  return ts.createSourceFile(file, await readFile(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}
function findNode(tree, predicate) {
  let result;
  function visit(node) {
    if (!result && predicate(node)) result = node;
    if (!result) ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.ok(result, `Production JSX could not be located in ${tree.fileName}`);
  return result;
}
function inputWithValue(tree, value) {
  return findNode(tree, node => ts.isJsxSelfClosingElement(node) && node.tagName.getText(tree) === 'Input'
    && node.attributes.properties.some(attr => ts.isJsxAttribute(attr) && attr.name.text === 'value'
      && ts.isJsxExpression(attr.initializer) && attr.initializer.expression?.getText(tree) === value));
}
function enclosingJsxExpression(node, tree) {
  let ancestor = node.parent;
  while (ancestor && !ts.isJsxExpression(ancestor)) ancestor = ancestor.parent;
  assert.ok(ancestor, `JSX condition could not be located in ${tree.fileName}`);
  return ancestor.getText(tree);
}
const games = await sourceTree('src/app/(dashboard)/games/page.tsx');
const events = await sourceTree('src/app/(dashboard)/events/page.tsx');
const leagues = await sourceTree('src/app/(dashboard)/leagues/leagues-page-content.tsx');
const referee = await sourceTree('src/app/tournaments/referee/[teamId]/[eventId]/page.tsx');
const team = await sourceTree('src/app/(dashboard)/team/page.tsx');
const scores = inputWithValue(games, 'myScore').parent.parent.getText(games);
const divisions = inputWithValue(leagues, 'newDivisionName').parent.parent.parent.getText(leagues);
const startDateLabel = findNode(events, node => ts.isJsxText(node) && node.text.trim() === 'Start Date *');
const dates = startDateLabel.parent.parent.parent.getText(events);
const refereeTitle = findNode(referee, node => ts.isJsxText(node) && node.text.trim() === 'Referee Portal');
const refereeHeader = refereeTitle.parent.parent.parent.parent.parent.getText(referee);
const assignmentStatusTitle = findNode(team, node => ts.isJsxText(node) && node.text.trim() === 'League Assignments');
const assignmentStatus = enclosingJsxExpression(assignmentStatusTitle, team);
const assignmentRowsTitle = findNode(team, node => ts.isJsxText(node) && node.text.trim() === 'Pending Recruitment');
const assignmentRows = enclosingJsxExpression(assignmentRowsTitle, team);
const assignmentEffects = team.text.slice(team.text.indexOf('  const [assignment'), team.text.indexOf('  const [editForm, setEditForm]'));
const divisionHandlers = ['handleAddDivision', 'handleRemoveDivision'].map(name => {
  const declaration = findNode(leagues, node => ts.isVariableDeclaration(node) && node.name.getText(leagues) === name);
  return declaration.parent.parent.getText(leagues);
}).join('\n');

// Render the unchanged production JSX and handlers without mounting providers that read/write account data.
const entry = `
  import React, {useState, useRef, useEffect} from 'react';
  import {createRoot} from 'react-dom/client';
  import {SportsHubClientLayout} from './src/components/sports-hub/SportsHubClientLayout';
  import {Input} from './src/components/ui/input';
  import {Label} from './src/components/ui/label';
  import {Button} from './src/components/ui/button';
  import {Badge} from './src/components/ui/badge';
  import {Card, CardHeader, CardTitle, CardDescription, CardContent} from './src/components/ui/card';
  import {Popover, PopoverTrigger, PopoverContent} from './src/components/ui/popover';
  import {Calendar as DateCalendar} from './src/components/ui/calendar';
  import {Calendar as RefereeCalendar, CalendarIcon, Trash2, Shield, UserCheck, MapPin, Trophy, Loader2, ClipboardList, Users, CheckCircle2, XCircle} from 'lucide-react';
  import {format, parseISO} from 'date-fns';
  import {cn} from './src/lib/utils';
  import {toast} from './src/hooks/use-toast';
  function Controls() {
    const Calendar = DateCalendar;
    const [myScore, setMyScore] = React.useState('');
    const [opponentScore, setOpponentScore] = React.useState('');
    const [newDate, setNewDate] = React.useState('');
    const [newEndDate, setNewEndDate] = React.useState('');
    const [newDivisionName, setNewDivisionName] = React.useState('');
    const [editLeagueForm, setEditLeagueForm] = React.useState({divisions:['Gold']});
    ${divisionHandlers}
    return <main className="max-w-3xl mx-auto p-4 space-y-8">
      <section aria-label="Match scores">${scores}</section>
      <section aria-label="Activity dates">${dates}</section>
      <section aria-label="League profile" className="bg-black p-4 text-white">
        <button>Before architect</button>${divisions}<button>After architect</button>
        <output aria-label="Division draft">{JSON.stringify(editLeagueForm.divisions)}</output>
      </section>
    </main>;
  }
  function RefereeHeader() {
    const Calendar = RefereeCalendar;
    const count = Number(new URLSearchParams(location.search).get('assigned'));
    const activeRef = location.search.includes('assigned=') ? {id:'referee-a',name:'Alex Official',email:'official@example.test'} : null;
    const myGames = activeRef ? Array.from({length:count},(_,index)=>({id:'game-'+index})) : [];
    // The real public/authenticated DTO intentionally omits the private referee roster.
    const event = {title:'Community Cup',date:'2026-09-12',endDate:'2026-09-13',location:'Community Centre',activeReferee:activeRef,tournamentGames:myGames};
    return ${refereeHeader};
  }
  const firebaseAuth = {};
  async function getAuthToken() { return 'harness-token'; }
  function authHeader(token) { return {Authorization:'Bearer '+token}; }
  async function respondToAssignment() { throw Error('Assignment submission is outside this read-only UI scenario'); }
  function TeamAssignments() {
    const activeTeam={id:'squad',isDemo:location.search.includes('demo=true'),planId:'elite_league'};
    const authUser={uid:'staff',isAnonymous:false};
    const isStaff=true;
    const hasFeature=()=>true;
    ${assignmentEffects}
    return <main className="max-w-3xl mx-auto p-4 space-y-8"><h1>Squad assignments</h1>${assignmentStatus}${assignmentRows}</main>;
  }
  createRoot(document.getElementById('root')).render(location.pathname === '/sports-hub'
    ? <SportsHubClientLayout><h1>Sports Hub resources</h1></SportsHubClientLayout>
    : location.pathname === '/referee' ? <RefereeHeader/>
    : location.pathname === '/assignments' ? <TeamAssignments/> : <Controls/>);
`;
const bundle = await build({
  stdin: { contents: entry, loader: 'tsx', resolveDir: cwd },
  bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' },
  alias: { '@': path.join(cwd, 'src') },
  plugins: [{ name: 'standalone-navigation', setup(esbuild) {
    // App Router context is external to the component harness. Links and form components stay real.
    esbuild.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'navigation', namespace: 'standalone' }));
    esbuild.onLoad({ filter: /^navigation$/, namespace: 'standalone' }, () => ({ contents:
      'export const usePathname=()=>location.pathname;export const useRouter=()=>({push:href=>location.assign(href)});' }));
    // Next normally handles its CommonJS default-export interop during compilation.
    esbuild.onResolve({ filter: /^next\/(link|image)$/ }, args => ({ path: args.path, namespace: 'next-interop' }));
    esbuild.onLoad({ filter: /.*/, namespace: 'next-interop' }, args => ({
      contents: `import component from '${args.path === 'next/link' ? 'next/dist/client/link.js' : 'next/dist/shared/lib/image-external.js'}'; export default component.default || component;`,
      resolveDir: cwd,
    }));
  } }],
});
const styles = await postcss([tailwindcss({ config: path.join(cwd, 'tailwind.config.ts') })])
  .process(await readFile('src/app/globals.css', 'utf8'), { from: 'src/app/globals.css' });
const logo = await readFile('public/logo-dark.png');
const server = createServer((req, res) => {
  if (req.url === '/app.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundle.outputFiles[0].text); }
  else if (req.url === '/app.css') { res.setHeader('Content-Type', 'text/css'); res.end(styles.css); }
  else if (req.url?.startsWith('/_next/image')) { res.setHeader('Content-Type', 'image/png'); res.end(logo); }
  else if (req.url === '/favicon.ico') { res.writeHead(204); res.end(); }
  else { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html><head><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const run = async args => {
  const { stdout, stderr } = await exec(cli, [`-s=${session}`, ...args], { timeout: 45000, maxBuffer: 1024 * 1024 })
    .catch(error => { throw new Error(error.stdout || error.stderr || error.message); });
  assert.ok(!stdout.includes('### Error'), stdout + stderr);
  return stdout;
};
const failures = [];
await mkdir('output/playwright', {recursive:true});
async function check(name, body) {
  try { await run(['run-code', `async page => { ${body} return ${JSON.stringify(name)}; }`]); console.log(`PASS ${name}`); }
  catch (error) { failures.push(name); console.error(`FAIL ${name}: ${error.message}`); }
}
try {
  await run(['open', `${origin}/sports-hub`]);
  await check('R2: public Pricing targets the landing page pricing section', `
    const href = await page.locator('footer').getByRole('link', {name:'Pricing', exact:true}).getAttribute('href');
    if (href !== '/#pricing') throw Error('Signed-out pricing target is ' + href);
  `);
  await check('R3: mobile and desktop header expose usable exit/account links without overflow', `
    for (const width of [320,390,768,1440]) {
      await page.setViewportSize({width,height:900});
      const header = page.locator('header');
      for (const [href,name] of [['/','Home'],['/dashboard','Back to App'],['/login','Get Started']]) {
        const links = header.locator('a[href="' + href + '"]');
        let visible = false;
        for (const link of await links.all()) {
          const box = await link.boundingBox();
          if (await link.isVisible() && box && box.width > 0 && box.height > 0) {
            visible = true;
            if (box.x < 0 || box.x + box.width > width + 0.5) throw Error(name + ' clips at ' + width);
            await link.focus();
            if (!await link.evaluate(node => document.activeElement === node)) throw Error(name + ' cannot receive keyboard focus');
          }
        }
        if (!visible) throw Error(name + ' has no visible header action at ' + width);
      }
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw Error('Horizontal overflow at ' + width);
      await page.evaluate(()=>scrollTo(0,200));
      await page.waitForFunction(()=>{
        const header=document.querySelector('header').getBoundingClientRect();
        const sections=document.querySelector('nav[aria-label="Sports Hub sections"]').getBoundingClientRect();
        return Math.abs(sections.top-header.bottom)<=0.5;
      });
      await page.evaluate(()=>scrollTo(0,0));
      if(width===390 || width===1440) await page.screenshot({path:'output/playwright/review-ux-hub-'+width+'.png'});
    }
  `);
  await run(['goto', `${origin}/controls`]);
  await check('R4: Us and Them identify independently editable scores', `
    const scores = page.getByRole('region',{name:'Match scores'});
    const ours = scores.getByRole('spinbutton',{name:'Us',exact:true});
    const theirs = scores.getByRole('spinbutton',{name:'Them',exact:true});
    if (await ours.count() !== 1 || await theirs.count() !== 1) throw Error('Score inputs do not have distinct Us/Them accessible names');
    await ours.fill('3'); await theirs.fill('2');
    if (await ours.inputValue() !== '3' || await theirs.inputValue() !== '2') throw Error('Score fields did not preserve independent edits');
    await scores.getByText('Us',{exact:true}).click();
    if (!await ours.evaluate(node=>document.activeElement===node)) throw Error('Us label does not focus its score');
    await scores.getByText('Them',{exact:true}).click();
    if (!await theirs.evaluate(node=>document.activeElement===node)) throw Error('Them label does not focus its score');
  `);
  await check('R5: Coming Soon architect cannot receive keyboard input or change division drafts', `
    const region = page.getByRole('region',{name:'League profile'});
    const input = region.getByPlaceholder('New Division Title...');
    await region.getByRole('button',{name:'Before architect',exact:true}).focus();
    await page.keyboard.press('Tab');
    if (!await region.getByRole('button',{name:'After architect',exact:true}).evaluate(node=>document.activeElement===node)) throw Error('Keyboard entered Coming Soon controls');
    if (!await input.isDisabled()) throw Error('Coming Soon division input is editable');
    if (!await region.getByRole('button',{name:'Add',exact:true}).isDisabled()) throw Error('Coming Soon Add is enabled');
    const removal = region.locator('button').filter({has:page.locator('svg')});
    if (!await removal.isDisabled()) throw Error('Coming Soon division removal is enabled');
    await input.evaluate(node=>node.focus());
    await page.keyboard.type('Should not become a division'); await page.keyboard.press('Enter');
    if (await input.inputValue() !== '') throw Error('Disabled input accepted keyboard text');
    if (await region.getByLabel('Division draft').textContent() !== '["Gold"]') throw Error('Coming Soon changed staged divisions');
  `);
  await check('R6: both empty date labels retain readable hover contrast and open calendars', `
    const dates = page.getByRole('region',{name:'Activity dates'});
    if (await dates.getByRole('button',{name:'Pick Date',exact:true}).count() !== 2) throw Error('Start/end date controls are missing');
    for (const button of await dates.getByRole('button',{name:'Pick Date',exact:true}).all()) {
      await button.hover();
      await button.evaluate(node=>Promise.all(node.getAnimations().map(animation=>animation.finished)));
      const ratio = await button.evaluate(node=>{
        const rgb = value=>value.match(/[\\d.]+/g).map(Number);
        const luminance = values=>values.slice(0,3).map(value=>value/255).map(value=>value<=0.04045?value/12.92:((value+0.055)/1.055)**2.4).reduce((sum,value,index)=>sum+value*[0.2126,0.7152,0.0722][index],0);
        const foreground = rgb(getComputedStyle(node.querySelector('span')).color);
        const background = rgb(getComputedStyle(node).backgroundColor);
        const alpha = background[3] ?? 1;
        const bg = luminance(background.slice(0,3).map(value=>value*alpha+255*(1-alpha)));
        const fg = luminance(foreground);
        return (Math.max(fg,bg)+0.05)/(Math.min(fg,bg)+0.05);
      });
      if (ratio < 4.5) throw Error('Empty date hover contrast is ' + ratio.toFixed(2) + ':1');
      await button.click();
      await page.getByRole('grid').waitFor({state:'visible'});
      await page.keyboard.press('Escape');
    }
    await page.screenshot({path:'output/playwright/review-ux-controls.png'});
  `);
  await check('Referee header reports only the current referee assignment count', `
    for (const [query,label] of [['','Match Assignments'],['?assigned=0','Your Assigned Matches: 0'],['?assigned=1','Your Assigned Match: 1'],['?assigned=2','Your Assigned Matches: 2']]) {
      await page.goto(${JSON.stringify(origin)}+'/referee'+query);
      await page.getByRole('heading',{name:'Community Cup',exact:true}).waitFor();
      if (await page.getByText(label,{exact:true}).count() !== 1) throw Error('Header does not report '+label+' for '+query);
      for(const width of [390,1440]) {
        await page.setViewportSize({width,height:900});
        const box=await page.getByText(label,{exact:true}).boundingBox();
        if(!box || box.x<0 || box.x+box.width>width+0.5) throw Error('Referee assignment label clips at '+width);
        if(query==='?assigned=2') await page.screenshot({path:'output/playwright/review-ux-referee-'+width+'.png'});
      }
    }
  `);
  await check('Assignment failures expose Retry and recover visible rows while demo squads make no request', `
    for(const width of [390,1440]) {
      await page.setViewportSize({width,height:900});
      const requests=[];
      await page.route('**/api/leagues/assignments*', async route=>{
        requests.push(route.request().url());
        await route.fulfill({status:requests.length===1?503:200,contentType:'application/json',body:JSON.stringify(requests.length===1
          ? {error:'Service temporarily unavailable.'}
          : {assignments:[{id:'entry-a',league_id:'league-a',protocol_id:'player_config',status:'assigned',assigned_team_id:'squad',answers:{fullName:'First Applicant',position:'Midfielder'},lifecycleVersion:3,assignmentVersion:1}]})});
      });
      await page.goto(${JSON.stringify(origin)}+'/assignments');
      const alert=page.getByRole('alert');
      await alert.waitFor({state:'visible'});
      await alert.getByText('Service temporarily unavailable.',{exact:true}).waitFor();
      if(await page.getByText('Pending Recruitment',{exact:true}).count()) throw Error('Failed assignment load rendered an empty recruitment list');
      const retry=alert.getByRole('button',{name:'Retry assignments',exact:true});
      const box=await retry.boundingBox();
      if(!box || box.x<0 || box.x+box.width>width+0.5) throw Error('Assignment Retry clips at '+width);
      await page.screenshot({path:'output/playwright/review-ux-assignment-error-'+width+'.png'});
      await retry.click();
      await page.getByText('First Applicant',{exact:true}).waitFor({state:'visible'});
      if(await alert.count()) throw Error('Assignment error did not clear after successful retry');
      if(requests.length!==2 || requests.some(url=>!url.endsWith('?teamId=squad'))) throw Error('Retry did not load the current squad exactly once');
      await page.goto(${JSON.stringify(origin)}+'/assignments?demo=true');
      await page.getByRole('heading',{name:'Squad assignments',exact:true}).waitFor();
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      if(requests.length!==2 || await page.getByRole('alert').count() || await page.getByText('Pending Recruitment',{exact:true}).count()) throw Error('Demo squad requested or displayed protected assignments');
      await page.unroute('**/api/leagues/assignments*');
    }
  `);
  assert.deepEqual(failures, [], 'Review UX browser regressions failed');
  console.log('PASS: R2–R6, referee header, and assignment retry rendered UX checks. Full app routing, save flows, and hosted integration require separate acceptance.');
} finally {
  await run(['close']).catch(() => {});
  await new Promise(resolve => server.close(resolve));
}
