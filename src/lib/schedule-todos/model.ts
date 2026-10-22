export type TodoFields = { text: string; dueDate: string; completed: boolean };
export type CloudTodo = TodoFields & { id: string; version: number; createdAt: string; updatedAt: string; deletedAt: string | null };
export type TodoContext = { protocol: 2; incarnation: string; generation: number; revision: number };
export type TodoIntent = { protocol: 2; incarnation: string; generation: number; requestId: string; id: string; kind: 'create' | 'update' | 'delete' | 'import'; expectedVersion: number; fields?: TodoFields; importConfirmed?: true };
export class TodoError extends Error { constructor(message: string, public status = 400, public current: CloudTodo | null = null, public code = 'TASK_ERROR', public context?: TodoContext) { super(message); } }
export const todoId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
export function todoFields(input: unknown): TodoFields {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TodoError('Task fields are required.');
  const v=input as Record<string, unknown>;
  if (Object.keys(v).some(k=>!['text','dueDate','completed'].includes(k)) || typeof v.text !== 'string' || !v.text.trim() || v.text.length>500 || /[\u0000-\u001f]/.test(v.text) || typeof v.completed !== 'boolean' || typeof v.dueDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v.dueDate)) throw new TodoError('Use valid task text, date and completion state.');
  const date=new Date(v.dueDate+'T00:00:00Z');if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10)!==v.dueDate) throw new TodoError('Use a valid task date.');
  return {text:v.text.trim(),dueDate:v.dueDate,completed:v.completed};
}
export function todoIntent(input: unknown): TodoIntent {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TodoError('Task operation is required.');const v=input as Record<string,unknown>;
  if(v.protocol!==2||typeof v.incarnation!=='string'||!/^[-a-f0-9]{36}$/.test(v.incarnation)||!Number.isSafeInteger(v.generation)||Number(v.generation)<1)throw new TodoError('Refresh and explicitly review this older task request.',426,null,'PROTOCOL_REQUIRED');
  if (Object.keys(v).some(k=>!['protocol','incarnation','generation','requestId','id','kind','expectedVersion','fields','importConfirmed'].includes(k)) || !todoId(v.id) || !todoId(v.requestId) || String(v.requestId).length<8 || !['create','update','delete','import'].includes(String(v.kind)) || !Number.isSafeInteger(v.expectedVersion) || Number(v.expectedVersion)<0) throw new TodoError('Use a valid task operation and version.');
  const kind=v.kind as TodoIntent['kind'];if ((kind==='create'||kind==='import')&&v.expectedVersion!==0 || kind==='delete'&&v.fields!==undefined || kind==='import'&&v.importConfirmed!==true || kind!=='import'&&v.importConfirmed!==undefined) throw new TodoError('Import needs explicit confirmation; task versions must be current.');
  return {protocol:2,incarnation:String(v.incarnation),generation:Number(v.generation),requestId:String(v.requestId),id:String(v.id),kind,expectedVersion:Number(v.expectedVersion),...(kind!=='delete'?{fields:todoFields(v.fields)}:{}),...(kind==='import'?{importConfirmed:true as const}:{})};
}
export function cloudTodo(input: unknown): input is CloudTodo { if (!input || typeof input!=='object') return false;const v=input as CloudTodo;try{if(v.deletedAt!==null)return todoId(v.id)&&Number.isSafeInteger(v.version)&&v.version>0&&typeof v.deletedAt==='string'&&Number.isFinite(Date.parse(v.deletedAt))&&v.text===''&&v.completed===true;todoFields({text:v.text,dueDate:v.dueDate,completed:v.completed});return todoId(v.id)&&Number.isSafeInteger(v.version)&&v.version>0&&typeof v.createdAt==='string'&&typeof v.updatedAt==='string'&&(v.deletedAt===null||typeof v.deletedAt==='string');}catch{return false;} }

export function todoContext(input: unknown): input is TodoContext { if(!input||typeof input!=='object')return false;const c=input as TodoContext;return c.protocol===2&&typeof c.incarnation==='string'&&/^[-a-f0-9]{36}$/.test(c.incarnation)&&Number.isSafeInteger(c.generation)&&c.generation>0&&Number.isSafeInteger(c.revision)&&c.revision>=0; }
export function contextPrefix(c:Pick<TodoContext,'incarnation'|'generation'>){return 'i'+c.incarnation+'_g'+c.generation+'_';}
export function deletedTodo(id:string,version:number,deletedAt:string):CloudTodo{return{id,version,deletedAt,text:'',dueDate:'1970-01-01',completed:true,createdAt:deletedAt,updatedAt:deletedAt};}
