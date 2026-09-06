import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyFirebaseToken } from '@/lib/api-auth';
import { applyPollVote } from '@/lib/poll-policy';
import { awaitLocalCertificationRequestBarrier } from '@/lib/local-certification-request-barrier';
import {
  enforceUserRateLimit,
  readJsonBodyWithLimit,
  RequestBodyError,
} from '@/lib/server-request-guards';

/** Records one authenticated member vote without allowing clients to alter totals. */
export async function POST(req: NextRequest) {
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const { teamId, chatId, messageId, optionIdx, optionId } =
      await readJsonBodyWithLimit<{
        teamId?: unknown;
        chatId?: unknown;
        messageId?: unknown;
        optionIdx?: unknown;
        optionId?: unknown;
      }>(req, 8_000);
    if (
      typeof teamId !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(teamId) ||
      typeof chatId !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(chatId) ||
      typeof messageId !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(messageId) ||
      (optionId !== undefined ? typeof optionId !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(optionId) || optionIdx !== undefined
        : typeof optionIdx !== 'number' || !Number.isInteger(optionIdx) || optionIdx < 0)
    ) {
      return NextResponse.json({ error: 'Invalid poll vote.' }, { status: 400 });
    }
    const rateLimit = await enforceUserRateLimit(auth.uid, 'team-chat-vote', 60, 5 * 60 * 1000);
    if (rateLimit) return rateLimit;
    await awaitLocalCertificationRequestBarrier(req.headers);

    const teamRef = adminDb.collection('teams').doc(teamId);
    const chatRef = teamRef.collection('groupChats').doc(chatId);
    const messageRef = teamRef.collection('groupChats').doc(chatId).collection('messages').doc(messageId);
    await adminDb.runTransaction(async (transaction) => {
      const [team, chat, message] = await Promise.all([
        transaction.get(teamRef),
        transaction.get(chatRef),
        transaction.get(messageRef),
      ]);
      const chatMembers = Array.isArray(chat.data()?.memberIds) ? chat.data()?.memberIds : [];
      const isPrivileged = auth.role === 'superadmin' || team.data()?.ownerUserId === auth.uid;
      const memberAuthority = chat.data()?.memberAuthorities?.[auth.uid];
      const sourceTeamId = typeof memberAuthority?.teamId === 'string' ? memberAuthority.teamId : teamId;
      const sourceMemberId = typeof memberAuthority?.memberId === 'string' ? memberAuthority.memberId : auth.uid;
      const hasActiveMembership = isPrivileged
        ? true
        : await transaction.get(adminDb.collection('teams').doc(sourceTeamId).collection('members').doc(sourceMemberId)).then(member => {
          const data = member.data();
          return member.exists && data?.status !== 'removed' && data?.isDeleted !== true &&
            (data?.userId === auth.uid || sourceMemberId === auth.uid);
        });
      if (
        !team.exists ||
        !chat.exists ||
        chat.data()?.isDeleted === true ||
        team.data()?.features?.tacticalChat === false ||
        (
          !isPrivileged &&
          (!chatMembers.includes(auth.uid) || !hasActiveMembership)
        )
      ) {
        throw new Error('FORBIDDEN');
      }
      if (!message.exists) throw new Error('NOT_FOUND');

      const poll = message.data()?.poll;
      if (message.data()?.isDeleted === true) throw new Error('NOT_FOUND');
      const next = applyPollVote(poll,auth.uid,(optionId ?? optionIdx) as string | number);
      if (JSON.stringify(next) !== JSON.stringify(poll)) transaction.update(messageRef,{poll:next});
    });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    if (err instanceof RequestBodyError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const status = err.message === 'FORBIDDEN' ? 403 : err.message === 'NOT_FOUND' ? 404 : err.message === 'INVALID_POLL' ? 400 : 500;
    if (status === 500) console.error('[teams/chat/vote] Error:', err.message);
    return NextResponse.json({ error: status === 500 ? 'Unable to record your vote.' : 'This poll is unavailable.' }, { status });
  }
}
