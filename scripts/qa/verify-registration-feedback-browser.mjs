import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { readFile } from 'node:fs/promises';

const exec = promisify(execFile);
const cli = process.env.PLAYWRIGHT_CLI;
if (!cli) throw new Error('Set PLAYWRIGHT_CLI to the installed Playwright CLI wrapper.');
const session = `registration-feedback-${process.pid}`;
const dedicated = process.argv.includes('--dedicated');
const portal = await readFile(dedicated ? 'src/app/tournaments/[teamId]/waiver/[eventId]/page.tsx' : 'src/app/register/tournament/[teamId]/[eventId]/page.tsx','utf8');
const checkboxAt = portal.indexOf(dedicated ? '<Checkbox' : '<Checkbox id="waiver_agree"');
assert.ok(checkboxAt > 0, 'Waiver consent control must exist');
const rowStart = portal.lastIndexOf('<div ',checkboxAt);
const waiverRow = portal.slice(rowStart,portal.indexOf('</div>',checkboxAt)+6);
const bundle = await build({
  stdin: { contents: `import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {Toaster} from './src/components/ui/toaster';
    import {toast} from './src/hooks/use-toast';
    import {Checkbox} from './src/components/ui/checkbox';
    import {Label} from './src/components/ui/label';
    import {ScrollArea} from './src/components/ui/scroll-area';
    function App(){const [waiverAgreed,setWaiverAgreed]=React.useState(false);const agreed=waiverAgreed,setAgreed=setWaiverAgreed;const isPlayerPipeline=false;return <><h1>Registration still usable</h1>
      <form><ScrollArea style={{height:300}}><ScrollArea style={{height:150}}>Existing participation agreement</ScrollArea>${waiverRow}</ScrollArea></form>
      <button onClick={()=>toast({title:'Signature Required',description:'Accept and sign the agreements.',variant:'destructive'})}>Submit unsigned</button>
      <button onClick={()=>toast({title:'Registration received',description:'Saved successfully.'})}>Submit signed</button>
      <Toaster/></>};createRoot(document.getElementById('root')).render(<App/>);`, loader: 'tsx', resolveDir: process.cwd() },
  bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  alias: { '@': path.join(process.cwd(), 'src') },
});
const server = createServer((req, res) => {
  if (req.url === '/app.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundle.outputFiles[0].text); }
  else if (req.url === '/favicon.ico') { res.writeHead(204); res.end(); }
  else { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html><body><div id="root"></div><script src="/app.js"></script></body></html>'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const run = async args => {
  const { stdout, stderr } = await exec(cli, [`-s=${session}`, ...args], { timeout: 45000, maxBuffer: 1024 * 1024 });
  assert.ok(!stdout.includes('### Error'), stdout + stderr);
  return stdout;
};
try {
  await run(['open', `http://127.0.0.1:${server.address().port}`]);
  await run(['run-code', `async page => {
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    for(const width of [1440,390]){
      await page.setViewportSize({width,height:900});
      await page.getByRole('checkbox').check();
      await page.waitForTimeout(150);
      if(errors.length)throw Error(errors.join('; '));
      if(!await page.getByRole('checkbox').isChecked())throw Error('Consent did not persist');
      await page.locator(${JSON.stringify(`label[for="${dedicated ? 'agree' : 'waiver_agree'}"]`)}).click();
      if(await page.getByRole('checkbox').isChecked())throw Error('Label did not toggle consent exactly once');
      for(const label of ['Submit unsigned','Submit signed','Submit unsigned']){
        await page.getByRole('button',{name:label,exact:true}).click();
        await page.waitForTimeout(150);
        if(errors.length)throw Error(errors.join('; '));
        const title=label==='Submit unsigned'?'Signature Required':'Registration received';
        if(!await page.getByText(title,{exact:true}).isVisible())throw Error('Feedback did not render');
        if(!await page.getByRole('heading',{name:'Registration still usable'}).isVisible())throw Error('Page crashed');
      }
    }
    return {errors,toastUpdates:6,viewports:2};
  }`]);
  console.log(`PASS: actual ${dedicated ? 'dedicated waiver' : 'registration'} portal consent row and production-mode Toaster handle checkbox/label toggles and six validation/success updates at desktop/mobile widths without a page error.`);
} finally {
  await run(['close']).catch(() => {});
  await new Promise(resolve => server.close(resolve));
}
