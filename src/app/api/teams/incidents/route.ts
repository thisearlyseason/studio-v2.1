import {NextRequest, NextResponse} from 'next/server';
import {getStorage} from 'firebase-admin/storage';
import type {Transaction} from 'firebase-admin/firestore';
import {createHash} from 'node:crypto';
import {adminDb, getAdminStorageBucketName} from '@/lib/firebase-admin';
import {verifyFirebaseToken} from '@/lib/api-auth';
import {getTeamAuthority, isStaffMember} from '@/lib/server-team-access';
import {enforceUserRateLimit} from '@/lib/server-request-guards';
import {readJsonBodyWithLimit, RequestBodyError} from '@/lib/bounded-json';
import {IncidentInputError, INCIDENT_STATUSES, incidentId, validateIncidentInput} from '@/lib/incident-policy';
import {LibraryInputError, LIBRARY_FILE_LIMIT, sanitizeLibraryFilename, validateLibraryBytes} from '@/lib/library-policy';
import {createIncidentPdf, incidentCsv} from '@/lib/incident-export';
import type {TeamIncident} from '@/components/providers/team-provider';

const headers = {'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
const fail = (message:string, status:number) => NextResponse.json({error:message}, {status,headers});
const attachmentPath = (teamId:string, id:string) => `teams/${teamId}/incidents/${id}/attachment`;
const attachmentFile = (teamId:string, id:string) => getStorage().bucket(getAdminStorageBucketName()).file(attachmentPath(teamId,id));
async function context(req:NextRequest) {
  const auth = await verifyFirebaseToken(req); if (auth instanceof NextResponse) return auth;
  const params = new URL(req.url).searchParams, teamId = params.get('teamId');
  if (!incidentId(teamId) || [...params.keys()].some(key => !['teamId','incidentId','download','export','ids'].includes(key) || params.getAll(key).length !== 1)) return fail('Invalid incident request.',400);
  const authority = await getTeamAuthority(teamId,auth.uid,auth.role);
  if (!authority?.isStaff) return fail('Incident unavailable.',403);
  return {auth,params,teamId,authority};
}
type Context = Exclude<Awaited<ReturnType<typeof context>>, NextResponse>;
async function currentAuthority(transaction:Transaction, ctx:Context) {
  const team = await transaction.get(ctx.authority.teamRef);
  const memberRef = ctx.authority.member?.ref || ctx.authority.teamRef.collection('members').doc(ctx.auth.uid);
  const member = await transaction.get(memberRef), data = member.data();
  const belongs = memberRef.path.startsWith(`teams/${ctx.teamId}/members/`) && memberRef.path.split('/').length === 4 && (data?.userId === ctx.auth.uid || (memberRef.id === ctx.auth.uid && !data?.userId));
  if (!team.exists || !(ctx.auth.role === 'superadmin' || team.data()?.ownerUserId === ctx.auth.uid || (belongs && member.exists && data?.status !== 'removed' && data?.isDeleted !== true && isStaffMember(data)))) throw new IncidentInputError('Incident unavailable.',403);
  return team.data()!;
}
function failure(error:unknown) {
  if (error instanceof IncidentInputError || error instanceof LibraryInputError || error instanceof RequestBodyError) return fail(error.message,error.status);
  if (error && typeof error === 'object' && 'code' in error && Number(error.code) === 412) return fail('This report upload is already settling. Retry the same request identity.',409);
  // Never log health narratives, object URLs, tokens or request bodies.
  console.error('[incident] Operation failed.'); return fail('Incident operation failed. Your report has not been confirmed.',500);
}
async function input(req:NextRequest) {
  const normalize = (raw:unknown) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new IncidentInputError('A complete incident report is required.');
    const {requestId,...data} = raw as Record<string,unknown>;
    if (!incidentId(requestId)) throw new IncidentInputError('A bounded requestId is required.');
    return {report:validateIncidentInput(data),requestId};
  };
  if (!req.headers.get('content-type')?.startsWith('multipart/form-data')) return {...normalize(await readJsonBodyWithLimit(req,128*1024)), attachment:null};
  const limit = LIBRARY_FILE_LIMIT + 128*1024;
  if (Number(req.headers.get('content-length')) > limit || !req.body) throw new IncidentInputError('Attachment request exceeds 10 MiB plus report allowance.',413);
  const reader = req.body.getReader(), chunks:Uint8Array[] = []; let total = 0;
  try { while (true) { const next = await reader.read(); if (next.done) break; total += next.value.length; if (total > limit) throw new IncidentInputError('Attachment request is too large.',413); chunks.push(next.value); } }
  catch (error) { await reader.cancel().catch(()=>{}); throw error; } finally { reader.releaseLock(); }
  let form:FormData;
  try { form = await new Request(req.url,{method:'POST',headers:{'Content-Type':req.headers.get('content-type')!},body:Buffer.concat(chunks,total)}).formData(); } catch { throw new IncidentInputError('Invalid supporting attachment request.'); }
  if ([...form.keys()].some(key=>!['report','attachment'].includes(key) || form.getAll(key).length !== 1)) throw new IncidentInputError('Invalid attachment field.');
  let raw:unknown; try { raw = JSON.parse(String(form.get('report'))); } catch { throw new IncidentInputError('Invalid incident report.'); }
  const normalized = normalize(raw), file = form.get('attachment');
  if (!file || typeof file === 'string' || file.size > LIBRARY_FILE_LIMIT) throw new IncidentInputError('A supporting file up to 10 MiB is required.',413);
  const bytes = Buffer.from(await file.arrayBuffer()); validateLibraryBytes(bytes,file.type);
  return {...normalized,attachment:{bytes,name:sanitizeLibraryFilename(file.name),contentType:file.type}};
}

