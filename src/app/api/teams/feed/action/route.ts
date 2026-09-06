import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyFirebaseToken } from '@/lib/api-auth';
import { getTeamAuthority, isParentMember } from '@/lib/server-team-access';
import { createHash } from 'node:crypto';
import { canReadFeedAudience, decodeFeedImage, feedAudience } from '@/lib/feed-policy';
import { feedMediaFile } from '@/lib/server-feed-media';
import { isTeamModuleEnabled } from '@/lib/team-module-visibility';
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

async function readAuthority(teamId: string, auth: {uid: string; role?: string}) {
  const authority = await getTeamAuthority(teamId, auth.uid, auth.role);
  if (!authority || (!authority.isOwner && !authority.isSuperAdmin && !authority.member) ||
      !isTeamModuleEnabled({key:'feed'}, authority.teamData.features) ||
      (isParentMember(authority.member?.data) && authority.teamData.parentFeedEnabled === false)) return null;
  return authority;
}

export async function GET(req: NextRequest) {
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;
  const params = new URL(req.url).searchParams;
  const teamId = params.get('teamId') || '';
  const postId = params.get('postId') || '';
  if (!validId(teamId) || (postId && !validId(postId))) return NextResponse.json({error:'Invalid feed request.'},{status:400});
  const authority = await readAuthority(teamId,auth);
  if (!authority) return NextResponse.json({error:'Feed unavailable.'},{status:403});
  const visible = (data: Record<string,unknown>) => canReadFeedAudience(data.audience,authority.isStaff,isParentMember(authority.member?.data));
  const feed = authority.teamRef.collection('feedPosts');
  const headers = {'Cache-Control':'private, no-store'};
  if (postId) {
    const post = await feed.doc(postId).get();
    if (!post.exists || !visible(post.data() || {})) return NextResponse.json({error:'Post unavailable.'},{status:404});
    if (params.get('media') === '1') {
      const data = post.data() || {};
      if (data.imagePath !== `teams/${teamId}/feed/${postId}/image`) return NextResponse.json({error:'Image unavailable.'},{status:404});
      const file = feedMediaFile(teamId,postId);
      if (!(await file.exists())[0]) return NextResponse.json({error:'Image unavailable.'},{status:404});
      const [metadata] = await file.getMetadata();
      if (Number(metadata.size) > 5 * 1024 * 1024 || !/^image\/(png|jpeg|gif|webp)$/.test(metadata.contentType || '')) return NextResponse.json({error:'Image unavailable.'},{status:404});
      const [bytes] = await file.download();
      return new NextResponse(new Uint8Array(bytes),{headers:{...headers,'Content-Type':metadata.contentType!,'X-Content-Type-Options':'nosniff'}});
    }
    const comments = await feed.doc(postId).collection('comments').orderBy('createdAt','asc').limit(50).get();
    return NextResponse.json({comments:comments.docs.map(doc=>({...doc.data(),id:doc.id}))},{headers});
  }
  const posts = await feed.orderBy('createdAt','desc').limit(100).get();
  return NextResponse.json({posts:posts.docs.filter(doc=>visible(doc.data())).slice(0,20).map(doc=>({...doc.data(),id:doc.id}))},{headers});
}

