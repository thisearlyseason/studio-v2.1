import{browserLocks,todoLock,todoPrefix,fenceKey,rawPendingCount,writeVerified,removeVerified,type LockAPI}from'./access';
import type{TodoStorage}from'./outbox';
import{freshTodoId,withTodoLock}from'./compat';
import{createAuthFence,type SignedOutReceipt}from'./auth-fence.mjs';
const authFences=new WeakMap<import('firebase/auth').Auth,{fence:ReturnType<typeof createAuthFence>;active:boolean}>();
export type LogoutChoice='sync'|'keep'|'discard'|'cancel';
export type LogoutIdentity={uid:string;session:string};
export async function withTodoLogout<T>(deps:{storage:TodoStorage;locks:LockAPI;identity():LogoutIdentity|null;choose(count:number):Promise<LogoutChoice>;sync():Promise<void>;action(assertCurrent:()=>void):Promise<T>}){
 const expected=deps.identity();if(!expected)return deps.action(()=>{if(deps.identity())throw Error('Account changed. Logout cancelled.')});
 const assertCurrent=()=>{const current=deps.identity();if(current?.uid!==expected.uid||current.session!==expected.session)throw Error('Account changed. Logout choice cancelled.')};
 // Same exclusive lock covers choice, cleanup, recheck AND the actual auth logout.
 return withTodoLock(deps.locks,todoLock(expected.uid),'exclusive',30000,async()=>{assertCurrent();const count=rawPendingCount(deps.storage,expected.uid);let keepCount=count;let choice:LogoutChoice=count?await deps.choose(count):'keep';assertCurrent();if(choice==='cancel')return undefined;
 if(choice==='sync'){await deps.sync();assertCurrent();if(rawPendingCount(deps.storage,expected.uid))throw Error('Pending edits remain. Choose keep or discard explicitly before logout.');choice='keep';keepCount=0}
 // Freeze every cooperating tab before dropping caches or releasing the lock.
 writeVerified(deps.storage,fenceKey(expected.uid),freshTodoId());assertCurrent();removeVerified(deps.storage,todoPrefix(expected.uid)+'snapshot');
 if(choice==='discard'){const keys:string[]=[];for(let i=0;i<deps.storage.length;i++){const k=deps.storage.key(i);if(k?.startsWith(todoPrefix(expected.uid)+'pending:'))keys.push(k)}for(const key of keys){assertCurrent();removeVerified(deps.storage,key)}}
 assertCurrent();const remaining=rawPendingCount(deps.storage,expected.uid);if(choice==='discard'&&remaining)throw Error('A pending edit appeared during logout. Logout was stopped.');if(choice==='keep'&&remaining!==keepCount)throw Error('Pending edits changed. Review the logout choice again.');
 return deps.action(assertCurrent);
 });
}
/** Explicit compatibility route: retain copies, never assume no legacy writer exists. */
export async function withRetainedTodoLogout<T>(deps:{storage:TodoStorage;identity():LogoutIdentity|null;choose():Promise<boolean>;notifyHidden():void;action(assertCurrent:()=>void):Promise<T>}){
 const expected=deps.identity();if(!expected)throw Error('Sign in state changed. Logout paused.');
 const assertIdentity=()=>{const current=deps.identity();if(current?.uid!==expected.uid||current.session!==expected.session)throw Error('Account changed. Logout choice cancelled.')};
 assertIdentity();if(!await deps.choose()){assertIdentity();return undefined}assertIdentity();
 const token=freshTodoId();writeVerified(deps.storage,fenceKey(expected.uid),token);
 const assertCurrent=()=>{assertIdentity();if(deps.storage.getItem(fenceKey(expected.uid))!==token)throw Error('Task fence changed or could not be verified. Logout paused.')};
 assertCurrent();deps.notifyHidden();assertCurrent();
 // No send, purge, discard, sweep or pending-count assumption. Old code can still
 // finish work under its original UID; the warning explicitly discloses this.
 return deps.action(assertCurrent);
}
function choosePending(count:number,retained=false):Promise<LogoutChoice>{return new Promise((resolve,reject)=>{
 const native=document.createElement('dialog'),nativeModal=typeof native.showModal==='function';
 const dialog=nativeModal?native:document.createElement('div'),heading=document.createElement('h2'),copy=document.createElement('p');
 const id='todo-logout-'+freshTodoId();heading.id=id+'-title';copy.id=id+'-description';
 heading.textContent=retained?'Keep task copies on this device?':'Unsent account tasks';copy.textContent=retained?'This browser cannot coordinate task cleanup across older tabs. Unencrypted saved task copies AND pending edits may remain on this device until older tabs are closed and explicitly cleaned up. Already-started requests in older tabs may finish. This option does not send or discard pending edits, and does not guarantee cache cleanup. Other accounts must not open these copies. Original device-only tasks and Pages recovery remain separate.':`${count} pending browser edits. Keeping them leaves unencrypted private data on this browser. Original device-only tasks and Pages recovery copies are separate and remain unchanged.`;
 dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-labelledby',heading.id);dialog.setAttribute('aria-describedby',copy.id);dialog.append(heading,copy);
 const backdrop=nativeModal?null:document.createElement('div');
 if(backdrop){Object.assign(backdrop.style,{position:'fixed',inset:'0',zIndex:'2147483647',background:'rgba(0,0,0,.55)',display:'flex',alignItems:'center',justifyContent:'center',padding:'16px'});Object.assign(dialog.style,{background:'white',color:'#18181b',padding:'24px',borderRadius:'12px',maxWidth:'32rem',maxHeight:'90vh',overflow:'auto'});backdrop.append(dialog)}
 const previous=document.activeElement;let settled=false;const buttons:HTMLButtonElement[]=[];
 const keydown=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();finish('cancel')}else if(event.key==='Tab'){const index=buttons.indexOf(document.activeElement as HTMLButtonElement);event.preventDefault();buttons[(index+(event.shiftKey?-1:1)+buttons.length)%buttons.length].focus()}};
 const focusin=(event:FocusEvent)=>{if(!dialog.contains(event.target as Node))buttons[buttons.length-1].focus()};
 const cleanup=()=>{document.removeEventListener('keydown',keydown,true);document.removeEventListener('focusin',focusin,true);try{if(nativeModal&&native.open)native.close()}catch{/* Removing the owned element still closes the fallback safely. */}finally{(backdrop??dialog).remove();if(previous instanceof HTMLElement&&previous.isConnected)previous.focus()}};
 const finish=(choice:LogoutChoice)=>{if(settled)return;settled=true;cleanup();resolve(choice)};
 const choices:ReadonlyArray<readonly[string,LogoutChoice]>=retained?[['Keep task copies and sign out','keep'],['Cancel logout','cancel']]:[['Sync first','sync'],['Keep pending on this browser','keep'],['Discard pending edits','discard'],['Cancel logout','cancel']];
 for(const[label,choice]of choices){const b=document.createElement('button');b.type='button';b.textContent=label;Object.assign(b.style,{display:'block',width:'100%',minHeight:'44px',padding:'8px 12px',marginTop:'8px'});b.onclick=()=>{if((choice==='keep'||choice==='discard')&&!window.confirm(choice==='keep'?(retained?'Keep unencrypted saved task copies and pending edits on this device? Older tabs may still finish requests. Cleanup is not guaranteed. Fresh same-account confirmation is required to open retained tasks in this updated app.':'Keep these unencrypted pending edits on this browser? They will require fresh same-account confirmation to reopen.'):'Discard this account’s pending cloud edits? This cannot be undone.'))return;finish(choice)};dialog.append(b);buttons.push(b)}
 dialog.addEventListener('cancel',event=>{event.preventDefault();finish('cancel')});
 try{document.body.append(backdrop??dialog);if(nativeModal)native.showModal();else{document.addEventListener('keydown',keydown,true);document.addEventListener('focusin',focusin,true)}buttons[buttons.length-1].focus()}catch{if(!settled){settled=true;cleanup();reject(Error('Task logout choices could not open. Pending edits are retained.'))}}
})}
/** Only called behind the public feature flag. No auth/storage work when disabled. */
export async function coordinateTodoLogout(auth:import('firebase/auth').Auth,action:(assertCurrent:()=>void,signOutCurrent?:()=>Promise<void>)=>Promise<void>){
 const{onAuthStateChanged,signOut}=await import('firebase/auth');
 let state=authFences.get(auth);
 if(!state){state={fence:createAuthFence({auth,observe:(_auth,next,error)=>onAuthStateChanged(auth,next,error),signOut:()=>signOut(auth),onInvalidate:()=>window.dispatchEvent(new Event('storage'))}),active:false};authFences.set(auth,state)}
 const {fence}=state;
 if(state.active||fence.status()!=='idle')throw Error('A prior logout is still pending or has an unknown outcome. Do not retry.');
 state.active=true;
 let reportUnknown:(error:unknown)=>void=()=>{};const uiDeadline=new Promise<never>((_resolve,reject)=>{reportUnknown=reject});
 const work=(async()=>{try{
  await fence.waitForReady();
  if(!auth.currentUser)return action(()=>{if(auth.currentUser)throw Error('Account changed. Logout paused.')});
  const original=auth.currentUser,lease=fence.capture();
  const canCoordinate=typeof navigator!=='undefined'&&typeof navigator.locks?.request==='function'&&typeof AbortController!=='undefined';
  const identity=()=>{fence.assertLease(lease);return{uid:lease.uid,session:lease.session}};
  const guardedAction=async(assertCurrent:()=>void)=>{
   let receipt:SignedOutReceipt|undefined,callbackError:unknown;
   await action(assertCurrent,async()=>{
    try{
     assertCurrent();
     try{receipt=await fence.logout(lease)}
     catch(error){
      if(canCoordinate&&error instanceof Error&&error.name==='OutcomeUnknownError'){
       reportUnknown(error);receipt=await fence.waitForSettlement();
      }else throw error;
     }
     fence.assertSdkSignout(receipt);
    }catch(error){callbackError=error;throw error}
   });
   if(!receipt){if(callbackError)throw callbackError;throw Error('Logout did not complete. Task copies remain protected.')}
   fence.assertSdkSignout(receipt);
  };
  // Keep genuine exclusive-lock semantics on capable browsers. The approved
  // compatibility path never enables cloud operations or fabricates a lock.
  if(!canCoordinate)return await withRetainedTodoLogout({storage:localStorage,identity,choose:async()=>await choosePending(0,true)==='keep',notifyHidden:()=>window.dispatchEvent(new Event('storage')),action:guardedAction});
  return await withTodoLogout({storage:localStorage,locks:browserLocks(),identity,choose:choosePending,sync:async()=>{const{createTodoOutbox}=await import('./outbox');const box=createTodoOutbox({storage:localStorage,getAccount:()=>auth.currentUser,fetch:(...args)=>fetch(...args),lockOwned:true});try{box.setAccount(original.uid);box.resume(true);await box.flush()}finally{box.dispose()}},action:guardedAction});
 }finally{state.active=false;const cleanup=()=>{if(authFences.get(auth)===state&&!state.active&&fence.status()==='idle'){fence.dispose();authFences.delete(auth)}};if(fence.status()==='idle')cleanup();else void fence.waitForSettlement().then(cleanup,cleanup)}})();
 return await Promise.race([work,uiDeadline]);
}

