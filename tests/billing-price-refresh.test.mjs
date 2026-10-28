import assert from 'node:assert/strict';
import test from 'node:test';
import {createBillingPriceRefresh} from '../src/lib/billing-price-refresh.ts';
import {DISPLAY_PRICE_MAX_AGE_MS,isFreshDisplayPrice} from '../src/lib/billing-display-price.ts';
const settle=async()=>{for(let i=0;i<12;i++)await Promise.resolve()};
function fixture(load){
 let time=1000000,seq=0,available=true,calls=0,states=[];const timers=new Map();
 const quote=(age=0)=>({id:'price_fixture',amount:19.99,currency:'USD',formatted:'USD 19.99',interval:'month',fetchedAt:time-age});
 const c=createBillingPriceRefresh({load:signal=>{calls++;return load?.({signal,quote,time,calls})??Promise.resolve({prices:[quote()]})},changed:s=>states.push(s),available:()=>available,now:()=>time,schedule:(cb,ms)=>{const id=++seq;timers.set(id,{at:time+ms,cb});return id},cancel:id=>timers.delete(id)});
 async function advance(ms){const end=time+ms;let limit=0;while(true){const e=[...timers].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!e)break;assert(++limit<1000,'timer loop');time=e[1].at;timers.delete(e[0]);e[1].cb();await settle()}time=end;await settle()}
 return{c,quote,advance,states,timers,get calls(){return calls},get state(){return states.at(-1)},get time(){return time},setAvailable:v=>{available=v}};
}
test('entry loads fresh server prices and refreshes before five-minute expiry',async()=>{const f=fixture();f.c.refresh();await settle();assert.equal(f.calls,1);assert.equal(f.state.loading,false);await f.advance(270000);assert.equal(f.calls,2);assert.equal(f.state.prices[0].fetchedAt,f.time);f.c.stop();assert.equal(f.timers.size,0)});
test('expired cached catalog fails closed then retry recovers without manual refresh',async()=>{const f=fixture(({quote,calls})=>Promise.resolve({prices:[quote(calls===1?DISPLAY_PRICE_MAX_AGE_MS:0)]}));f.c.refresh();await settle();assert.deepEqual(f.state.prices,[]);await f.advance(1000);assert.equal(f.calls,2);assert.equal(f.state.prices.length,1);f.c.stop()});
test('future-dated quotes are never authorized; retry can later obtain a current quote',async()=>{const f=fixture(({quote,calls})=>Promise.resolve({prices:[quote(calls===1?-1:0)]}));f.c.refresh();await settle();assert.deepEqual(f.state.prices,[]);await f.advance(1000);assert.equal(f.state.prices.length,1);f.c.stop()});
test('a partly future-dated cached catalog retries automatically and restores every price',async()=>{
 let cached;
 const f=fixture(({quote,time})=>{
  cached??=Array.from({length:10},(_,i)=>({...quote(),id:`price_fixture_${i}`,fetchedAt:time+(i===4||i===8?30:-20)}));
  return Promise.resolve({prices:cached});
 });
 f.c.refresh();await settle();assert.equal(f.state.prices.length,8);
 assert(f.state.prices.every(p=>isFreshDisplayPrice(p,f.time)));
 await f.advance(1000);assert.equal(f.calls,2);assert.equal(f.state.prices.length,10);
 f.c.stop();assert.equal(f.timers.size,0);
});
test('partial future-price retries back off and never authorize the future quote',async()=>{
 const f=fixture(({quote,time})=>Promise.resolve({prices:[quote(),{...quote(),id:'price_future',fetchedAt:time+60000}]}));
 f.c.refresh();await settle();await f.advance(1000);assert.equal(f.calls,2);
 await f.advance(2000);assert.equal(f.calls,3);await f.advance(59000);assert(f.calls<=8);
 assert.equal(f.state.prices.length,1);assert(f.state.prices.every(p=>isFreshDisplayPrice(p,f.time)));
 f.c.stop();assert.equal(f.timers.size,0);
});
test('network failure retains only still-fresh quotes and invalidates them at expiry',async()=>{const f=fixture(({quote,calls})=>calls===1?Promise.resolve({prices:[quote()]}):Promise.reject(Error('offline')));f.c.refresh();await settle();await f.advance(270000);assert.equal(f.state.prices.length,1);await f.advance(30000);assert.deepEqual(f.state.prices,[]);assert(f.calls<10);f.c.stop()});
test('empty or malformed successful response immediately removes old prices',async()=>{for(const data of [{prices:[]},{prices:'bad'},null]){const f=fixture(({quote,calls})=>Promise.resolve(calls===1?{prices:[quote()]}:data));f.c.refresh();await settle();await f.advance(1000);f.c.refresh();await settle();assert.deepEqual(f.state.prices,[]);f.c.stop()}});
test('hidden/offline expiry and foreground/reconnect fetch; no background polling loop',async()=>{const f=fixture();f.c.refresh();await settle();f.setAvailable(false);await f.advance(600000);assert.equal(f.calls,1);assert.deepEqual(f.state.prices,[]);f.setAvailable(true);f.c.refresh();await settle();assert.equal(f.calls,2);assert.equal(f.state.prices.length,1);f.c.stop()});
test('repeated clicks coalesce pending request and obey request cooldown',async()=>{let resolve;const f=fixture(()=>new Promise(r=>{resolve=r}));for(let i=0;i<50;i++)f.c.refresh();await settle();assert.equal(f.calls,1);resolve({prices:[f.quote()]});await settle();for(let i=0;i<50;i++)f.c.refresh();await settle();assert.equal(f.calls,1);await f.advance(1000);assert.equal(f.calls,2);f.c.stop()});
test('timeout and late response cannot overwrite a recovered newer request',async()=>{let resolve;const f=fixture(({quote,calls})=>calls===1?new Promise(r=>{resolve=r}):Promise.resolve({prices:[quote()]}));f.c.refresh();await settle();await f.advance(16000);assert.equal(f.calls,2);const fresh=f.state.prices[0];resolve({prices:[{...fresh,formatted:'OLD'}]});await settle();assert.equal(f.state.prices[0].formatted,'USD 19.99');f.c.stop()});
test('stop fences outstanding response and clears all owned timers',async()=>{let resolve,signal;const f=fixture(x=>{signal=x.signal;return new Promise(r=>{resolve=r})});f.c.refresh();await settle();const count=f.states.length;f.c.stop();assert(signal.aborted);resolve({prices:[f.quote()]});await settle();assert.equal(f.states.length,count);assert.equal(f.timers.size,0)});
test('near-expiry responses refresh at expiration without a tight timer loop',async()=>{const f=fixture(({quote})=>Promise.resolve({prices:[quote(DISPLAY_PRICE_MAX_AGE_MS-10000)]}));f.c.refresh();await settle();await f.advance(10000);assert.equal(f.calls,2);assert(f.state.prices.every(p=>isFreshDisplayPrice(p,f.time)));f.c.stop()});
