import { createHash } from 'node:crypto';
import { adminDb, getAdminAuth } from '@/lib/firebase-admin';
import { getResend } from '@/lib/server-resend-client';
import { escapeHtml } from '@/lib/html-escape';

export async function notifySignup(uid: string, kind: 'free' | 'paid', reference = '', test = false) {
  const account = await getAdminAuth().getUser(uid).catch(error => { if(error?.code === 'auth/user-not-found')return null;throw error; });
  if (!account || !account.email || account.disabled || !account.providerData.length) return 'ignored';
  const profile = (await adminDb.collection('users').doc(uid).get()).data();
  if (!profile && kind === 'paid') return 'ignored';
  const id = createHash('sha256').update(`${test ? 'test:' : ''}${uid}:${kind}:${reference}`).digest('hex');
  const ref = adminDb.collection('adminSignupAlerts').doc(id);
  if (!test && kind === 'free' && Date.parse(account.metadata.creationTime) < Date.parse('2026-09-22T03:20:00Z') && !(await ref.get()).exists) return 'ignored';
  const title = `${test ? 'TEST — ' : ''}New ${kind === 'paid' ? 'paid subscription' : 'account signup'}`;
  const message = `${account.displayName || 'New member'} (${account.email}) — ${kind === 'paid' ? String(profile?.plan_type || 'Paid plan') : 'Free account created'}.${test ? ' Delivery test only; no account or purchase was created.' : ''}`;
  const recipientConfiguration = (process.env.OWNER_NOTIFICATION_EMAIL || '').trim().toLowerCase();
  const claimed = await adminDb.runTransaction(async tx => {
    const old = (await tx.get(ref)).data();
    if ((old?.emailStatus === 'sent' && old?.recipientConfiguration === recipientConfiguration) || Number(old?.leaseUntil) > Date.now()) return false;
    tx.set(ref, {id, title, message, audience:'everyone', createdBy:'system', createdAt:old?.createdAt || new Date().toISOString(), kind, userId:uid, reference, test, recipientConfiguration, emailStatus:'pending', leaseUntil:Date.now()+60000}, {merge:true});
    return true;
  });
  if (!claimed) return 'already_processed';
  try {
    const admins = await adminDb.collection('users').where('role','==','superadmin').limit(100).get();
    const verified = admins.empty ? [] : (await getAdminAuth().getUsers(admins.docs.map(d=>({uid:d.id})))).users;
    const candidateRecipients = recipientConfiguration ? [await getAdminAuth().getUserByEmail(recipientConfiguration)] : verified;
    const recipients = candidateRecipients.filter(u=>u.customClaims?.role === 'superadmin' && !u.disabled && u.email);
    if (!recipients.length) throw new Error('No verified superadmin email recipient is configured.');
    for (const recipient of recipients) {
      const receipt = ref.collection('deliveries').doc(recipient.uid);
      const previousDelivery = (await receipt.get()).data();
      if (previousDelivery?.sent && previousDelivery?.email === recipient.email) continue;
      const response = await getResend().emails.send({from:'The Squad Pro <noreply@thesquad.pro>',to:[recipient.email!],subject:`The Squad: ${title}`,html:`<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto"><div style="background:#080808;color:white;padding:28px;font-size:28px;font-weight:bold">THE SQUAD.</div><div style="padding:28px"><h1 style="font-size:24px">${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p><a href="https://www.thesquad.pro/admin/signup-alerts" style="display:inline-block;background:#c91b22;color:white;padding:14px 22px;text-decoration:none;border-radius:8px">View signup notifications</a></div></div>`},{idempotencyKey:`signup:${id}:${recipient.uid}:${createHash('sha256').update(recipient.email!).digest('hex').slice(0,16)}`});
      if (response.error || !response.data?.id) throw new Error('Signup email was not accepted by the email provider.');
      await receipt.set({sent:true,email:recipient.email,providerId:response.data.id,sentAt:new Date().toISOString()});
    }
    await ref.update({emailStatus:'sent',leaseUntil:0});
    return 'sent';
  } catch(error) {
    await ref.update({emailStatus:'failed',leaseUntil:0});
    throw error;
  }
}
