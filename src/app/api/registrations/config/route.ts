import {NextRequest,NextResponse} from 'next/server';
import {adminDb} from '@/lib/firebase-admin';
import {verifyFirebaseToken} from '@/lib/api-auth';
import {readJsonBodyWithLimit,RequestBodyError} from '@/lib/server-request-guards';
import {getTeamAuthority} from '@/lib/server-team-access';
import {RegistrationInputError,validateRegistrationConfig} from '@/lib/registration-policy';

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
    const parentRef=targetKind==='league'?adminDb.collection('leagues').doc(targetId):adminDb.collection('teams').doc(targetId).collection('events').doc(eventId as string);
    const configRef=parentRef.collection('registration').doc(configId);
    const teamAuthority=targetKind==='tournament'?await getTeamAuthority(targetId,auth.uid,auth.role):null;
    if(targetKind==='tournament'&&!teamAuthority?.isStaff)return fail('Tournament staff access required.',403);
    const normalized=validateRegistrationConfig({...body.config as Record<string,unknown>,form_version:Math.max(1,expectedVersion+1)});
    await adminDb.runTransaction(async transaction=>{
      const [parent,current]=await Promise.all([transaction.get(parentRef),transaction.get(configRef)]);
      if(!parent.exists)throw new RegistrationInputError('Registration target not found.',404);
      if(targetKind==='league'&&auth.role!=='superadmin'&&parent.data()?.creatorId!==auth.uid)throw new RegistrationInputError('League organizer access required.',403);
      if(targetKind==='tournament'){
        const team=await transaction.get(adminDb.collection('teams').doc(targetId));
        const authorityMember=teamAuthority?.member?await transaction.get(teamAuthority.member.ref):null;
        const data=authorityMember?.data();
        const active=auth.role==='superadmin'||team.data()?.ownerUserId===auth.uid||Boolean(authorityMember?.exists&&(data?.userId===auth.uid||(!data?.userId&&authorityMember?.id===auth.uid))&&data?.status!=='removed'&&data?.isDeleted!==true);
        if(!team.exists||parent.data()?.isTournament!==true||!active)throw new RegistrationInputError('Tournament staff access required.',403);
      }
      const currentData=current.data()||{},currentVersion=Number(currentData.form_version||0),currentHash=String(currentData.config_hash||'');
      if(current.exists&&(expectedVersion!==currentVersion||(currentHash ? expectedHash!==currentHash : Boolean(expectedHash))))throw new RegistrationInputError('Registration configuration changed. Reload before saving.',409);
      if(!current.exists&&expectedVersion!==0)throw new RegistrationInputError('Registration configuration changed. Reload before saving.',409);
      transaction.set(configRef,{...normalized,updatedAt:new Date().toISOString(),updatedBy:auth.uid});
    });
    return NextResponse.json({success:true,config:normalized},{headers:{'Cache-Control':'private, no-store'}});
  }catch(error){
    if(error instanceof RegistrationInputError||error instanceof RequestBodyError)return fail(error.message,'status'in error&&typeof error.status==='number'?error.status:400);
    console.error('[registration config] Operation failed.');return fail('Registration configuration could not be saved.',500);
  }
}
