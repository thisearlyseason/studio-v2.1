import {NextRequest,NextResponse} from 'next/server';
import {FieldValue,type Transaction} from 'firebase-admin/firestore';
import {adminDb} from '@/lib/firebase-admin';
import {verifyFirebaseToken} from '@/lib/api-auth';
import {readJsonBodyWithLimit,RequestBodyError} from '@/lib/server-request-guards';
import {RegistrationInputError,validateRegistrationConfig} from '@/lib/registration-policy';
import {hashTournamentScorekeeperCode} from '@/lib/server-competition-credential';
import {resolveCompetitionAuthority} from '@/lib/server-competition-authority';
import {canonicalCompetitionRequest,runCompetitionOperation} from '@/lib/server-competition-operation';

const id=(value:unknown):value is string=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,200}$/.test(value);
const fail=(error:string,status:number)=>NextResponse.json({error},{status,headers:{'Cache-Control':'private, no-store'}});

export async function POST(req:NextRequest){
  try{
    const auth=await verifyFirebaseToken(req);if(auth instanceof NextResponse)return auth;
    const body=await readJsonBodyWithLimit<Record<string,unknown>>(req,128*1024);
    const targetKind=body.targetKind,targetId=body.targetId,eventId=body.eventId,configId=body.configId;
    if(!['league','tournament'].includes(String(targetKind))||!id(targetId)||!id(configId)||(targetKind==='tournament'&&!id(eventId)))return fail('Invalid registration configuration target.',400);
    const expectedVersion=Number(body.expectedVersion);if(!Number.isInteger(expectedVersion)||expectedVersion<0)return fail('A valid expected version is required.',400);
    const expectedHash=typeof body.expectedHash==='string'?body.expectedHash:'';
    const scoringCode=typeof body.scoringCode==='string'?body.scoringCode.trim():undefined;
    if(targetKind==='tournament'&&scoringCode!==undefined&&(scoringCode.length<4||scoringCode.length>128))return fail('Scorekeeper code must contain 4 to 128 characters.',400);
    const scoringCodeHash=targetKind==='tournament'&&scoringCode!==undefined?hashTournamentScorekeeperCode(targetId as string,eventId as string,scoringCode):undefined;
    const expectedLifecycleVersion=Number(body.expectedLifecycleVersion),expectedCredentialVersion=Number(body.expectedCredentialVersion);
    if(scoringCodeHash&&(!Number.isInteger(expectedLifecycleVersion)||expectedLifecycleVersion<0||!Number.isInteger(expectedCredentialVersion)||expectedCredentialVersion<0))return fail('Valid Tournament lifecycle and credential versions are required.',400);
    const parentRef=targetKind==='league'?adminDb.collection('leagues').doc(targetId):adminDb.collection('teams').doc(targetId).collection('events').doc(eventId as string);
    const configRef=parentRef.collection('registration').doc(configId);
    const credentialRef=targetKind==='tournament'?parentRef.collection('private').doc('scoring'):null;
    const registrationConfig={...(body.config as Record<string,unknown>)};
    delete registrationConfig.scoringCode;
    const normalized=validateRegistrationConfig({...registrationConfig,...(targetKind==='league'?{payment_migrated:true}:{}),form_version:Math.max(1,expectedVersion+1)});
    const mutate=async(transaction:Transaction,authorityAlreadyChecked=false)=>{
      if(targetKind==='tournament'&&!authorityAlreadyChecked)await resolveCompetitionAuthority({transaction,actorUid:auth.uid,actorRole:auth.role,teamId:targetId,domain:'tournament'});
      const [parent,current,credential]=await Promise.all([transaction.get(parentRef),transaction.get(configRef),...(credentialRef&&scoringCodeHash?[transaction.get(credentialRef)]:[])]);
      if(!parent.exists)throw new RegistrationInputError('Registration target not found.',404);
      if(targetKind==='tournament'&&parent.data()?.isArchived===true)throw new RegistrationInputError('Archived Tournament registration cannot be reactivated.',409);
      if(targetKind==='league'&&auth.role!=='superadmin'&&parent.data()?.creatorId!==auth.uid)throw new RegistrationInputError('League organizer access required.',403);
      if(targetKind==='tournament'&&parent.data()?.isTournament!==true)throw new RegistrationInputError('Tournament staff access required.',403);
      const currentData=current.data()||{},currentVersion=Number(currentData.form_version||0),currentHash=String(currentData.config_hash||'');
      if(current.exists&&(expectedVersion!==currentVersion||(currentHash ? expectedHash!==currentHash : Boolean(expectedHash))))throw new RegistrationInputError('Registration configuration changed. Reload before saving.',409);
      if(!current.exists&&expectedVersion!==0)throw new RegistrationInputError('Registration configuration changed. Reload before saving.',409);
      let credentialVersion:number|undefined;
      if(targetKind==='tournament'&&scoringCodeHash&&credentialRef){
        const lifecycleVersion=Number(parent.data()?.lifecycleVersion||0),eventCredentialVersion=Number(parent.data()?.credentialVersion||0),privateCredentialVersion=Number(credential?.data()?.credentialVersion||0);
        if(lifecycleVersion!==expectedLifecycleVersion)throw new RegistrationInputError('Tournament changed. Reload before saving registration settings.',409);
        if(eventCredentialVersion!==privateCredentialVersion||privateCredentialVersion!==expectedCredentialVersion)throw new RegistrationInputError('Scorekeeper credential changed. Reload before saving registration settings.',409);
        credentialVersion=privateCredentialVersion+1;
      }
      transaction.set(configRef,{...normalized,updatedAt:new Date().toISOString(),updatedBy:auth.uid});
      if(targetKind==='tournament'&&scoringCodeHash&&credentialRef&&credentialVersion!==undefined){
        transaction.set(credentialRef,{teamId:targetId,eventId,scorekeeperCodeHash:scoringCodeHash,credentialVersion,updatedAt:new Date().toISOString(),updatedBy:auth.uid});
        transaction.update(parentRef,{credentialVersion,scorekeeperConfigured:true,scoringCode:FieldValue.delete(),scoringCodeHash:FieldValue.delete()});
      }
      return {success:true,config:normalized,...(credentialVersion===undefined?{}:{lifecycleVersion:expectedLifecycleVersion,credentialVersion})};
    };
    const result=scoringCodeHash
      ?await runCompetitionOperation({
        db:adminDb,
        actorUid:auth.uid,
        identity:canonicalCompetitionRequest({requestId:String(body.requestId||''),tenantId:targetId,kind:'tournament-registration-credential',payload:body}),
        authorizeTransaction:transaction=>resolveCompetitionAuthority({transaction,actorUid:auth.uid,actorRole:auth.role,teamId:targetId,domain:'tournament'}).then(()=>undefined),
      },({transaction})=>mutate(transaction,true))
      :await adminDb.runTransaction(mutate);
    return NextResponse.json(result,{headers:{'Cache-Control':'private, no-store'}});
  }catch(error){
    if(error instanceof RegistrationInputError||error instanceof RequestBodyError)return fail(error.message,'status'in error&&typeof error.status==='number'?error.status:400);
    const message=error instanceof Error?error.message:'';
    if(message.startsWith('Forbidden competition'))return fail('Tournament staff access required.',403);
    if(message==='Request collision.')return fail(message,409);
    if(message.startsWith('Invalid competition'))return fail(message,400);
    console.error('[registration config] Operation failed.');return fail('Registration configuration could not be saved.',500);
  }
}
