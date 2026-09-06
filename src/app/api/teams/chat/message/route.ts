import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyFirebaseToken } from '@/lib/api-auth';
import { createHash, randomUUID } from 'node:crypto';
import { validatePollInput } from '@/lib/poll-policy';
import { sendNotificationToUsers } from '@/lib/server-notification-delivery';
import {
  enforceUserRateLimit,
  readJsonBodyWithLimit,
  RequestBodyError,
} from '@/lib/server-request-guards';

const ID_PATTERN = /^[A-Za-z0-9_-]{1,200}$/;
const MESSAGE_TYPES = new Set(['text', 'image', 'poll']);

function isActiveMember(snapshot: FirebaseFirestore.DocumentSnapshot) {
  return snapshot.exists && snapshot.data()?.status !== 'removed' && snapshot.data()?.isDeleted !== true;
}

function fingerprintMessage(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export async function POST(req: NextRequest) {
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const body = await readJsonBodyWithLimit<Record<string, unknown>>(req, 2_000_000);
    const teamId = typeof body.teamId === 'string' && ID_PATTERN.test(body.teamId) ? body.teamId : '';
    const chatId = typeof body.chatId === 'string' && ID_PATTERN.test(body.chatId) ? body.chatId : '';
    const type = typeof body.type === 'string' && MESSAGE_TYPES.has(body.type) ? body.type : '';
    const content = typeof body.content === 'string' ? body.content.trim().slice(0, 10_000) : '';
    const imageUrl = typeof body.imageUrl === 'string' ? body.imageUrl.slice(0, 1_500_000) : null;
    const poll = body.poll && typeof body.poll === 'object' ? body.poll as Record<string, any> : null;
    const suppliedRequestId = body.requestId;
    if (!teamId || !chatId || !type || (type === 'text' && !content) || (type === 'image' && !imageUrl)) {
      return NextResponse.json({ error: 'Invalid tactical message.' }, { status: 400 });
    }
    if (suppliedRequestId !== undefined && (typeof suppliedRequestId !== 'string' || !ID_PATTERN.test(suppliedRequestId))) {
      return NextResponse.json({ error: 'Invalid request identity.' }, { status: 400 });
    }
    const rateLimit = await enforceUserRateLimit(auth.uid, 'team-chat-message', 120, 5 * 60 * 1000);
    if (rateLimit) return rateLimit;

    const teamRef = adminDb.collection('teams').doc(teamId);
    const chatRef = teamRef.collection('groupChats').doc(chatId);
    const profile = await adminDb.collection('users').doc(auth.uid).get();

    let safePoll: Record<string, unknown> | null = null;
    if (type === 'poll') {
      let input;
      try {input=validatePollInput(poll);} catch(error) {return NextResponse.json({error:error instanceof Error ? error.message : 'Invalid poll.'},{status:400});}
      safePoll = {
        id:`poll_${randomUUID()}`,
        question: input.question,
        options: input.options.map(option=>({...option,id:`option_${randomUUID()}`,votes:0})),
        voters: {},
        totalVotes: 0,
        isClosed: false,
      };
    }

    const author = String(
      profile.data()?.name ||
      profile.data()?.fullName ||
      auth.email ||
      'Squad Member'
    ).slice(0, 120);
    const requestId = typeof suppliedRequestId === 'string' ? suppliedRequestId : randomUUID();
    const messageId = `message_${fingerprintMessage([teamId, chatId, auth.uid, requestId])}`;
    const messageRef = chatRef.collection('messages').doc(messageId);
    const createdAt = new Date().toISOString();
    const requestFingerprint = fingerprintMessage({ type, content, imageUrl, poll: type === 'poll' ? poll : null });
    let replayed = false;
    let recipientUserIds: string[] = [];
    let channelName = 'Team Chat';
    await adminDb.runTransaction(async transaction => {
      const [team, chat, existing] = await Promise.all([
        transaction.get(teamRef), transaction.get(chatRef), transaction.get(messageRef),
      ]);
      const chatData = chat.data() || {};
      const chatMembers: unknown[] = Array.isArray(chatData.memberIds) ? chatData.memberIds : [];
      const isPrivileged = auth.role === 'superadmin' || team.data()?.ownerUserId === auth.uid;
      const senderAuthority = chatData.memberAuthorities?.[auth.uid];
      const senderTeamId = typeof senderAuthority?.teamId === 'string' ? senderAuthority.teamId : teamId;
      const senderMemberId = typeof senderAuthority?.memberId === 'string' ? senderAuthority.memberId : auth.uid;
      const senderRef = adminDb.collection('teams').doc(senderTeamId).collection('members').doc(senderMemberId);
      const senderMember = isPrivileged ? null : await transaction.get(senderRef);
      const hasActiveMembership = isPrivileged || (
        isActiveMember(senderMember!) &&
        (senderMember!.data()?.userId === auth.uid || senderMemberId === auth.uid)
      );
      if (
        !team.exists || !chat.exists || chatData.isDeleted === true ||
        team.data()?.features?.tacticalChat === false ||
        (!isPrivileged && (!hasActiveMembership || !chatMembers.includes(auth.uid)))
      ) throw new Error('FORBIDDEN');

      channelName = typeof chatData.name === 'string' ? chatData.name.trim().slice(0, 100) || channelName : channelName;
      if (existing.exists) {
        if (existing.data()?.authorId !== auth.uid || existing.data()?.requestFingerprint !== requestFingerprint) {
          throw new Error('CONFLICT');
        }
        replayed = true;
        return;
      }

      const recipientIds = [...new Set(chatMembers.filter(
        (memberId): memberId is string => typeof memberId === 'string' && memberId !== auth.uid
      ))];
      const memberships = await Promise.all(recipientIds.map(async memberId => {
        const authority = chatData.memberAuthorities?.[memberId];
        const sourceTeamId = typeof authority?.teamId === 'string' ? authority.teamId : teamId;
        const sourceMemberId = typeof authority?.memberId === 'string' ? authority.memberId : memberId;
        const member = await transaction.get(adminDb.collection('teams').doc(sourceTeamId).collection('members').doc(sourceMemberId));
        if (!isActiveMember(member) || (member.data()?.userId !== memberId && sourceMemberId !== memberId)) return null;
        const linkedUserId = member.data()?.userId;
        return typeof linkedUserId === 'string' && linkedUserId.trim() ? linkedUserId.trim() : memberId;
      }));
      recipientUserIds = [...new Set(memberships.filter((uid): uid is string => Boolean(uid) && uid !== auth.uid))];
      const unreadUpdate: Record<string, unknown> = {
        lastMessage: content || (type === 'poll' ? 'New poll' : 'Shared an image'),
        lastMessageAt: createdAt,
        [`unreadBy.${auth.uid}`]: 0,
      };
      for (const recipientId of recipientUserIds) unreadUpdate[`unreadBy.${recipientId}`] = FieldValue.increment(1);
      transaction.create(messageRef, {
        id: messageRef.id, author, authorId: auth.uid, content, type, imageUrl,
        poll: safePoll, createdAt, requestId, requestFingerprint,
      });
      transaction.update(chatRef, unreadUpdate);
    });
    let notificationResult = {
      fcmSuccessCount: 0,
      fcmFailureCount: 0,
      webPushSuccessCount: 0,
      webPushFailureCount: 0,
    };
    try {
      if (replayed) throw new Error('SKIP_REPLAY_DELIVERY');
      notificationResult = await sendNotificationToUsers({
        recipientUserIds,
        title: `New message in ${channelName}`,
        body: content || (type === 'poll' ? 'New poll' : 'Shared an image'),
        url: `/chats/${chatId}?teamId=${encodeURIComponent(teamId)}`,
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'SKIP_REPLAY_DELIVERY') {
        return NextResponse.json({ ok: true, messageId: messageRef.id, replayed: true, notification: notificationResult });
      }
      console.warn('[Chat Push] Delivery failed:', error instanceof Error ? error.message : 'unknown error');
    }
    return NextResponse.json({
      ok: true,
      messageId: messageRef.id,
      replayed,
      notification: notificationResult,
    });
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const code = error instanceof Error ? error.message : '';
    if (code === 'FORBIDDEN') return NextResponse.json({ error: 'This tactical channel is unavailable.' }, { status: 403 });
    if (code === 'CONFLICT') return NextResponse.json({ error: 'This request identity was already used for another message.' }, { status: 409 });
    console.error('[teams/chat/message] Error:', error);
    return NextResponse.json({ error: 'Unable to send this tactical message.' }, { status: 500 });
  }
}
