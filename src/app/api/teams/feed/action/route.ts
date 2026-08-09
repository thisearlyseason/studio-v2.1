import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyFirebaseToken } from '@/lib/api-auth';
import { getTeamAuthority, isParentMember } from '@/lib/server-team-access';
import {
  enforceUserRateLimit,
  readJsonBodyWithLimit,
  RequestBodyError,
} from '@/lib/server-request-guards';

const ID_PATTERN = /^[A-Za-z0-9_-]{1,200}$/;
const ACTIONS = new Set([
  'create-post',
  'create-comment',
  'delete-post',
  'delete-comment',
  'toggle-like',
  'vote',
]);

function validId(value: unknown): value is string {
  return typeof value === 'string' && ID_PATTERN.test(value);
}

function safeImage(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 1_500_000) return null;
  return value.startsWith('data:image/') || /^https:\/\//i.test(value) ? value : null;
}

export async function POST(req: NextRequest) {
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await readJsonBodyWithLimit<Record<string, unknown>>(req, 2_000_000);
    const action = typeof body.action === 'string' && ACTIONS.has(body.action) ? body.action : '';
    const teamId = validId(body.teamId) ? body.teamId : '';
    const postId = validId(body.postId) ? body.postId : '';
    const commentId = validId(body.commentId) ? body.commentId : '';
    if (!action || !teamId) {
      return NextResponse.json({ error: 'Invalid feed action.' }, { status: 400 });
    }

    const limited = await enforceUserRateLimit(auth.uid, 'team-feed-action', 120, 5 * 60 * 1000);
    if (limited) return limited;

    const authority = await getTeamAuthority(teamId, auth.uid, auth.role);
    if (!authority || (!authority.isOwner && !authority.isSuperAdmin && !authority.member)) {
      return NextResponse.json({ error: 'You are no longer an active squad member.' }, { status: 403 });
    }

    const isParent = isParentMember(authority.member?.data);
    const canPost = authority.isStaff || !isParent || authority.teamData.parentPostingEnabled === true;
    const canComment = authority.isStaff || !isParent || authority.teamData.parentCommentsEnabled === true;
    const profile = await adminDb.collection('users').doc(auth.uid).get();
    const authorName = String(
      profile.data()?.name ||
      profile.data()?.fullName ||
      authority.member?.data.name ||
      auth.email ||
      'Squad Member'
    ).slice(0, 120);
    const authorAvatar = String(profile.data()?.avatar || profile.data()?.avatarUrl || '').slice(0, 2_000);
    const feed = authority.teamRef.collection('feedPosts');

    if (action === 'create-post') {
      if (!canPost) return NextResponse.json({ error: 'Posting is disabled for this account.' }, { status: 403 });
      const content = typeof body.content === 'string' ? body.content.trim().slice(0, 10_000) : '';
      const imageUrl = safeImage(body.imageUrl);
      const rawPoll = body.poll && typeof body.poll === 'object' ? body.poll as Record<string, unknown> : null;
      const options = Array.isArray(rawPoll?.options)
        ? rawPoll.options.slice(0, 6).map(option => {
            const item = option && typeof option === 'object' ? option as Record<string, unknown> : {};
            return {
              text: String(item.text || '').trim().slice(0, 240),
              imageUrl: safeImage(item.imageUrl),
              votes: 0,
            };
          }).filter(option => option.text)
        : [];
      const isPoll = Boolean(rawPoll);
      if ((!content && !imageUrl && !isPoll) || (isPoll && (!content || options.length < 2))) {
        return NextResponse.json({ error: 'A post or valid poll is required.' }, { status: 400 });
      }

      const ref = feed.doc();
      await ref.create({
        id: ref.id,
        teamId,
        content,
        imageUrl,
        type: isPoll ? 'poll' : 'user',
        authorId: auth.uid,
        author: { name: authorName, avatar: authorAvatar },
        createdAt: new Date().toISOString(),
        likes: [],
        ...(isPoll ? {
          poll: {
            id: `p_${ref.id}`,
            question: content,
            options,
            totalVotes: 0,
            voters: {},
            isClosed: false,
          },
        } : {}),
      });
      return NextResponse.json({ success: true, postId: ref.id }, { status: 201 });
    }

    if (!postId) return NextResponse.json({ error: 'A valid post is required.' }, { status: 400 });
    const postRef = feed.doc(postId);

    if (action === 'create-comment') {
      if (!canComment) return NextResponse.json({ error: 'Comments are disabled for this account.' }, { status: 403 });
      const content = typeof body.content === 'string' ? body.content.trim().slice(0, 4_000) : '';
      if (!content) return NextResponse.json({ error: 'A comment is required.' }, { status: 400 });
      const post = await postRef.get();
      if (!post.exists) return NextResponse.json({ error: 'Post not found.' }, { status: 404 });
      const ref = postRef.collection('comments').doc();
      await ref.create({
        id: ref.id,
        postId,
        content,
        authorId: auth.uid,
        authorName,
        createdAt: new Date().toISOString(),
      });
      return NextResponse.json({ success: true, commentId: ref.id }, { status: 201 });
    }

    if (action === 'delete-post') {
      const post = await postRef.get();
      if (!post.exists) return NextResponse.json({ error: 'Post not found.' }, { status: 404 });
      if (!authority.isStaff && post.data()?.authorId !== auth.uid) {
        return NextResponse.json({ error: 'Only the author or squad staff can remove this post.' }, { status: 403 });
      }
      const comments = await postRef.collection('comments').limit(400).get();
      if (comments.size >= 400) {
        return NextResponse.json({ error: 'This post has too many comments to remove in one operation.' }, { status: 409 });
      }
      const batch = adminDb.batch();
      comments.docs.forEach(comment => batch.delete(comment.ref));
      batch.delete(postRef);
      await batch.commit();
      return NextResponse.json({ success: true });
    }

    if (action === 'delete-comment') {
      if (!commentId) return NextResponse.json({ error: 'A valid comment is required.' }, { status: 400 });
      const ref = postRef.collection('comments').doc(commentId);
      const comment = await ref.get();
      if (!comment.exists) return NextResponse.json({ error: 'Comment not found.' }, { status: 404 });
      if (!authority.isStaff && comment.data()?.authorId !== auth.uid) {
        return NextResponse.json({ error: 'Only the author or squad staff can remove this comment.' }, { status: 403 });
      }
      await ref.delete();
      return NextResponse.json({ success: true });
    }

    await adminDb.runTransaction(async transaction => {
      const post = await transaction.get(postRef);
      if (!post.exists) throw new Error('NOT_FOUND');
      const data = post.data() || {};

      if (action === 'toggle-like') {
        const likes = Array.isArray(data.likes) ? data.likes.filter((id: unknown) => typeof id === 'string') : [];
        transaction.update(postRef, {
          likes: likes.includes(auth.uid) ? likes.filter((id: string) => id !== auth.uid) : [...likes, auth.uid],
        });
        return;
      }

      const optionIdx = body.optionIdx;
      const poll = data.poll;
      if (!Number.isInteger(optionIdx) || typeof optionIdx !== 'number' || !poll || poll.isClosed ||
          !Array.isArray(poll.options) || optionIdx < 0 || optionIdx >= poll.options.length) {
        throw new Error('INVALID_POLL');
      }
      const voters = { ...(poll.voters || {}) };
      const previousVote = voters[auth.uid];
      if (previousVote === optionIdx) return;
      const options = poll.options.map((option: Record<string, unknown>, index: number) => ({
        ...option,
        votes: Math.max(0, Number(option.votes || 0) + (index === optionIdx ? 1 : index === previousVote ? -1 : 0)),
      }));
      voters[auth.uid] = optionIdx;
      transaction.update(postRef, {
        poll: {
          ...poll,
          options,
          voters,
          totalVotes: previousVote === undefined ? Number(poll.totalVotes || 0) + 1 : Number(poll.totalVotes || 0),
        },
      });
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const code = error instanceof Error ? error.message : '';
    if (code === 'NOT_FOUND') return NextResponse.json({ error: 'Post not found.' }, { status: 404 });
    if (code === 'INVALID_POLL') return NextResponse.json({ error: 'This poll is unavailable.' }, { status: 400 });
    console.error('[teams/feed/action] Error:', error);
    return NextResponse.json({ error: 'Unable to update the squad feed.' }, { status: 500 });
  }
}
