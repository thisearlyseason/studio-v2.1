import test from 'node:test';
import assert from 'node:assert/strict';
import * as module from '../scripts/qa/certification/local/film-playback.mjs';

test('Film playback evidence rejects unready, paused, and non-advancing media', async()=>{
  assert.equal(typeof module.validateFilmPlayback,'function');
  const observed={duration:1.812,before:0,after:0.302,paused:false};
  assert.equal(module.validateFilmPlayback(observed),true);
  for(const invalid of [{...observed,duration:Infinity},{...observed,after:0},{...observed,paused:true},{...observed,after:3}]) assert.throws(()=>module.validateFilmPlayback(invalid));
});
