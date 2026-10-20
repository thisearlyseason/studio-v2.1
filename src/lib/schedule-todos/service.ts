import {randomUUID,createHash} from 'node:crypto';
import {isAccountAccessBlocked,type AccountAccessProfile} from '@/lib/account-access-policy';
import {TODO_RETENTION as P} from './retention';
import {TodoError,todoIntent,todoId,contextPrefix,deletedTodo,todoContext,type CloudTodo,type TodoContext} from './model';
export type Meta=TodoContext&{activeCount:number;metadataCount:number;totalMetadataCount:number;openedAt:number};
export type Receipt={hash:string;id:string;version:number;deletedAt:string|null;generation:number};
export type Marker={id:string;version:number;deletedAt:string;generation:number};
export interface TodoScope {profile():Promise<AccountAccessProfile|null>;meta():Promise<Meta|null>;task(id:string):Promise<CloudTodo|null>;receipt(g:number,id:string):Promise<Receipt|null>;marker(g:number,id:string):Promise<Marker|null>;list(cursor:string|null,limit:number):Promise<CloudTodo[]>;setMeta(meta:Meta):void;setTask(record:CloudTodo):void;deleteTask(id:string):void;setReceipt(g:number,id:string,receipt:Receipt):void;setMarker(g:number,id:string,marker:Marker):void}
export interface TodoStore {run<T>(uid:string,work:(scope:TodoScope)=>Promise<T>):Promise<T>;cleanup?(uid:string,context:TodoContext):Promise<number>}
export function assertTodoAccount(uid:string){if(!uid||uid.length>128||uid.includes('/'))throw new TodoError('Sign in to manage tasks.',401)}
async function authorized(scope:TodoScope,now:number){const p=await scope.profile();if(!p||isAccountAccessBlocked(p))throw new TodoError('This account is unavailable.',403);const old=await scope.meta();if(old&&(!todoContext(old)||![old.activeCount,old.metadataCount,old.totalMetadataCount,old.openedAt].every(Number.isSafeInteger)||old.activeCount<0||old.activeCount>P.activeLimit||old.metadataCount<0||old.totalMetadataCount<old.metadataCount||old.totalMetadataCount>P.metadataLimit))throw new TodoError('Task store requires a separately reviewed migration.',503,null,'MIGRATION_REQUIRED');const m:Meta=old??{protocol:2,incarnation:randomUUID(),generation:1,revision:0,activeCount:0,metadataCount:0,totalMetadataCount:0,openedAt:now};return{m,created:!old}}
function rotate(m:Meta,now:number){if(!Number.isSafeInteger(m.generation+1)||!Number.isSafeInteger(m.revision+1))throw new TodoError('Task store requires review.',503);return{...m,generation:m.generation+1,revision:m.revision+1,metadataCount:0,openedAt:now}}
const stale=(m:Meta)=>({code:'STALE_GENERATION' as const,context:m});
export async function listTodos(store:TodoStore,uid:string,cursor:string|null,now=Date.now()) {assertTodoAccount(uid);if(cursor!==null&&!todoId(cursor))throw new TodoError('Invalid task cursor.');return store.run(uid,async s=>{const{m:old,created}=await authorized(s,now);const expired=now-old.openedAt>=P.generationDays*86400000,m=expired?rotate(old,now):old;const rows=await s.list(cursor,51);if(created||expired)s.setMeta(m);return{items:rows.slice(0,50),nextCursor:rows.length>50?rows[49].id:null,context:m}})}
export async function mutateTodo(store:TodoStore,uid:string,input:unknown,now=Date.now()) {
 assertTodoAccount(uid);const intent=todoIntent(input),hash=createHash('sha256').update(JSON.stringify(intent)).digest('hex');
 const outcome=await store.run(uid,async s=>{const{m,created}=await authorized(s,now);
  if(intent.incarnation!==m.incarnation||intent.generation!==m.generation){if(created)s.setMeta(m);return stale(m)}
  if(now-m.openedAt>=P.generationDays*86400000){const next=rotate(m,now);s.setMeta(next);return stale(next)}
  const receipt=await s.receipt(m.generation,intent.requestId),current=await s.task(intent.id),marker=await s.marker(m.generation,intent.id);
  if(receipt){if(receipt.hash!==hash)throw new TodoError('Request identifier already used for another operation.',409,current);return{record:current??deletedTodo(receipt.id,marker?.version??receipt.version,marker?.deletedAt??receipt.deletedAt??new Date(now).toISOString()),replayed:true,context:m}}
  let record:CloudTodo;const deleting=intent.kind==='delete',cost=deleting?2:1;
  // Fence MUST commit before API returns409 or cleanup removes old metadata.
  if(m.totalMetadataCount+cost>P.metadataLimit){if(m.metadataCount>0){const next=rotate(m,now);s.setMeta(next);return stale(next)}return{code:'CLEANUP_PENDING' as const,context:m}}
  if(intent.kind==='create'||intent.kind==='import'){
   if(current||marker){if(intent.kind==='import'&&current&&JSON.stringify({text:current.text,dueDate:current.dueDate,completed:current.completed})===JSON.stringify(intent.fields)){s.setReceipt(m.generation,intent.requestId,{hash,id:current.id,version:current.version,deletedAt:null,generation:m.generation});s.setMeta({...m,metadataCount:m.metadataCount+1,totalMetadataCount:m.totalMetadataCount+1});return{record:current,replayed:false,context:m}}throw new TodoError('Task exists or was deleted. Compare both copies.',409,current??(marker?deletedTodo(marker.id,marker.version,marker.deletedAt):null))}
   if(!intent.id.startsWith(contextPrefix(m)))throw new TodoError('Older task identifiers require explicit review and a new task.',409,null,'STALE_ID',m);
   if(m.activeCount>=P.activeLimit)throw new TodoError('This account has1000 nondeleted tasks. Delete an unneeded task to free a slot.',409);
   const timestamp=new Date(now).toISOString();record={id:intent.id,...intent.fields!,version:1,createdAt:timestamp,updatedAt:timestamp,deletedAt:null};
  }else{if(!current||current.version!==intent.expectedVersion)throw new TodoError('Task changed. Your pending edit is retained.',409,current??(marker?deletedTodo(marker.id,marker.version,marker.deletedAt):null));record=deleting?deletedTodo(current.id,current.version+1,new Date(now).toISOString()):{...current,...intent.fields!,version:current.version+1,updatedAt:new Date(now).toISOString()}}
  if(!Number.isSafeInteger(m.revision+1))throw new TodoError('Task revision requires review.',503);
  const next={...m,activeCount:m.activeCount+(deleting?-1:current?0:1),metadataCount:m.metadataCount+cost,totalMetadataCount:m.totalMetadataCount+cost,revision:m.revision+1};
  if(deleting){s.deleteTask(intent.id);s.setMarker(m.generation,intent.id,{id:intent.id,version:record.version,deletedAt:record.deletedAt!,generation:m.generation})}else s.setTask(record);
  s.setReceipt(m.generation,intent.requestId,{hash,id:record.id,version:record.version,deletedAt:record.deletedAt,generation:m.generation});s.setMeta(next);return{record,replayed:false,context:next};
 });
 // Review/error conversion occurs outside the committed store transaction.
 if('code'in outcome)throw new TodoError(outcome.code==='STALE_GENERATION'?'Saved task generation changed. Refresh and explicitly review retained edits.':'Metadata cleanup is pending. Retained edits can be retried.',outcome.code==='STALE_GENERATION'?409:503,null,outcome.code,outcome.context);
 return outcome;
}
export type {CloudTodo,TodoContext};
