import type {LockAPI} from './access';
/** UUIDs here identify local task requests/fences, never credentials. */
export function freshTodoId():string {
  if(typeof crypto!=='undefined'&&typeof crypto.randomUUID==='function')return crypto.randomUUID();
  if(typeof crypto==='undefined'||typeof crypto.getRandomValues!=='function')throw Error('Secure browser randomness is unavailable. Task changes remain locked.');
  const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
  const h=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
/** Keep genuine cross-context locks; only replace the optional static timeout API. */
export async function withTodoLock<T>(locks:LockAPI,name:string,mode:'shared'|'exclusive',milliseconds:number,work:()=>Promise<T>):Promise<T>{
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),milliseconds);
  try{return await locks.request(name,{mode,signal:controller.signal},work)}finally{clearTimeout(timer)}
}
export function cloudTaskCapabilityError():string|null {
  if(typeof navigator==='undefined'||!navigator.locks||typeof navigator.locks.request!=='function')return 'Cloud tasks are unavailable because this browser cannot coordinate private edits safely.';
  if(typeof AbortController==='undefined')return 'Cloud tasks are unavailable because this browser cannot cancel private task operations safely.';
  if(typeof crypto==='undefined'||typeof crypto.randomUUID!=='function'&&typeof crypto.getRandomValues!=='function')return 'Cloud tasks are unavailable because secure browser randomness is missing.';
  return null;
}
