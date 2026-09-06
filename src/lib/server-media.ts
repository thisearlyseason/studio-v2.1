import {NextRequest,NextResponse} from 'next/server';
import {adminDb,getAdminAuth} from '@/lib/firebase-admin';
import {verifyFirebaseToken,type DecodedToken} from '@/lib/api-auth';
import {isAccountAccessBlocked} from '@/lib/account-access-policy';
import {MediaInputError,type MediaTarget} from '@/lib/media-policy';

export const mediaHeaders={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
export async function mediaActor(req:NextRequest,mutation=false):Promise<DecodedToken|NextResponse|null>{
  if(mutation||req.headers.has('authorization')){
    const actor=await verifyFirebaseToken(req);
    if(actor instanceof NextResponse)return actor;
    if(actor.signInProvider==='anonymous')return NextResponse.json({error:'Registered account required.'},{status:403,headers:mediaHeaders});
    return actor;
  }
  const cookie=req.cookies?.get('__session')?.value;
  if(!cookie)return null;
  try{
    const decoded=await getAdminAuth().verifySessionCookie(cookie,true);
    const profile=await adminDb.doc(`users/${decoded.uid}`).get();
    if(decoded.firebase?.sign_in_provider==='anonymous'||(decoded.email_verified!==true&&decoded.role!=='superadmin')||!profile.exists||isAccountAccessBlocked(profile.data()))return NextResponse.json({error:'Media unavailable.'},{status:403,headers:mediaHeaders});
    return{uid:decoded.uid,role:decoded.role,emailVerified:decoded.email_verified};
  }catch{return NextResponse.json({error:'Media session expired.'},{status:401,headers:mediaHeaders});}
}
export async function mediaAuthorityState(target:MediaTarget){
  if(target.kind==='user')return{};
  if(target.kind==='team')return{team:(await adminDb.doc(`teams/${target.subjectId}`).get()).data()};
  const player=(await adminDb.doc(`players/${target.subjectId}`).get()).data();
  const teamId=player?.primaryTeamId||player?.teamId;
  const team=typeof teamId==='string'&&/^[A-Za-z0-9_-]{1,200}$/.test(teamId)?(await adminDb.doc(`teams/${teamId}`).get()).data():undefined;
  return{player,team};
}
export function mediaFailure(error:unknown){
  const status=error instanceof MediaInputError?error.status:500;
  if(status===500)console.error('[media] operation failed',error instanceof Error?error.name:'unknown');
  return NextResponse.json({error:status===500?'Media operation failed.':(error as Error).message},{status,headers:mediaHeaders});
}
