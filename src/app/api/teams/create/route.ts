import { randomBytes } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken, assertNonAnonymous } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import {
  accountCreationLimit,
  normalizeCreationText,
} from '@/lib/account-creation-policy';
import { readJsonBodyWithLimit, RequestBodyError } from '@/lib/server-request-guards';

const ALLOWED_TYPES = new Set([
  'adult',
  'youth',
  'team',
  'club',
  'school',
  'school_squad',
]);

function inviteCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(10);
  return [...bytes].map(byte => alphabet[byte % alphabet.length]).join('');
}

export async function POST(request: NextRequest) {
  const auth = await verifyFirebaseToken(request);
  if (auth instanceof NextResponse) return auth;
  const anonymousError = assertNonAnonymous(auth);
  if (anonymousError) return anonymousError;

  try {
    const input = await readJsonBodyWithLimit<Record<string, unknown>>(request, 30_000);
    const name = normalizeCreationText(input.name, { field: 'name', max: 120 })!;
    const type = normalizeCreationText(input.type, { field: 'type', max: 30 })!;
    if (!ALLOWED_TYPES.has(type)) {
      return NextResponse.json({ error: 'Unsupported team type.' }, { status: 400 });
    }
    const position = normalizeCreationText(input.position, {
      field: 'position',
      max: 60,
    })!;
    const description = normalizeCreationText(input.description, {
      field: 'description',
      max: 2000,
      optional: true,
    });
    const waiverTitle = normalizeCreationText(input.customWaiverTitle, {
      field: 'waiverTitle',
      max: 120,
      optional: true,
    });
    const waiverContent = normalizeCreationText(input.customWaiverContent, {
      field: 'waiverContent',
      max: 20_000,
      optional: true,
    });
    if (Boolean(waiverTitle) !== Boolean(waiverContent)) {
      return NextResponse.json(
        { error: 'A custom waiver requires both a title and content.' },
        { status: 400 }
      );
    }

    const requestedOwnerId =
      typeof input.overrideOwnerId === 'string' && input.overrideOwnerId
        ? input.overrideOwnerId
        : auth.uid;
    const schoolId =
      typeof input.schoolId === 'string' && input.schoolId ? input.schoolId : undefined;

    if (requestedOwnerId !== auth.uid) {
      if (!schoolId) {
        return NextResponse.json({ error: 'Organization authorization is required.' }, { status: 403 });
      }
      const school = await adminDb.collection('teams').doc(schoolId).get();
      const schoolData = school.data();
      const authorized =
        school.exists &&
        (schoolData?.ownerUserId === auth.uid ||
          (Array.isArray(schoolData?.schoolAdminIds) &&
            schoolData.schoolAdminIds.includes(auth.uid))) &&
        schoolData?.ownerUserId === requestedOwnerId;
      if (!authorized) {
        return NextResponse.json({ error: 'Organization authorization is required.' }, { status: 403 });
      }
    }

    const ownerRef = adminDb.collection('users').doc(requestedOwnerId);
    const ownedTeamsQuery = adminDb
      .collection('teams')
      .where('ownerUserId', '==', requestedOwnerId);
    const teamId = `team_${adminDb.collection('teams').doc().id}`;
    const teamRef = adminDb.collection('teams').doc(teamId);
    const creatorMembershipRef = adminDb
      .collection('users')
      .doc(auth.uid)
      .collection('teamMemberships')
      .doc(teamId);
    const memberRef = teamRef.collection('members').doc(auth.uid);
    const now = new Date().toISOString();
    const code = inviteCode();

    await adminDb.runTransaction(async transaction => {
      const [ownerSnapshot, ownedTeams] = await Promise.all([
        transaction.get(ownerRef),
        transaction.get(ownedTeamsQuery),
      ]);
      if (!ownerSnapshot.exists) throw new Error('OWNER_PROFILE_MISSING');
      const limit = accountCreationLimit(ownerSnapshot.data());
      if (ownedTeams.size >= limit) throw new Error('TEAM_LIMIT_REACHED');

      const baseTeam = {
        id: teamId,
        teamName: name,
        code,
        teamCode: code,
        inviteCode: code,
        type,
        sport: type === 'school' || type === 'school_squad' ? 'Basketball' : 'General',
        ...(description ? { description } : {}),
        createdBy: auth.uid,
        ownerUserId: requestedOwnerId,
        planId: 'free',
        isPro: false,
        createdAt: now,
        ...(schoolId ? { schoolId } : {}),
      };
      transaction.create(teamRef, baseTeam);
      transaction.set(creatorMembershipRef, {
        teamId,
        name,
        role: 'Admin',
        code,
        joinedAt: now,
        type,
        isPro: false,
        planId: 'free',
        ...(schoolId ? { schoolId } : {}),
        ownerUserId: requestedOwnerId,
      });
      transaction.set(memberRef, {
        id: auth.uid,
        userId: auth.uid,
        playerId: `p_${auth.uid}`,
        name: auth.email || 'Team administrator',
        role: 'Admin',
        position,
        joinedAt: now,
        ownerUserId: requestedOwnerId,
        teamId,
        ...(schoolId ? { schoolId } : {}),
        ...(auth.email ? { email: auth.email } : {}),
      });
      if (waiverTitle && waiverContent) {
        transaction.set(teamRef.collection('documents').doc('custom_1'), {
          id: 'custom_1',
          title: waiverTitle,
          content: waiverContent,
          type: 'waiver',
          isActive: true,
          assignedTo: ['all'],
          createdAt: now,
        });
      }
      if (input.coachName && input.coachEmail) {
        const coachName = normalizeCreationText(input.coachName, {
          field: 'coachName',
          max: 120,
        })!;
        const coachEmail = normalizeCreationText(input.coachEmail, {
          field: 'coachEmail',
          max: 254,
        })!.toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(coachEmail)) {
          throw new Error('COACHEMAIL_INVALID');
        }
        const coachRef = teamRef.collection('members').doc();
        transaction.set(coachRef, {
          id: coachRef.id,
          teamId,
          name: coachName,
          email: coachEmail,
          position: 'Head Coach',
          role: 'Member',
          joinedAt: now,
          ownerUserId: requestedOwnerId,
          ...(schoolId ? { schoolId } : {}),
        });
      }
    });

    return NextResponse.json({ teamId, code }, { status: 201 });
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const code = error instanceof Error ? error.message : 'TEAM_CREATE_FAILED';
    if (code === 'TEAM_LIMIT_REACHED') {
      return NextResponse.json(
        { error: 'Your account has reached its team limit.' },
        { status: 409 }
      );
    }
    if (code === 'OWNER_PROFILE_MISSING') {
      return NextResponse.json({ error: 'Account profile is incomplete.' }, { status: 409 });
    }
    if (code.endsWith('_REQUIRED') || code.endsWith('_INVALID')) {
      return NextResponse.json({ error: 'One or more team fields are invalid.' }, { status: 400 });
    }
    console.error('[teams/create] Failed:', error);
    return NextResponse.json({ error: 'Unable to create the team.' }, { status: 500 });
  }
}
