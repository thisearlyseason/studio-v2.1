import {NextRequest,NextResponse}from'next/server';
import {TodoError,type TodoContext}from'./model';
import {listTodos,mutateTodo}from'./service';
import {readJsonBodyWithLimit,RequestBodyError}from'@/lib/bounded-json';
const privateResponse=(response:NextResponse)=>{response.headers.set('Cache-Control','private, no-store');response.headers.set('X-Robots-Tag','noindex');return response;};
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Robots-Tag':'noindex','X-Content-Type-Options':'nosniff'}});
export async function todoHTTP(req:NextRequest,id?:string){
 if(process.env.SCHEDULE_TODOS_SYNC_ENABLED!=='true')return json({error:'Not found.'},404);
 try{
  const {verifyFirebaseToken,assertNonAnonymous}=await import('@/lib/api-auth');const actor=await verifyFirebaseToken(req);if(actor instanceof NextResponse)return privateResponse(actor);const denied=assertNonAnonymous(actor);if(denied)return privateResponse(denied);
  if(req.headers.get('x-squad-todo-protocol')!=='2')throw new TodoError('Refresh and review older task requests before retrying.',426,null,'PROTOCOL_REQUIRED');
  const {enforceUserRateLimit}=await import('@/lib/server-request-guards');const limited=await enforceUserRateLimit(actor.uid,'schedule-todos',120,60000);if(limited)return privateResponse(limited);
  const {scheduleTodoStore}=await import('./store');const store=await scheduleTodoStore();
  const clean=async(context:TodoContext)=>{try{await store.cleanup?.(actor.uid,context)}catch{/* Fence remains committed. Retry on a later authenticated request. */}};
  if(req.method==='GET'){if([...req.nextUrl.searchParams.keys()].some(k=>k!=='cursor'))throw new TodoError('Only a task cursor is allowed.');const result=await listTodos(store,actor.uid,req.nextUrl.searchParams.get('cursor'));await clean(result.context);return json(result);}
  const body=await readJsonBodyWithLimit<Record<string,unknown>>(req,4096);if(id){if(body.id!==undefined&&body.id!==id)throw new TodoError('Task identifier mismatch.');const expected=req.method==='DELETE'?'delete':'update';if(body.kind!==undefined&&body.kind!==expected)throw new TodoError('Task operation mismatch.');return json(await mutateTodo(store,actor.uid,{...body,id,kind:expected}));}
  if(!['create','import'].includes(String(body.kind)))throw new TodoError('Use a create or explicitly confirmed import operation.');return json(await mutateTodo(store,actor.uid,body));
 }catch(error){if(error instanceof TodoError)return json({error:error.message,current:error.current,code:error.code,context:error.context},error.status);if(error instanceof RequestBodyError)return json({error:error.message},error.status);return json({error:'Task synchronization is unavailable. Pending edits are retained.'},503);}
}
