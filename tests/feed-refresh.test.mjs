import assert from 'node:assert/strict';
import test from 'node:test';
import { startFeedRefresh } from '../src/lib/feed-refresh.ts';

test('feed refresh never overlaps and cancelled old-team responses cannot publish',async()=>{
  let resolve;
  let loads=0;
  const values=[];
  const timers=[];
  const stop=startFeedRefresh({load:()=>{loads++;return new Promise(done=>{resolve=done;});},onValue:value=>values.push(value),onError:()=>{},schedule:callback=>{timers.push(callback);return timers.length;},cancel:()=>{}});
  assert.equal(loads,1);
  assert.equal(timers.length,0);
  stop();
  resolve('old team private');
  await new Promise(done=>setImmediate(done));
  assert.deepEqual(values,[]);
  assert.equal(timers.length,0);
});

test('feed refresh schedules its next read only after the previous read settles',async()=>{
  let resolve;
  const timers=[];
  const values=[];
  const stop=startFeedRefresh({load:()=>new Promise(done=>{resolve=done;}),onValue:value=>values.push(value),onError:()=>{},schedule:callback=>{timers.push(callback);return timers.length;},cancel:()=>{}});
  resolve('first');
  await new Promise(done=>setImmediate(done));
  assert.deepEqual(values,['first']);
  assert.equal(timers.length,1);
  stop();
});
