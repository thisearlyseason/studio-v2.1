import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { promisify } from 'node:util';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import { prepareLeagueScheduleForDeployment } from '../../src/lib/server-schedule-deployment.ts';
import { scorekeeperLeague } from '../../src/lib/public-portal-data.ts';

// Component regression only. Real hosted auth, Firestore indexes and acceptance
// are checked separately against the deployed release with owned QA fixtures.
const cli = process.env.PLAYWRIGHT_CLI;
assert.ok(cli, 'Set PLAYWRIGHT_CLI to the installed Playwright wrapper.');
const cwd = process.cwd();
const output = path.join(cwd, 'output/playwright/hosted-repair-components');
await mkdir(output, {recursive:true});
const logo = await readFile('public/logo-dark.png');
const originalLogo = `data:image/png;base64,${logo.toString('base64')}`;
const normalized = prepareLeagueScheduleForDeployment('fixture', {
  teams:{a:{teamName:'Alpha',status:'accepted',teamLogoUrl:originalLogo},b:{teamName:'Beta',status:'accepted'}},
  schedulerConfig:{gameLength:'60',selectedFields:['Main']}, schedule:[],
}, 'replace', [{id:'match-a',team1Id:'a',team2Id:'b',date:'2026-10-01',time:'09:00',location:'Main',resourceId:'Main'}]);
const projected = scorekeeperLeague('fixture',{teams:{a:{teamName:'Alpha',status:'accepted',teamLogoUrl:originalLogo}},schedule:normalized.games});
const fixture = {
  games:[{id:'recorded',opponent:'Recorded Tigers',date:'2026-10-01',myScore:3,opponentScore:1,result:'Win'},
    {id:'legacy',opponent:'Legacy Tigers',date:'2026-10-01T01:00:00.000Z',myScore:2,opponentScore:2,result:'Tie'}],
  events:[{id:'scheduled',title:'Squad vs Scheduled Tigers',opponent:'Scheduled Tigers',eventType:'game',date:'2026-10-02',startTime:'09:00',location:'Main'}],
  portal:{config:{is_active:true,form_schema:[],form_version:1},event:{title:'Calendar QA Cup',date:'2026-10-01',endDate:'2026-10-02',location:'Main'}},
};
const stubs = {
  'next/navigation': `export const useSearchParams=()=>new URLSearchParams(location.search);export const useParams=()=>({teamId:'fixture',eventId:'cup'});export const useRouter=()=>({push:()=>{}});export const usePathname=()=>location.pathname;`,
  '@/components/providers/team-provider': `export const useTeam=()=>({activeTeam:{id:'fixture',name:'QA Squad'},isTeamsLoading:false,isStaff:true,isSuperAdmin:false,isPro:true,hasFeature:()=>true,purchasePro:()=>{},activeTeamEvents:window.qa.events});`,
  '@/firebase': `export const useAuth=()=>({});export const useFirestore=()=>null;export const useMemoFirebase=fn=>fn();export const useCollection=()=>({data:window.qa.games,isLoading:false});`,
  '@/lib/client-auth': `export const getAuthToken=async()=> 'component-test';export const authHeader=()=>({});`,
  '@/hooks/use-public-portal': `export const usePublicPortal=()=>({data:window.qa.portal,isLoading:false,error:null,status:200,retry:()=>{}});`,
};
const bundle = await build({
  stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {TooltipProvider} from './src/components/ui/tooltip';import Games from './src/app/(dashboard)/games/page';import Tournament from './src/app/register/tournament/[teamId]/[eventId]/page';createRoot(document.getElementById('root')).render(<TooltipProvider>{location.pathname === '/tournament' ? <Tournament/> : location.pathname === '/logo' ? <img alt="Deployed team logo" src=${JSON.stringify(projected.teams.a.teamLogoUrl)}/> : <Games/>}</TooltipProvider>);`,loader:'tsx',resolveDir:cwd},
  bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',
  define:{'process.env.NODE_ENV':'"production"','process.env':'{}'},alias:{'@':path.join(cwd,'src')},
  plugins:[{name:'page-boundaries',setup(bundler){
    bundler.onResolve({filter:/.*/},args=>Object.hasOwn(stubs,args.path)?{path:args.path,namespace:'boundary'}:null);
    bundler.onLoad({filter:/.*/,namespace:'boundary'},args=>({contents:stubs[args.path]}));
    bundler.onResolve({filter:/^next\/(image|link)$/},args=>({path:args.path,namespace:'interop'}));
    bundler.onLoad({filter:/.*/,namespace:'interop'},args=>({contents:`import component from '${args.path==='next/link'?'next/dist/client/link.js':'next/dist/shared/lib/image-external.js'}';export default component.default||component;`,resolveDir:cwd}));
  }}],
});
const styles = await postcss([tailwindcss({config:path.join(cwd,'tailwind.config.ts')})]).process(await readFile('src/app/globals.css','utf8'),{from:'src/app/globals.css'});
const submissions=[];
const server=createServer(async(req,res)=>{
  if(req.url==='/app.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle.outputFiles[0].text);}
  else if(req.url==='/app.css'){res.setHeader('Content-Type','text/css');res.end(styles.css);}
  else if(req.url?.startsWith('/_next/image')){res.setHeader('Content-Type','image/png');res.end(logo);}
  else if(req.url?.startsWith('/api/')){let body='';for await(const chunk of req)body+=chunk;submissions.push(JSON.parse(body));res.setHeader('Content-Type','application/json');res.end('{"success":true}');}
  else if(req.url==='/favicon.ico'){res.writeHead(204);res.end();}
  else{res.setHeader('Content-Type','text/html');res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/><link rel="stylesheet" href="/app.css"/></head><body><div id="root"></div><script>window.qa=${JSON.stringify(fixture)}</script><script src="/app.js"></script></body></html>`);}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const exec=promisify(execFile),session=`hosted-repairs-${process.pid}`;
