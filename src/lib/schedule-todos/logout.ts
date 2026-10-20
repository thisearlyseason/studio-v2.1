import{browserLocks,todoLock,todoPrefix,fenceKey,rawPendingCount,writeVerified,removeVerified,type LockAPI}from'./access';
import type{TodoStorage}from'./outbox';
export type LogoutChoice='sync'|'keep'|'discard'|'cancel';
export type LogoutIdentity={uid:string;session:string};
export async function withTodoLogout<T>(deps:{storage:TodoStorage;locks:LockAPI;identity():LogoutIdentity|null;choose(count:number):Promise<LogoutChoice>;sync():Promise<void>;action(assertCurrent:()=>void):Promise<T>}){
 const expected=deps.identity();if(!expected)return deps.action(()=>{if(deps.identity())throw Error('Account changed. Logout cancelled.')});
 const assertCurrent=()=>{const current=deps.identity();if(current?.uid!==expected.uid||current.session!==expected.session)throw Error('Account changed. Logout choice cancelled.')};
 // Same exclusive lock covers choice, cleanup, recheck AND the actual auth logout.
 return deps.locks.request(todoLock(expected.uid),{mode:'exclusive',signal:AbortSignal.timeout(30000)},async()=>{assertCurrent();const count=rawPendingCount(deps.storage,expected.uid);let keepCount=count;let choice:LogoutChoice=count?await deps.choose(count):'keep';assertCurrent();if(choice==='cancel')return undefined;
 if(choice==='sync'){await deps.sync();assertCurrent();if(rawPendingCount(deps.storage,expected.uid))throw Error('Pending edits remain. Choose keep or discard explicitly before logout.');choice='keep';keepCount=0}
 // Freeze every cooperating tab before dropping caches or releasing the lock.
 writeVerified(deps.storage,fenceKey(expected.uid),crypto.randomUUID());assertCurrent();removeVerified(deps.storage,todoPrefix(expected.uid)+'snapshot');
 if(choice==='discard'){const keys:string[]=[];for(let i=0;i<deps.storage.length;i++){const k=deps.storage.key(i);if(k?.startsWith(todoPrefix(expected.uid)+'pending:'))keys.push(k)}for(const key of keys){assertCurrent();removeVerified(deps.storage,key)}}
 assertCurrent();const remaining=rawPendingCount(deps.storage,expected.uid);if(choice==='discard'&&remaining)throw Error('A pending edit appeared during logout. Logout was stopped.');if(choice==='keep'&&remaining!==keepCount)throw Error('Pending edits changed. Review the logout choice again.');
 return deps.action(assertCurrent);
 });
}
function choosePending(count:number):Promise<LogoutChoice>{return new Promise(resolve=>{const dialog=document.createElement('dialog'),heading=document.createElement('h2'),copy=document.createElement('p');heading.textContent='Unsent account tasks';copy.textContent=`${count} pending browser edits. Keeping them leaves unencrypted private data on this browser. Original device-only tasks and Pages recovery copies are separate and remain unchanged.`;dialog.append(heading,copy);let settled=false;const finish=(choice:LogoutChoice)=>{if(settled)return;settled=true;dialog.close();dialog.remove();resolve(choice)};for(const[label,choice]of[['Sync first','sync'],['Keep pending on this browser','keep'],['Discard pending edits','discard'],['Cancel logout','cancel']]as const){const b=document.createElement('button');b.textContent=label;b.onclick=()=>{if((choice==='keep'||choice==='discard')&&!window.confirm(choice==='keep'?'Keep these unencrypted pending edits on this browser? They will require fresh same-account confirmation to reopen.':'Discard this account’s pending cloud edits? This cannot be undone.'))return;finish(choice)};dialog.append(b)}dialog.addEventListener('cancel',e=>{e.preventDefault();finish('cancel')});document.body.append(dialog);dialog.showModal()})}
/** Only called behind the public feature flag. No auth or storage work when disabled. */
export async function coordinateTodoLogout(auth:import('firebase/auth').Auth,action:(assertCurrent:()=>void)=>Promise<void>){
 const{onAuthStateChanged}=await import('firebase/auth');let epoch=0,initial=true;const original=auth.currentUser;const unsubscribe=onAuthStateChanged(auth,()=>{if(initial){initial=false;return}epoch++});
 try{const session=crypto.randomUUID();const identity=()=>auth.currentUser&&auth.currentUser===original?{uid:auth.currentUser.uid,session:session+':'+epoch}:null;
 // Sync runs while the exclusive lock is held; use the already-owned-lock path.
 return await withTodoLogout({storage:localStorage,locks:browserLocks(),identity,choose:choosePending,sync:async()=>{const{createTodoOutbox}=await import('./outbox');const box=createTodoOutbox({storage:localStorage,getAccount:()=>auth.currentUser,fetch:(...args)=>fetch(...args),lockOwned:true});try{box.setAccount(original!.uid);box.resume(true);await box.flush()}finally{box.dispose()}},action});
 }finally{unsubscribe()}
}
