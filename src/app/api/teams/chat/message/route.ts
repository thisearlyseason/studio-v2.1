import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyFirebaseToken } from '@/lib/api-auth';
import { findActiveTeamMember } from '@/lib/server-team-access';
import {
  enforceUserRateLimit,
  readJsonBodyWithLimit,
  RequestBodyError,
} from '@/lib/server-request-guards';

const ID_PATTERN = /^[A-Za-z0-9_-]{1,200}$/;
const MESSAGE_TYPES = new Set(['text', 'image', 'poll']);

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
    if (!teamId || !chatId || !type || (type === 'text' && !content) || (type === 'image' && !imageUrl)) {
      return NextResponse.json({ error: 'Invalid tactical message.' }, { status: 400 });
    }
    const rateLimit = await enforceUserRateLimit(auth.uid, 'team-chat-message', 120, 5 * 60 * 1000);
    if (rateLimit) return rateLimit;

    const teamRef = adminDb.collection('teams').doc(teamId);
    const chatRef = teamRef.collection('groupChats').doc(chatId);
    const [team, chat, profile] = await Promise.all([
      teamRef.get(),
      chatRef.get(),
      adminDb.collection('users').doc(auth.uid).get(),
    ]);
    const chatMembers = Array.isArray(chat.data()?.memberIds) ? chat.data()?.memberIds : [];
    const isOwner = team.data()?.ownerUserId === auth.uid;
    const isSuperAdmin = auth.role === 'superadmin';
    const activeMembership = isOwner || isSuperAdmin
      ? null
      : await findActiveTeamMember(teamId, auth.uid);
    if (!team.exists || !chat.exists || (!isOwner && !isSuperAdmin && (!activeMembership || !chatMembers.includes(auth.uid)))) {
      return NextResponse.json({ error: 'You are no longer authorized for this chat.' }, { status: 403 });
    }

    let safePoll: Record<string, unknown> | null = null;
    if (type === 'poll') {
      const options = Array.isArray(poll?.options)
        ? poll.options.slice(0, 10).map((option: any) => ({
            text: String(option?.text || '').trim().slice(0, 240),
            image: typeof option?.image === 'string' ? option.image.slice(0, 500_000) : null,
            votes: 0,
          })).filter((option: any) => option.text)
        : [];
      if (!poll || typeof poll.question !== 'string' || poll.question.trim().length < 1 || options.length < 2) {
        return NextResponse.json({ error: 'A poll needs a question and at least two options.' }, { status: 400 });
      }
      safePoll = {
        question: poll.question.trim().slice(0, 500),
        options,
        voters: {},
        totalVotes: 0,
        isClosed: false,
      };
    }

    const author = String(
      profile.data()?.name ||
      profile.data()?.fullName ||
      activeMembership?.data.name ||
      auth.email ||
      'Squad Member'
    ).slice(0, 120);
    const messageRef = chatRef.collection('messages').doc();
    const createdAt = new Date().toISOString();
    await messageRef.create({
      id: messageRef.id,
      author,
      authorId: auth.uid,
      content,
      type,
      imageUrl,
      poll: safePoll,
      createdAt,
    });
    await chatRef.set({ lastMessage: content || (type === 'poll' ? 'New poll' : 'Shared an image'), lastMessageAt: createdAt }, { merge: true });
    return NextResponse.json({ ok: true, messageId: messageRef.id });
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[teams/chat/message] Error:', error);
    return NextResponse.json({ error: 'Unable to send this tactical message.' }, { status: 500 });
  }
}
