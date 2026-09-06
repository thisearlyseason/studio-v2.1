import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {findPracticeAssignedEvent} from '../scripts/qa/certification/local/practice-browser.mjs';
test('Practice itinerary observation excludes the still-closing detail dialog duplicate title',{skip:process.env.QA_PRACTICE_BROWSER_REGRESSION!=='true'},()=>{
  const wrapper=process.env.PLAYWRIGHT_CLI;assert.ok(wrapper);
  const session=`practice-role-regression-${process.pid}`;
  const cli=args=>{const result=spawnSync(wrapper,[`-s=${session}`,'--raw',...args],{encoding:'utf8',timeout:20000});assert.equal(result.status,0,result.stderr+result.stdout);return result.stdout.trim();};
  try{
    cli(['open','about:blank','--browser','chrome']);
    const result=JSON.parse(cli(['run-code',`async page=>{await page.setContent('<h4>Assigned practice</h4><div role="dialog"><h2>Assigned practice</h2></div>');return await (${findPracticeAssignedEvent.toString()})(page,'Assigned practice').count();}`]));
    assert.equal(result,1);
  }finally{cli(['close']);}
});
