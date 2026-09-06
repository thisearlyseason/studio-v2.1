import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import * as film from '../scripts/qa/certification/local/film-playback.mjs';

test('Film starts native playback to settle stream WebM duration before its fractional seek', {skip:process.env.QA_FILM_BROWSER_REGRESSION !== 'true'},()=>{
  const wrapper=process.env.PLAYWRIGHT_CLI;
  assert.ok(wrapper,'Use the Playwright skill wrapper.');
  const session=`film-duration-regression-${process.pid}`;
  const cli=args=>{const result=spawnSync(wrapper,[`-s=${session}`,'--raw',...args],{encoding:'utf8',timeout:20000});assert.equal(result.status,0,result.stderr+result.stdout);return result.stdout.trim();};
  try {
    cli(['open','about:blank','--browser','chrome']);
    const result=JSON.parse(cli(['run-code',`async page=>page.evaluate(async()=>{
      const canvas=document.createElement('canvas');canvas.width=320;canvas.height=180;
      const context=canvas.getContext('2d');const stream=canvas.captureStream(12);
      const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8'});const chunks=[];
      recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
      const stopped=new Promise(resolve=>recorder.onstop=resolve);recorder.start(100);
      for(let frame=0;frame<18;frame++){context.fillStyle=frame%2===0?'#C81E1E':'#111111';context.fillRect(0,0,320,180);context.fillStyle='#FFFFFF';context.font='24px sans-serif';context.fillText('The Squad QA Film',45,95);await new Promise(resolve=>setTimeout(resolve,100));}
      recorder.stop();await stopped;stream.getTracks().forEach(track=>track.stop());
      const url=URL.createObjectURL(new Blob(chunks,{type:'video/webm'}));
      const media=document.createElement('video');media.controls=true;document.body.append(media);
      try {
        const metadata=new Promise(resolve=>media.addEventListener('loadedmetadata',resolve,{once:true}));
        media.src=url;await metadata;
        const initialDuration=String(media.duration);
        const playback=await (${film.observeFilmPlayback.toString()})(media,0.76);
        return {initialDuration,playback,pausedAfter:media.paused};
      } finally {media.pause();media.remove();URL.revokeObjectURL(url);}
    })`]));
    assert.equal(result.initialDuration,'Infinity');
    assert.equal(film.validateFilmPlayback(result.playback),true);
    assert.ok(Math.abs(result.playback.before/result.playback.duration-0.76)<0.01);
    assert.equal(result.pausedAfter,true);
  } finally {cli(['close']);}
});

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
