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

test('feed refresh aborts an in-flight read when demo teardown begins', async () => {
  const target = new EventTarget();
  const timers = [];
  let signal;
  let finish;
  startFeedRefresh({
    load: currentSignal => {
      signal = currentSignal;
      return new Promise(resolve => { finish = resolve; });
    },
    onValue: () => {},
    onError: () => {},
    schedule: callback => { timers.push(callback); return timers.length; },
    cancel: () => {},
    pauseOn: { target, eventName: 'squad:demo-exit', resumeEventName: 'squad:demo-exit-cancelled' },
  });

  target.dispatchEvent(new Event('squad:demo-exit'));
  assert.equal(signal.aborted, true);
  finish([]);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(timers.length, 0);
});

test('feed refresh resumes after a failed demo teardown', async () => {
  const target = new EventTarget();
  const signals = [];
  const finishes = [];
  const stop = startFeedRefresh({
    load: signal => {
      signals.push(signal);
      return new Promise(resolve => { finishes.push(resolve); });
    },
    onValue: () => {},
    onError: () => {},
    pauseOn: { target, eventName: 'squad:demo-exit', resumeEventName: 'squad:demo-exit-cancelled' },
  });

  target.dispatchEvent(new Event('squad:demo-exit'));
  finishes[0]([]);
  await new Promise(resolve => setImmediate(resolve));
  target.dispatchEvent(new Event('squad:demo-exit-cancelled'));
  assert.equal(signals.length, 2);
  assert.equal(signals[0].aborted, true);
  assert.equal(signals[1].aborted, false);
  stop();
  finishes[1]([]);
});
