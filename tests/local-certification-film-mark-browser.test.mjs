import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import * as film from '../scripts/qa/certification/local/film-playback.mjs';

test('Film waits for the saved mark paragraph instead of clicking the pending comment textarea', {skip:process.env.QA_FILM_BROWSER_REGRESSION !== 'true'},()=>{
  const wrapper=process.env.PLAYWRIGHT_CLI;
  assert.ok(wrapper,'Use the Playwright skill wrapper.');
  const session=`film-mark-regression-${process.pid}`;
  const cli=args=>{const result=spawnSync(wrapper,[`-s=${session}`,'--raw',...args],{encoding:'utf8',timeout:20000});assert.equal(result.status,0,result.stderr+result.stdout);return result.stdout.trim();};
  const select=film.findSavedFilmMark;
  try {
    cli(['open','about:blank','--browser','chrome']);
    const result=JSON.parse(cli(['run-code',`async page=>{
      await page.setContent('<textarea>QA Coach Mark</textarea>');
      await page.evaluate(()=>{globalThis.seek=0;setTimeout(()=>{const row=document.createElement('p');row.textContent='QA Coach Mark';row.onclick=()=>{globalThis.seek=1;};document.body.append(row);},300);});
      const mark=(${select.toString()})(page,'QA Coach Mark');
      await mark.waitFor({state:'visible',timeout:3000});await mark.click();
      return {tag:await mark.evaluate(element=>element.tagName),seek:await page.evaluate(()=>globalThis.seek)};
    }`]));
    assert.deepEqual(result,{tag:'P',seek:1});
  } finally {cli(['close']);}
});
