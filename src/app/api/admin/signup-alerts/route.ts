import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import { notifySignup } from '@/lib/server-signup-notification';
export async function GET(req:NextRequest) {
 const auth=await verifyFirebaseToken(req); if(auth instanceof NextResponse)return auth;
 if(auth.role!=='superadmin')return NextResponse.json({error:'Superadmin access required.'},{status:403});
 const docs=await adminDb.collection('adminSignupAlerts').orderBy('createdAt','desc').limit(100).get();
 return NextResponse.json({alerts:docs.docs.map(d=>({id:d.id,...d.data()}))},{headers:{'Cache-Control':'private, no-store'}});
}
export async function POST(req:NextRequest) {
 const auth=await verifyFirebaseToken(req,{allowUnverifiedEmail:true}); if(auth instanceof NextResponse)return auth;
 if(auth.signInProvider==='anonymous')return NextResponse.json({error:'Registered account required.'},{status:403});
 try {
  if(new URL(req.url).searchParams.get('test')==='true') {
   if(auth.role!=='superadmin')return NextResponse.json({error:'Superadmin access required.'},{status:403});
   const day=new Date().toISOString().slice(0,10);
   await notifySignup(auth.uid,'free',day,true);await notifySignup(auth.uid,'paid',day,true);
  } else if (new URL(req.url).searchParams.get('retry') === 'true') {
   if(auth.role!=='superadmin')return NextResponse.json({error:'Superadmin access required.'},{status:403});
   const pending=await adminDb.collection('adminSignupAlerts').where('emailStatus','in',['failed','pending']).limit(20).get();
   for(const doc of pending.docs){const d=doc.data();await notifySignup(d.userId,d.kind,d.reference,d.test);}
  } else await notifySignup(auth.uid,'free');
  return NextResponse.json({ok:true});
 } catch { return NextResponse.json({error:'Email delivery failed. Your signup is saved. Retry notification delivery.'},{status:503}); }
}
