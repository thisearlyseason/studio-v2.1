import * as admin from 'firebase-admin';
import { NextRequest, NextResponse } from 'next/server';
import { assertNonAnonymous, verifyFirebaseToken } from '@/lib/api-auth';
import { adminDb, ensureAdminInit, getAdminStorageBucketName } from '@/lib/firebase-admin';
import { enforceUserRateLimit, readJsonBodyWithLimit, RequestBodyError } from '@/lib/server-request-guards';
import { executeTeamSeasonReset, SeasonResetError } from '@/lib/team-season-reset';

export async function POST(request: NextRequest) {
  const auth = await verifyFirebaseToken(request);
  if (auth instanceof NextResponse) return auth;
  const anonymousError = assertNonAnonymous(auth);
  if (anonymousError) return anonymousError;

  try {
    const limited = await enforceUserRateLimit(auth.uid, 'team-season-reset', 4, 60 * 60 * 1000);
    if (limited) return limited;
    const body = await readJsonBodyWithLimit<{ teamId?: unknown; categories?: unknown }>(request, 8_000);
    const teamId = typeof body.teamId === 'string' ? body.teamId : '';
    const result = await executeTeamSeasonReset({
      teamId,
      ownerUid: auth.uid,
      categories: body.categories,
      adapter: {
        async get(path) {
          const snapshot = await adminDb.doc(path).get();
          return snapshot.exists ? snapshot.data() || {} : null;
        },
        async list(collectionPath) {
          const snapshot = await adminDb.collection(collectionPath).get();
          return snapshot.docs.map(document => ({ path: document.ref.path, id: document.id, data: document.data() }));
        },
        async remove(path) {
          await adminDb.recursiveDelete(adminDb.doc(path));
        },
        async update(path, patch) {
          await adminDb.doc(path).set(patch, { merge: true });
        },
        async removeStorage(path) {
          ensureAdminInit();
          await admin.storage().bucket(getAdminStorageBucketName()).file(path).delete({ ignoreNotFound: true });
        },
      },
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof SeasonResetError) {
      const status = error.code === 'FORBIDDEN' ? 403
        : error.code === 'NOT_FOUND' ? 404
          : error.code === 'PARTIAL_FAILURE' ? 503 : 400;
      return NextResponse.json({ error: error.message, code: error.code, summary: error.summary }, { status });
    }
    console.error('[teams/season-reset] Error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Unable to reset this squad season.' }, { status: 500 });
  }
}