async function run(args){const {stdout,stderr}=await exec(cli,[`-s=${session}`,...args],{timeout:60000,maxBuffer:1024*1024});assert.ok(!stdout.includes('### Error'),stdout+stderr);return stdout;}
try{
  await run(['open',origin]);
  await run(['snapshot']);
  const result=await run(['run-code',`async page=>{
    const results=[];
    for(const zone of ['America/Edmonton','Pacific/Auckland']) for(const width of [390,1440]){
      const context=await page.context().browser().newContext({timezoneId:zone,viewport:{width,height:960}});
      const screen=await context.newPage();const errors=[];screen.on('pageerror',e=>errors.push(e.message));
      try{
        await screen.goto(${JSON.stringify(origin)}+'/games');
        await screen.getByRole('heading',{name:'Recorded Tigers',exact:true}).waitFor();
        await screen.locator('body').ariaSnapshot();
        const card=screen.getByRole('heading',{name:'Recorded Tigers',exact:true}).locator('xpath=ancestor::div[contains(@class,"rounded-3xl")][1]');
        if(!(await card.textContent()).includes('October 1, 2026'))throw Error('Recorded date shifted');
        await card.click();await screen.getByRole('dialog').waitFor();await screen.locator('body').ariaSnapshot();
        const dialog=screen.getByRole('dialog');
        if(!(await dialog.textContent()).includes('October 1st, 2026'))throw Error('Edit date shifted');
        await screen.screenshot({path:${JSON.stringify(output)}+'/'+zone.replace('/','-')+'-'+width+'-score.png'});
        const legacyExpected=zone==='America/Edmonton'?'September 30, 2026':'October 1, 2026';
        await screen.keyboard.press('Escape');
        const legacy=screen.getByRole('heading',{name:'Legacy Tigers',exact:true}).locator('xpath=ancestor::div[contains(@class,"rounded-3xl")][1]');
        if(!(await legacy.textContent()).includes(legacyExpected))throw Error('Legacy instant semantics changed');
        await legacy.click();await screen.getByRole('dialog').waitFor();await screen.locator('body').ariaSnapshot();
        const legacyEditExpected=zone==='America/Edmonton'?'September 30th, 2026':'October 1st, 2026';
        if(!(await screen.getByRole('dialog').textContent()).includes(legacyEditExpected))throw Error('Legacy edit date shifted');
        await screen.keyboard.press('Escape');
        await screen.getByRole('heading',{name:'Scheduled Tigers',exact:true}).click();await screen.getByRole('dialog').waitFor();await screen.locator('body').ariaSnapshot();
        if(!(await screen.getByRole('dialog').textContent()).includes('October 2nd, 2026'))throw Error('Scheduled date shifted');
        if(await screen.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error('Horizontal overflow at '+width);
        await screen.goto(${JSON.stringify(origin)}+'/tournament');
        try { await screen.getByRole('heading',{name:'Calendar QA Cup'}).waitFor({timeout:8000}); }
        catch { throw Error('Tournament render: '+JSON.stringify({errors,body:(await screen.locator('body').textContent()).slice(0,1600)})); }
        await screen.locator('body').ariaSnapshot();
        const timeline=screen.getByText('Timeline',{exact:true}).locator('..');
        if(!(await timeline.textContent()).includes('Oct 1 - Oct 2'))throw Error('Tournament timeline shifted');
        if(await screen.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error('Tournament overflow');
        await screen.screenshot({path:${JSON.stringify(output)}+'/'+zone.replace('/','-')+'-'+width+'-tournament.png'});
        await screen.goto(${JSON.stringify(origin)}+'/logo');
        await screen.getByAltText('Deployed team logo').waitFor();
        if(!await screen.getByAltText('Deployed team logo').evaluate(img=>img.complete&&img.naturalWidth>0))throw Error('Normalized logo corrupt');
        if(errors.length)throw Error(errors.join(';'));
        results.push({zone,width,scoreHistory:true,editDate:true,legacyInstant:true,scheduledMatch:true,tournamentTimeline:true,normalizedLogo:true,pageErrors:errors});
      }finally{await context.close();}
    }return results;
  }`]);
  await writeFile(path.join(output,'results.txt'),result);
  console.log(result);
}finally{await run(['close']).catch(()=>{});await new Promise(resolve=>server.close(resolve));}
