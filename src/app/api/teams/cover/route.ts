import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getStorage } from 'firebase-admin/storage';
import { verifyFirebaseToken, assertNonAnonymous } from '@/lib/api-auth';
import { ensureAdminInit } from '@/lib/firebase-admin';
import { getTeamAuthority } from '@/lib/server-team-access';
import { enforceUserRateLimit } from '@/lib/server-request-guards';
import { COVER_MAX_BYTES, coverFocalPoint, optimizeTeamCover } from '@/lib/team-cover-processing';
import { firebaseConfig } from '@/firebase/config';
export const runtime = 'nodejs';
const SAFE_ID = /^[A-Za-z0-9_-]{1,200}$/;

async function mutate(request: NextRequest) {
  const auth = await verifyFirebaseToken(request);
  if (auth instanceof NextResponse) return auth;
  const anonymous = assertNonAnonymous(auth); if (anonymous) return anonymous;
  const teamId = request.nextUrl.searchParams.get('teamId') || '';
  if (!SAFE_ID.test(teamId)) return NextResponse.json({error: 'Invalid team.'}, {status: 400});
  const authority = await getTeamAuthority(teamId, auth.uid, auth.role);
  if (!authority?.isStaff) return NextResponse.json({error: 'Team staff access required.'}, {status: 403});
  const limited = await enforceUserRateLimit(auth.uid, 'team-cover', 20, 300_000); if (limited) return limited;
  ensureAdminInit();
  const bucket = getStorage().bucket(process.env.FIREBASE_STORAGE_BUCKET || (process.env.NEXT_PUBLIC_FIREBASE_WEBAPP_CONFIG ? JSON.parse(process.env.NEXT_PUBLIC_FIREBASE_WEBAPP_CONFIG).storageBucket : firebaseConfig.storageBucket));
  const createdPaths: string[] = [];
  let committed = false;
  async function clean(paths: string[]) {
    await Promise.all(paths.map(path => bucket.file(path).delete({ignoreNotFound: true}).catch(() => console.warn('[team-cover] Cleanup pending:', path))));
  }
  try {
    let replacement: {id: string; urls: {width: number; url: string}[]; focalX: number; focalY: number} | null = null;
    let focal: {focalX: number; focalY: number} | undefined;
    if (request.method === 'POST') {
      // Bound the actual stream, including clients without a Content-Length header.
      const reader = request.body?.getReader();
      if (!reader) throw new Error('Choose an image.');
      const chunks: Uint8Array[] = []; let bytes = 0;
      while (true) { const chunk = await reader.read(); if (chunk.done) break; bytes += chunk.value.length; if (bytes > COVER_MAX_BYTES + 64_000) { await reader.cancel(); throw new Error('Choose an image up to 5 MB.'); } chunks.push(chunk.value); }
      const form = await new Response(Buffer.concat(chunks), {headers: {'Content-Type': request.headers.get('content-type') || ''}}).formData();
      const file = form.get('image');
      if (!(file instanceof File)) throw new Error('Choose an image.');
      focal = coverFocalPoint(form.get('focalX'), form.get('focalY'));
      const versions = await optimizeTeamCover(Buffer.from(await file.arrayBuffer()));
      const id = randomUUID();
      replacement = {id, urls: [], ...focal};
      for (const version of versions) {
        const path = `teams/${teamId}/home-covers/${id}/${version.width}.webp`;
        const token = randomUUID(); createdPaths.push(path);
        await bucket.file(path).save(version.data, {resumable: false, metadata: {contentType: 'image/webp', cacheControl: 'public,max-age=31536000,immutable', metadata: {firebaseStorageDownloadTokens: token}}});
        const origin = process.env.FIREBASE_STORAGE_EMULATOR_HOST ? `http://${process.env.FIREBASE_STORAGE_EMULATOR_HOST}` : 'https://firebasestorage.googleapis.com';
        replacement.urls.push({width: version.width, url: `${origin}/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`});
      }
    } else if (request.method === 'PATCH') {
      if (Number(request.headers.get('content-length') || 0) > 1000) throw new Error('Invalid position.');
      const body = await request.text(); if (body.length > 1000) throw new Error('Invalid position.');
      const payload = JSON.parse(body); focal = coverFocalPoint(payload.focalX, payload.focalY);
    }
    const latestAuthority = await getTeamAuthority(teamId, auth.uid, auth.role);
    if (!latestAuthority?.isStaff) { await clean(createdPaths); return NextResponse.json({error: 'Team staff access required.'}, {status: 403}); }
    const previous = await authority.teamRef.firestore.runTransaction(async transaction => {
      const snapshot = await transaction.get(authority.teamRef);
      const old = snapshot.data()?.homeCover;
      if (request.method === 'PATCH' && !old) throw new Error('Upload a cover before repositioning it.');
      transaction.update(authority.teamRef, {homeCover: request.method === 'PATCH' ? {...old, ...focal} : replacement});
      return old;
    });
    committed = true;
    if (request.method !== 'PATCH' && previous?.id && SAFE_ID.test(previous.id)) {
      const [oldFiles] = await bucket.getFiles({prefix: `teams/${teamId}/home-covers/${previous.id}/`}).catch(() => [[]]);
      await clean(oldFiles.map(file => file.name));
    }
    return NextResponse.json({ok: true});
  } catch (error) {
    if (!committed) await clean(createdPaths);
    console.warn('[team-cover] Could not save cover:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({error: error instanceof Error ? error.message : 'Cover could not be saved.'}, {status: 400});
  }
}
export const POST = mutate;
export const PATCH = mutate;
export const DELETE = mutate;
