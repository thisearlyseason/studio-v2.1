import { randomUUID } from 'node:crypto';
import { isApprovedLocalMailSink } from '@/lib/server-outbound-provider-policy';
import { adminDb } from '@/lib/firebase-admin';
const contacts = new Map<string, Record<string, unknown>>();
function synthetic(email: unknown) { if (typeof email !== 'string' || !/@[^@\s]+\.test$/i.test(email)) throw new Error('Diagnostic sink refuses non-synthetic recipient.'); return email; }
async function store(message: Record<string, unknown>, _options?:unknown) { const values = Array.isArray(message.to) ? message.to : [message.to]; const recipients = values.map(synthetic); if (!recipients.length) throw new Error('No synthetic recipients'); if(typeof message.subject==='string'&&message.subject.startsWith('AUDIT_FAIL_LOCAL_'))return {data:null,error:{message:'Injected diagnostic transport failure'}}; const id='local-sink-'+randomUUID(); await adminDb.collection('auditMailOutbox').doc(id).set({...message,to:recipients,id,transport:'local-diagnostic-memory-sink',externalDelivery:false,createdAt:new Date().toISOString()}); return {data:{id},error:null}; }
export function getResend() {
 if (!isApprovedLocalMailSink() || process.env.AUDIT_DIAGNOSTIC_MAIL_ADAPTER !== '1') throw new Error('Diagnostic mail adapter requires the isolated demo emulator sink.');
 return {
  emails:{send:store},
  batch:{async send(messages:Record<string,unknown>[]) { const rows=await Promise.all(messages.map(store));const failed=rows.find(x=>x.error);if(failed)return {data:null,error:failed.error};return {data:{data:rows.map(x=>x.data)},error:null};}},
  segments:{async list(){return {data:{data:[{id:'local-diagnostic-newsletter-segment',name:'The Squad Newsletter'}]},error:null}},async create(){return {data:{id:'local-diagnostic-newsletter-segment'},error:null}}},
  contacts:{async list(){return {data:{data:[...contacts.entries()].map(([id,x])=>({id,...x})),has_more:false},error:null}},async remove(value:Record<string,unknown>){for(const[id,x]of contacts)if(x.email===value.email)contacts.delete(id);return {data:{id:'local-contact'},error:null}},async create(value:Record<string,unknown>){const email=synthetic(value.email),id='local-contact-'+randomUUID();contacts.set(id,{...value,email});return {data:{id},error:null}},async update(value:Record<string,unknown>){for(const[id,x]of contacts)if(x.email===value.email)contacts.set(id,{...x,...value});return {data:{id:value.id||'local-contact'},error:null}},segments:{async add(){return {data:{id:'local-diagnostic-newsletter-segment'},error:null}}}},
  broadcasts:{async create(value:Record<string,unknown>){const recipients=[...contacts.values()].filter(x=>x.unsubscribed!==true).map(x=>synthetic(x.email));const result=await store({...value,to:recipients,kind:'newsletter-broadcast'});return result}}
 };
}
