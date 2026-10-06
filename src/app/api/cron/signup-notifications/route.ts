import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { adminDb } from '@/lib/firebase-admin';
import { notifySignup } from '@/lib/server-signup-notification';
export const maxDuration = 60;
export async function GET(req:NextRequest) {
 const expected=process.env.CRON_SECRET;
 const supplied=req.headers.get('authorization')||'';
 const target=`Bearer ${expected}`;
 if(!expected || Buffer.byteLength(supplied)!==Buffer.byteLength(target) || !timingSafeEqual(Buffer.from(supplied),Buffer.from(target)))return NextResponse.json({error:'Unauthorized'},{status:401});
 const cursor=adminDb.collection('systemJobs').doc('signup-notifications');
 const prior=(await cursor.get()).data();
 const since=String(prior?.cursor || '2026-09-22T03:20:00.000Z');
 const started=Date.now();let processed=0;let failed=0;
 const users=await adminDb.collection('users').where('createdAt','>=',since).orderBy('createdAt').limit(200).get();
 for(const user of users.docs){
  if(Date.now()-started>45000)break;
  try{await notifySignup(user.id,'free');processed++;await cursor.set({cursor:user.data().createdAt,updatedAt:new Date().toISOString()});}catch{failed++;break;}
 }
 const retry=await adminDb.collection('adminSignupAlerts').where('emailStatus','in',['failed','pending']).limit(20).get();
 for(const item of retry.docs){if(Date.now()-started>50000)break;const d=item.data();try{await notifySignup(d.userId,d.kind,d.reference,d.test);}catch{failed++;}}
 return NextResponse.json({processed,failed},{status:failed?503:200});
}