function canonical(value:unknown):unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,canonical(item)]));
  return value;
}

export async function POST(req:NextRequest) {
  try {
    const ctx = await context(req); if (ctx instanceof NextResponse) return ctx;
    const limited = await enforceUserRateLimit(ctx.auth.uid,'incident-create',30,300000); if (limited) return limited;
    const {report,attachment,requestId} = await input(req);
    const eventRef = report.eventKind === 'team' ? ctx.authority.teamRef.collection('events').doc(report.eventId) : adminDb.collection(report.eventKind === 'league' ? 'leagues' : 'tournaments').doc(report.eventId);
    const key = createHash('sha256').update(`${ctx.teamId}:${ctx.auth.uid}:${requestId}`).digest('hex');
    const payloadHash = createHash('sha256').update(JSON.stringify(canonical({report,attachment:attachment?{name:attachment.name,contentType:attachment.contentType,hash:createHash('sha256').update(attachment.bytes).digest('hex')}:null}))).digest('hex');
    const ref = ctx.authority.teamRef.collection('incidents').doc('incident_'+key), file = attachmentFile(ctx.teamId,ref.id);
    const replay = await adminDb.runTransaction(async transaction => {
      await currentAuthority(transaction,ctx); const previous = await transaction.get(ref);
      if (previous.exists && previous.data()?.payloadHash !== payloadHash) throw new IncidentInputError('Request identity already belongs to different report facts.',409);
      return previous.exists;
    });
    if (replay) return NextResponse.json({incidentId:ref.id},{headers});
    const createdAt = new Date().toISOString(); let uploaded = false, created = false;
    const reporter = (await adminDb.collection('users').doc(ctx.auth.uid).get()).data();
    try {
      if (attachment) {
        await file.save(attachment.bytes,{resumable:false,preconditionOpts:{ifGenerationMatch:0},metadata:{contentType:attachment.contentType,cacheControl:'private, no-store'}}); uploaded = true;
        const [metadata] = await file.getMetadata();
        if (metadata.metadata?.firebaseStorageDownloadTokens || Number(metadata.size) !== attachment.bytes.length) throw new IncidentInputError('Attachment privacy verification failed.',503);
      }
      await adminDb.runTransaction(async transaction => {
        const team = await currentAuthority(transaction,ctx), event = await transaction.get(eventRef), previous = await transaction.get(ref);
        if (previous.exists) {if (previous.data()?.payloadHash !== payloadHash) throw new IncidentInputError('Request identity collision.',409);return;}
        if (!event.exists || (report.eventKind !== 'team' && event.data()?.creatorId !== team.ownerUserId && event.data()?.ownerUserId !== team.ownerUserId)) throw new IncidentInputError('Select an event belonging to this team.');
        created = true; transaction.create(ref,{...report,payloadHash,teamId:ctx.teamId,teamName:team.name || '',ownerUserId:team.ownerUserId,reportedBy:ctx.auth.uid,reportedByName:String(reporter?.name || ctx.auth.uid).slice(0,200),createdAt,eventName:String(event.data()?.title || event.data()?.name || report.eventId).slice(0,500),...(report.eventKind === 'league'?{leagueId:report.eventId}:report.eventKind === 'tournament'?{tournamentId:report.eventId}:{}),auditHistory:[{action:'created',userId:ctx.auth.uid,at:createdAt}],...(report.status === 'resolved'?{resolvedBy:ctx.auth.uid,resolvedAt:createdAt}:{}),...(attachment?{attachment:{storagePath:attachmentPath(ctx.teamId,ref.id),name:attachment.name,contentType:attachment.contentType,sizeBytes:attachment.bytes.length,sha256:createHash('sha256').update(attachment.bytes).digest('hex')}}:{})});
      });
    } catch (error) {
      // A lost commit acknowledgement is not proof of rollback. Never remove
      // the object of an already committed identical report. If reconciliation
      // itself fails, retain the private object and report failure for retry.
      if (uploaded && (await ref.get()).data()?.payloadHash !== payloadHash) await file.delete({ignoreNotFound:true});
      throw error;
    }
    return NextResponse.json({incidentId:ref.id},{status:created?201:200,headers});
  } catch (error) { return failure(error); }
}
export async function PATCH(req:NextRequest) {
  try {
    const ctx = await context(req); if (ctx instanceof NextResponse) return ctx;
    const id = ctx.params.get('incidentId'), body = await readJsonBodyWithLimit<Record<string,unknown>>(req,1024);
    if (!incidentId(id) || !body || Object.keys(body).length !== 1 || !INCIDENT_STATUSES.includes(body.status as typeof INCIDENT_STATUSES[number])) throw new IncidentInputError('Only a valid status transition is permitted.');
    const ref = ctx.authority.teamRef.collection('incidents').doc(id);
    await adminDb.runTransaction(async transaction => {
      await currentAuthority(transaction,ctx); const snapshot = await transaction.get(ref), record = snapshot.data();
      if (!record) throw new IncidentInputError('Incident unavailable.',404);
      if (record.status === 'resolved' || (record.status || 'open') === body.status) throw new IncidentInputError('Incident status transition is not available.',409);
      const audit = record.auditHistory || []; if (!Array.isArray(audit) || audit.length >= 100) throw new IncidentInputError('Incident audit limit reached.',409);
      const at = new Date().toISOString();
      transaction.update(ref,{status:body.status,updatedAt:at,updatedBy:ctx.auth.uid,auditHistory:[...audit,{action:`status:${body.status}`,userId:ctx.auth.uid,at}],...(body.status === 'resolved'?{resolvedAt:at,resolvedBy:ctx.auth.uid}:{})});
    }); return NextResponse.json({ok:true},{headers});
  } catch (error) { return failure(error); }
}
export async function GET(req:NextRequest) {
  try {
    const ctx = await context(req); if (ctx instanceof NextResponse) return ctx;
    const id = ctx.params.get('incidentId');
    if (id !== null && !incidentId(id)) throw new IncidentInputError('Invalid incident.');
    if (id) {
      const snapshot = await adminDb.runTransaction(async transaction => {await currentAuthority(transaction,ctx);return transaction.get(ctx.authority.teamRef.collection('incidents').doc(id));}), record = snapshot.data();
      if (!record) throw new IncidentInputError('Incident unavailable.',404);
      if (ctx.params.get('download') === 'attachment') {
        if (record.attachmentDeletedAt || record.attachment?.storagePath !== attachmentPath(ctx.teamId,id)) throw new IncidentInputError('Attachment unavailable.',404);
        const file = attachmentFile(ctx.teamId,id); if (!(await file.exists())[0]) throw new IncidentInputError('Attachment unavailable.',404);
        const [metadata] = await file.getMetadata(); if (Number(metadata.size) > LIBRARY_FILE_LIMIT || metadata.metadata?.firebaseStorageDownloadTokens) throw new IncidentInputError('Attachment unavailable.',404);
        const [bytes] = await file.download(); validateLibraryBytes(bytes,record.attachment.contentType);
        if (createHash('sha256').update(bytes).digest('hex') !== record.attachment.sha256) throw new IncidentInputError('Attachment integrity check failed.',503);
        await adminDb.runTransaction(async transaction => {
          await currentAuthority(transaction,ctx); const current = (await transaction.get(snapshot.ref)).data();
          if (!current || current.attachmentDeletedAt || current.attachment?.sha256 !== record.attachment.sha256) throw new IncidentInputError('Attachment unavailable.',404);
        });
        return new NextResponse(new Uint8Array(bytes),{headers:{...headers,'Content-Type':record.attachment.contentType,'Content-Length':String(bytes.length),'Content-Disposition':`attachment; filename="${sanitizeLibraryFilename(record.attachment.name)}"`}});
      }
      if (ctx.params.has('export')) return exportResponse([{...record,id} as TeamIncident],ctx.params.get('export'));
      return NextResponse.json({incident:{...record,id}},{headers});
    }
    const snapshot = await adminDb.runTransaction(async transaction => {await currentAuthority(transaction,ctx);return transaction.get(ctx.authority.teamRef.collection('incidents').orderBy('date','desc').limit(501));});
    if (snapshot.size > 500) throw new IncidentInputError('Narrow the incident ledger before exporting more than 500 reports.',413);
    const ids = ctx.params.get('ids')?.split(',');
    if (ids && (ids.length > 100 || ids.some(id=>!incidentId(id)))) throw new IncidentInputError('Invalid incident selection.');
    const incidents = snapshot.docs.filter(doc=>!ids || ids.includes(doc.id)).map(doc=>({...doc.data(),id:doc.id} as TeamIncident));
    if (ctx.params.has('export')) return exportResponse(incidents,ctx.params.get('export'));
    return NextResponse.json({incidents},{headers});
  } catch (error) { return failure(error); }
}
function exportResponse(records:TeamIncident[],format:string|null) {
  if (format !== 'pdf' && format !== 'csv') throw new IncidentInputError('Invalid incident export.');
  const name = records.length === 1 ? 'INCIDENT_REPORT_'+records[0].id.replace(/[^A-Za-z0-9_-]/g,'_') : 'SAFETY_LEDGER';
  const body = format === 'pdf' ? new Uint8Array(createIncidentPdf(records).output('arraybuffer')) : incidentCsv(records);
  return new NextResponse(body,{headers:{...headers,'Content-Type':format === 'pdf'?'application/pdf':'text/csv;charset=utf-8','Content-Disposition':`attachment; filename="${name}.${format}"`}});
}
export async function DELETE(req:NextRequest) {
  try {
    const ctx = await context(req); if (ctx instanceof NextResponse) return ctx;
    const id = ctx.params.get('incidentId');
    if (!incidentId(id) || ctx.params.get('download') !== 'attachment') return fail('Original incidents cannot be deleted.',403);
    const ref = ctx.authority.teamRef.collection('incidents').doc(id);
    // Mark unavailable transactionally first. A failed object delete is retryable;
    // the protected read stays revoked, while original metadata remains audited.
    await adminDb.runTransaction(async transaction => {
      await currentAuthority(transaction,ctx); const snapshot = await transaction.get(ref), record = snapshot.data();
      if (!record || record.attachment?.storagePath !== attachmentPath(ctx.teamId,id)) throw new IncidentInputError('Attachment unavailable.',404);
      if (record.attachmentDeletedAt) return;
      const audit = record.auditHistory || []; if (!Array.isArray(audit) || audit.length >= 100) throw new IncidentInputError('Incident audit limit reached.',409);
      const at = new Date().toISOString(); transaction.update(ref,{attachmentDeletedAt:at,auditHistory:[...audit,{action:'attachment:deleted',userId:ctx.auth.uid,at}]});
    });
    await attachmentFile(ctx.teamId,id).delete({ignoreNotFound:true}); return NextResponse.json({ok:true},{headers});
  } catch (error) { return failure(error); }
}