export async function POST(req: NextRequest) {
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await readJsonBodyWithLimit<Record<string, unknown>>(req, 7_100_000);
    const action = typeof body.action === 'string' && ACTIONS.has(body.action) ? body.action : '';
    const teamId = validId(body.teamId) ? body.teamId : '';
    const postId = validId(body.postId) ? body.postId : '';
    const commentId = validId(body.commentId) ? body.commentId : '';
    if (!action || !teamId) {
      return NextResponse.json({ error: 'Invalid feed action.' }, { status: 400 });
    }

    const limited = await enforceUserRateLimit(auth.uid, 'team-feed-action', 120, 5 * 60 * 1000);
    if (limited) return limited;

    const authority = await readAuthority(teamId, auth);
    if (!authority) {
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
    if (body.idempotencyKey !== undefined && !validId(body.idempotencyKey)) return NextResponse.json({error:'Invalid request identity.'},{status:400});
    const requestId = validId(body.idempotencyKey) ? `feed_${createHash('sha256').update(`${auth.uid}:${action}:${body.idempotencyKey}`).digest('hex')}` : null;
    const receiptRef = requestId ? authority.teamRef.collection('feedOperations').doc(requestId) : null;
    const requestHash = createHash('sha256').update(JSON.stringify(body)).digest('hex');
    if (receiptRef) {
      const prior = await receiptRef.get();
      if (prior.exists) return prior.data()?.requestHash === requestHash
        ? NextResponse.json(prior.data()?.result,{status:200})
        : NextResponse.json({error:'Request identity was already used.'},{status:409});
    }

    if (action === 'create-post') {
      if (!canPost) return NextResponse.json({ error: 'Posting is disabled for this account.' }, { status: 403 });
      const content = typeof body.content === 'string' ? body.content.trim().slice(0, 10_000) : '';
      if (body.imagePath !== undefined) return NextResponse.json({error:'Images must be uploaded with this post.'},{status:400});
      const image = decodeFeedImage(body.imageUrl);
      const audience = feedAudience(body.audience);
      if (!audience || (!authority.isStaff && audience !== 'everyone')) return NextResponse.json({error:'Invalid audience.'},{status:400});
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
      if ((!content && !image && !isPoll) || (isPoll && (!content || options.length < 2))) {
        return NextResponse.json({ error: 'A post or valid poll is required.' }, { status: 400 });
      }

      const ref = requestId ? feed.doc(requestId) : feed.doc();
      const imagePath = image ? `teams/${teamId}/feed/${ref.id}/image` : null;
      if (image) {
        try { await feedMediaFile(teamId,ref.id).save(image.bytes,{resumable:false,metadata:{contentType:image.contentType,cacheControl:'private, no-store'},preconditionOpts:{ifGenerationMatch:0}}); }
        catch (error) { if ((error as {code?: number}).code === 412) throw new Error('REQUEST_CONFLICT'); throw error; }
      }
      const value = {
        id: ref.id,
        teamId,
        content,
        imageUrl: null,
        imagePath,
        audience,
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
      };
      try { await adminDb.runTransaction(async transaction => {
        if (receiptRef) {
          const prior = await transaction.get(receiptRef);
          if (prior.exists) { if (prior.data()?.requestHash !== requestHash) throw new Error('REQUEST_CONFLICT'); return; }
        }
        transaction.create(ref,value);
        if (receiptRef) transaction.create(receiptRef,{requestHash,result:{success:true,postId:ref.id},createdAt:new Date().toISOString()});
      }); } catch (error) {
        // Never delete an object after an uncertain commit that actually persisted.
        if (image && !(await ref.get()).exists) await feedMediaFile(teamId,ref.id).delete({ignoreNotFound:true});
        throw error;
      }
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
      if (!canReadFeedAudience(post.data()?.audience,authority.isStaff,isParent)) return NextResponse.json({error:'Post unavailable.'},{status:404});
      const ref = requestId ? postRef.collection('comments').doc(requestId) : postRef.collection('comments').doc();
      const value = {
        id: ref.id,
        postId,
        content,
        authorId: auth.uid,
        authorName,
        createdAt: new Date().toISOString(),
      };
      await adminDb.runTransaction(async transaction => {
        if (receiptRef) {
          const prior = await transaction.get(receiptRef);
          if (prior.exists) { if (prior.data()?.requestHash !== requestHash) throw new Error('REQUEST_CONFLICT'); return; }
        }
        transaction.create(ref,value);
        if (receiptRef) transaction.create(receiptRef,{requestHash,result:{success:true,commentId:ref.id},createdAt:new Date().toISOString()});
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
      if (post.data()?.imagePath === `teams/${teamId}/feed/${postId}/image`) await feedMediaFile(teamId,postId).delete({ignoreNotFound:true});
      batch.set(authority.teamRef.collection('feedAudit').doc(),{action:'delete-post',postId,actorId:auth.uid,authorId:post.data()?.authorId,moderation:post.data()?.authorId !== auth.uid,createdAt:new Date().toISOString()});
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
      const batch = adminDb.batch();
      batch.delete(ref);
      batch.set(authority.teamRef.collection('feedAudit').doc(),{action:'delete-comment',postId,commentId,actorId:auth.uid,authorId:comment.data()?.authorId,moderation:comment.data()?.authorId !== auth.uid,createdAt:new Date().toISOString()});
      await batch.commit();
      return NextResponse.json({ success: true });
    }

    await adminDb.runTransaction(async transaction => {
      const post = await transaction.get(postRef);
      if (!post.exists) throw new Error('NOT_FOUND');
      const data = post.data() || {};
      if (!canReadFeedAudience(data.audience,authority.isStaff,isParent)) throw new Error('NOT_FOUND');

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
    if (code === 'INVALID_IMAGE') return NextResponse.json({error:'Use a valid JPEG, PNG, WebP, or GIF image up to 5 MB.'},{status:400});
    if (code === 'REQUEST_CONFLICT') return NextResponse.json({error:'Request identity was already used.'},{status:409});
    console.error('[teams/feed/action] Error:', error);
    return NextResponse.json({ error: 'Unable to update the squad feed.' }, { status: 500 });
  }
}
