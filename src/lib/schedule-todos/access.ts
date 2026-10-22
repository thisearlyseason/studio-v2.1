import type{TodoStorage}from'./outbox';
export const todoPrefix=(uid:string)=>'squad_schedule_cloud_v1:'+encodeURIComponent(uid)+':';
export const todoLock=(uid:string)=>'squad-todo-account:'+uid;
export const fenceKey=(uid:string)=>todoPrefix(uid)+'logout-fence';
export type LockAPI={request<T>(name:string,options:{mode:'shared'|'exclusive';signal?:AbortSignal},callback:()=>Promise<T>):Promise<T>};
export function browserLocks():LockAPI{if(typeof navigator==='undefined'||!navigator.locks)throw Error('This browser cannot coordinate private task changes safely. Cloud tasks remain locked.');return navigator.locks as LockAPI}
export function rawPendingCount(storage:TodoStorage,uid:string){let n=0;for(let i=0;i<storage.length;i++)if(storage.key(i)?.startsWith(todoPrefix(uid)+'pending:'))n++;return n}
export function writeVerified(storage:TodoStorage,key:string,value:string){storage.setItem(key,value);if(storage.getItem(key)!==value)throw Error('Browser storage did not retain the private-task change.')}
export function removeVerified(storage:TodoStorage,key:string){storage.removeItem(key);if(storage.getItem(key)!==null)throw Error('Browser storage cleanup was incomplete. Some discarded edits may already be removed.')}
/** Each controller/auth notification gets a fresh in-memory lease. Never persist it. */
export function createTodoAccess(storage:TodoStorage){let session=0,lease:{uid:string;session:number;fence:string|null}|null=null;
 return{changedAccount(){session++;lease=null},locked(uid:string){const fence=storage.getItem(fenceKey(uid));return(fence!==null||rawPendingCount(storage,uid)>0)&&!(lease?.uid===uid&&lease.session===session&&lease.fence===fence)},resume(uid:string,confirmed:boolean){if(!confirmed)throw Error('Confirm resuming this account’s unencrypted browser edits.');lease={uid,session,fence:storage.getItem(fenceKey(uid))}},invalidate(){session++;lease=null}};
}
