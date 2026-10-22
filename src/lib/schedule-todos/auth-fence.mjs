// Standalone local candidate. No provider calls occur until the supplied SDK is invoked.
// Does not attest other tabs, reauthentication, legacy retirement or server revocation.
export function createAuthFence({auth,observe,signOut,onInvalidate=()=>{},timeoutMs=5000}) {
 let ready=false,disposed=false,fault=null,epoch=0,user=null,sawNull=false,fresh=false,attempt=null;
 let resolveReady,rejectReady;const readiness=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject});readiness.catch(()=>{});
 const leases=new WeakMap(),receipts=new WeakMap(),listeners=new Set();
 const instance=Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');
 const error=message=>new Error(message);
 const invalidate=()=>{try{onInvalidate()}catch(e){fault=e}for(const listener of listeners){try{listener()}catch(e){fault=e}}};
 const check=()=>{if(disposed||fault||!ready)throw error('Authentication unavailable.');if(auth.currentUser!==user)throw error('Authentication changed before observer settled.');};
 const unsubscribe=observe(auth,next=>{
  const initial=!ready;ready=true;resolveReady();epoch++;user=next;fresh=!initial&&next!==null&&sawNull;
  if(next===null)sawNull=true;else sawNull=false;
  invalidate();
  if(attempt){if(next===null){attempt.nullEpoch=epoch;attempt.signal()}else{attempt.invalid=true;attempt.signal()}}
 },cause=>{rejectReady(cause||error('Authentication observer failed.'));fault=cause||error('Authentication observer failed.');epoch++;user=null;fresh=false;invalidate();if(attempt){attempt.invalid=true;attempt.signal()}});
 const capture=()=>{check();if(!user)throw error('Sign in required.');const lease=Object.freeze({uid:user.uid,session:instance+':'+epoch,observedSignInAfterNull:fresh});leases.set(lease,{user,epoch});return lease};
 const assertLease=lease=>{check();const saved=leases.get(lease);if(!saved||saved.user!==user||saved.epoch!==epoch||lease.uid!==user?.uid)throw error('Authentication lease retired.');};
 const makeReceipt=kind=>{check();if(user!==null)throw error('Signed-out observation required.');const receipt=Object.freeze({kind});receipts.set(receipt,epoch);return receipt};
 const assertSignedOut=receipt=>{check();if(user!==null||!receipts.has(receipt)||receipts.get(receipt)!==epoch)throw error('Signed-out evidence retired.');};
 async function logout(lease){
  assertLease(lease);if(attempt)throw error('Signout already in progress.');
  let resolveSignal;const signal=new Promise(resolve=>{resolveSignal=resolve});
  const own={invalid:false,nullEpoch:null,outcome:'pending',signal:()=>resolveSignal()};attempt=own;
  // A UI deadline does not cancel an SDK operation. Keep admission to another
  // signout fenced until the actual SDK/observer operation settles.
  const work=(async()=>{try{
   assertLease(lease);await signOut(auth);
   if(own.nullEpoch===null&&!own.invalid)await signal;
   check();if(own.invalid||own.nullEpoch!==epoch||user!==null)throw error('Signout evidence changed.');
   return makeReceipt('sdk-signout-completed');
  }finally{if(attempt===own)attempt=null}})();
  own.work=work;
  let timer;try{return await Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>{own.outcome='unknown';const e=error('Signout outcome unknown. Do not retry; awaiting SDK/auth observation.');e.name='OutcomeUnknownError';reject(e)},timeoutMs)})])}finally{clearTimeout(timer)}
 }

 return {waitForSettlement(){if(!attempt?.work)throw error('No unresolved signout operation.');return attempt.work},async waitForReady(){let timer;try{await Promise.race([readiness,new Promise((_,reject)=>{timer=setTimeout(()=>reject(error('Authentication readiness timed out.')),timeoutMs)})]);check()}finally{clearTimeout(timer)}},subscribeInvalidation(listener){if(disposed)throw error('Authentication disposed.');listeners.add(listener);return()=>listeners.delete(listener)},capture,assertLease,logout,signedOutReceipt:()=>makeReceipt('observed-signed-out'),assertSignedOut,assertSdkSignout(receipt){assertSignedOut(receipt);if(receipt.kind!=='sdk-signout-completed')throw error('SDK signout completion required.')},status:()=>attempt?.outcome??'idle',dispose(){if(disposed)return;disposed=true;rejectReady(error('Authentication disposed.'));epoch++;fresh=false;invalidate();if(attempt){attempt.invalid=true;attempt.signal()}unsubscribe()}};
}
