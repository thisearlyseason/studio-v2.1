import { randomUUID } from 'node:crypto';
import { adminDb } from '@/lib/firebase-admin';
import { eventNotificationEmail } from '@/lib/email-templates';
import { shouldDispatchTeamOutbound } from '@/lib/client-team-notification';
import { isActiveTeamMembership } from '@/lib/team-membership-security';
import { sendNotificationToUsers } from '@/lib/server-notification-delivery';
import { getResend } from '@/lib/server-resend-client';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CLAIM_MS = 5 * 60 * 1000;

/** Deliver only the durable Tournament-created effect after its lifecycle commits. */
export async function deliverTournamentCreatedNotification(operationId: string): Promise<string> {
  const effects = await adminDb.collection('competitionOperationOutbox').where('operationId', '==', operationId).get();
  const effect = effects.docs.find(doc => doc.data().kind === 'tournament-created-notification');
  if (!effect) return 'not_requested';
  const claimId = randomUUID();
  const claim = await adminDb.runTransaction(async transaction => {
    const current = await transaction.get(effect.ref);
    const data = current.data() || {};
    if (data.status === 'delivered' || data.status === 'suppressed') return { status: data.status as string };
    if (data.status === 'delivering' && Number(data.claimExpiresAt) > Date.now()) return { status: 'delivering' };
    const teamRef = adminDb.collection('teams').doc(data.payload.teamId);
    const team = await transaction.get(teamRef);
    if (!team.exists || !shouldDispatchTeamOutbound(team.data() || {})) {
      transaction.update(effect.ref, { status: 'suppressed', updatedAt: new Date().toISOString() });
      return { status: 'suppressed' };
    }
    const members = await transaction.get(teamRef.collection('members'));
    const recipients = [...new Map(members.docs.flatMap(doc => {
      const member = doc.data();
      const userId = typeof member.userId === 'string' ? member.userId.trim() : '';
      if (!isActiveTeamMembership(member) || !userId || userId.length > 128 || userId === data.payload.actorUid) return [];
      const email = typeof member.email === 'string' ? member.email.trim().toLowerCase() : '';
      return [[userId, { userId, email: EMAIL.test(email) ? email : '' }] as const];
    })).values()];
    transaction.update(effect.ref, { status: 'delivering', claimId, claimExpiresAt: Date.now() + CLAIM_MS, attempts: Number(data.attempts || 0) + 1, updatedAt: new Date().toISOString() });
    return { status: 'claimed', data, recipients, teamName: String(team.data()?.name || 'Your Squad') };
  });
  if (!claim.data || !claim.recipients || claim.teamName === undefined) return claim.status;
  const checkpoint = async (updates: Record<string, unknown>) => {
    await adminDb.runTransaction(async transaction => {
      const current = await transaction.get(effect.ref);
      if (current.data()?.claimId !== claimId || current.data()?.status !== 'delivering') throw new Error('Notification delivery claim changed.');
      transaction.update(effect.ref, { ...updates, updatedAt: new Date().toISOString() });
    });
  };
  try {
    const payload = claim.data.payload;
    const event = payload.event;
    const title = `📅 Event: ${String(event.title)}`;
    const body = `${event.date}${event.startTime ? ` at ${event.startTime}` : ''}${event.location ? ` · ${event.location}` : ''}`;
    if (claim.data.pushAttempted !== true && claim.data.pushDelivered !== true) {
      // Push is best-effort, at-most-once per effect: persist before dispatch so
      // partial success or ambiguous provider failure cannot duplicate on replay.
      // A crash after this checkpoint may skip push; email remains retryable.
      await checkpoint({ pushAttempted: true, pushAttemptedAt: new Date().toISOString(), pushStatus: 'attempted' });
      let pushOutcome: Record<string, unknown>;
      try {
        const sent = await sendNotificationToUsers({ recipientUserIds: claim.recipients.map(recipient => recipient.userId), title, body, url: '/dashboard/team' });
        const failed = sent.fcmFailureCount + sent.webPushFailureCount;
        const succeeded = sent.fcmSuccessCount + sent.webPushSuccessCount;
        pushOutcome = { pushResult: sent, pushDelivered: failed === 0, pushStatus: failed ? (succeeded ? 'partial' : 'failed') : 'completed' };
      } catch (error) {
        pushOutcome = { pushDelivered: false, pushStatus: 'failed', pushError: error instanceof Error ? error.message : 'Tournament push attempt failed.' };
      }
      await checkpoint(pushOutcome);
    }
    const completed = new Set<string>(Array.isArray(claim.data.emailDeliveredUserIds) ? claim.data.emailDeliveredUserIds : []);
    const emailRecipients = [...new Map(claim.recipients.filter(recipient => recipient.email).map(recipient => [recipient.email, recipient])).values()];
    const { subject, html } = eventNotificationEmail({ recipientName: 'Team Member', teamName: claim.teamName, eventTitle: String(event.title), eventDate: String(event.date), eventTime: String(event.startTime || ''), location: String(event.location || ''), eventType: 'tournament' });
    for (const recipient of emailRecipients) {
      if (completed.has(recipient.userId)) continue;
      const response = await getResend().batch.send([{ from: 'The Squad Pro <noreply@thesquad.pro>', to: [recipient.email], subject, html }], { idempotencyKey: `${effect.id}:email:${recipient.userId}` });
      if (response.error || response.data?.data?.length !== 1) throw new Error('Tournament email delivery was not confirmed.');
      completed.add(recipient.userId);
      await checkpoint({ emailDeliveredUserIds: [...completed] });
    }
    await checkpoint({ status: 'delivered', deliveredAt: new Date().toISOString(), lastError: '' });
    return 'delivered';
  } catch (error) {
    await checkpoint({ status: 'failed', lastError: error instanceof Error ? error.message : 'Tournament notification delivery failed.' });
    return 'failed';
  }
}
