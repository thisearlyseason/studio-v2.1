import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyFirebaseToken } from '@/lib/api-auth';
import {
  findActiveTeamMember,
  getTeamAuthority,
  isParentMember,
  isStaffMember,
} from '@/lib/server-team-access';
import {
  enforceUserRateLimit,
  readJsonBodyWithLimit,
  RequestBodyError,
} from '@/lib/server-request-guards';

const ID_PATTERN = /^[A-Za-z0-9_-]{1,200}$/;

type Recipient = {
  userId: string;
  name: string;
  position: string;
  avatar: string;
  squadName: string;
  isStaff: boolean;
  isParent: boolean;
};

type ChatContext = {
  id: string;
  name: string;
  type: 'team' | 'league' | 'tournament';
  recipients: Recipient[];
};

function recipientFrom(data: FirebaseFirestore.DocumentData, squadName: string): Recipient | null {
  const userId = typeof data.userId === 'string' ? data.userId : '';
  if (!userId || data.status === 'removed' || data.isDeleted === true) return null;
  return {
    userId,
    name: String(data.name || 'Squad Member'),
    position: String(data.position || data.role || 'Member'),
    avatar: String(data.avatar || ''),
    squadName,
    isStaff: isStaffMember(data),
    isParent: isParentMember(data),
  };
}

async function teamRecipients(teamId: string, onlyStaff = false): Promise<Recipient[]> {
  const [team, members] = await Promise.all([
    adminDb.collection('teams').doc(teamId).get(),
    adminDb.collection('teams').doc(teamId).collection('members').limit(500).get(),
  ]);
  if (!team.exists) return [];
  const name = String(team.data()?.name || team.data()?.teamName || 'Squad');
  return members.docs
    .filter(doc => !onlyStaff || isStaffMember(doc.data()))
    .map(doc => recipientFrom(doc.data(), name))
    .filter((value): value is Recipient => Boolean(value));
}

function uniqueRecipients(recipients: Recipient[], excludeUid: string) {
  return Array.from(
    new Map(
      recipients
        .filter(recipient => recipient.userId !== excludeUid)
        .map(recipient => [recipient.userId, recipient])
    ).values()
  );
}

async function buildContexts(teamId: string, uid: string, tokenRole?: string) {
  const authority = await getTeamAuthority(teamId, uid, tokenRole);
  if (!authority || (!authority.member && !authority.isOwner && !authority.isSuperAdmin)) return null;

  const ownRecipients = await teamRecipients(teamId);
  let allowedOwn = ownRecipients;
  if (!authority.isStaff) {
    if (isParentMember(authority.member?.data)) {
      allowedOwn = ownRecipients.filter(recipient => {
        return recipient.isStaff || (authority.teamData.parentChatEnabled === true && recipient.isParent);
      });
    } else {
      allowedOwn = ownRecipients.filter(recipient => !recipient.isParent);
    }
  }

  const contexts: ChatContext[] = [{
    id: `team:${teamId}`,
    name: String(authority.teamData.name || authority.teamData.teamName || 'Current Squad'),
    type: 'team',
    recipients: uniqueRecipients(allowedOwn, uid),
  }];

  if (!authority.isStaff) return { authority, contexts };

  const leagueIds = new Set<string>(Object.keys(authority.teamData.leagueIds || {}));
  const [createdLeagues, enrolledLeagues] = await Promise.all([
    adminDb.collection('leagues').where('creatorId', '==', uid).limit(100).get(),
    adminDb.collection('leagues').where('memberTeamIds', 'array-contains', teamId).limit(100).get(),
  ]);
  [...createdLeagues.docs, ...enrolledLeagues.docs].forEach(doc => leagueIds.add(doc.id));
  for (const leagueId of leagueIds) {
    if (!ID_PATTERN.test(leagueId)) continue;
    const league = await adminDb.collection('leagues').doc(leagueId).get();
    if (!league.exists) continue;
    const data = league.data() || {};
    const enrolledIds = new Set<string>([
      ...(Array.isArray(data.memberTeamIds) ? data.memberTeamIds : []),
      ...Object.keys(data.teams || {}),
    ]);
    if (data.creatorId !== uid && !enrolledIds.has(teamId)) continue;
    const recipients = (
      await Promise.all(
        Array.from(enrolledIds)
          .filter(id => id !== teamId && ID_PATTERN.test(id))
          .map(id => teamRecipients(id, true))
      )
    ).flat();
    contexts.push({
      id: `league:${leagueId}`,
      name: String(data.name || 'League'),
      type: 'league',
      recipients: uniqueRecipients(recipients, uid),
    });
  }

  const events = await authority.teamRef.collection('events').where('eventType', '==', 'tournament').limit(100).get();
  for (const event of events.docs) {
    const data = event.data();
    const enrolledIds = (Array.isArray(data.tournamentTeamsData) ? data.tournamentTeamsData : [])
      .map((team: any) => team?.teamId || team?.id)
      .filter((id: unknown): id is string => typeof id === 'string' && ID_PATTERN.test(id) && id !== teamId);
    const recipients = (await Promise.all(enrolledIds.map(id => teamRecipients(id, true)))).flat();
    contexts.push({
      id: `tournament:${event.id}`,
      name: String(data.title || data.name || 'Tournament'),
      type: 'tournament',
      recipients: uniqueRecipients(recipients, uid),
    });
  }
  return { authority, contexts };
}

export async function GET(req: NextRequest) {
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;
  const teamId = req.nextUrl.searchParams.get('teamId') || '';
  if (!ID_PATTERN.test(teamId)) return NextResponse.json({ error: 'Invalid squad.' }, { status: 400 });
  try {
    const result = await buildContexts(teamId, auth.uid, auth.role);
    if (!result) return NextResponse.json({ error: 'You do not belong to this squad.' }, { status: 403 });
    return NextResponse.json({ contexts: result.contexts });
  } catch (error) {
    console.error('[teams/chat GET] Error:', error);
    return NextResponse.json({ error: 'Unable to load approved chat recipients.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const body = await readJsonBodyWithLimit<Record<string, unknown>>(req, 16_000);
    const teamId = typeof body.teamId === 'string' && ID_PATTERN.test(body.teamId) ? body.teamId : '';
    const contextId = typeof body.contextId === 'string' ? body.contextId : '';
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 100) : '';
    const memberIds = Array.isArray(body.memberIds)
      ? Array.from(new Set(body.memberIds.filter((id): id is string => typeof id === 'string' && ID_PATTERN.test(id))))
      : [];
    if (!teamId || !contextId || name.length < 1 || memberIds.length < 1 || memberIds.length > 100) {
      return NextResponse.json({ error: 'Choose a chat context and at least one approved recipient.' }, { status: 400 });
    }
    const rateLimit = await enforceUserRateLimit(auth.uid, 'team-chat-create', 20, 10 * 60 * 1000);
    if (rateLimit) return rateLimit;
    const result = await buildContexts(teamId, auth.uid, auth.role);
    if (!result) return NextResponse.json({ error: 'You do not belong to this squad.' }, { status: 403 });
    const context = result.contexts.find(candidate => candidate.id === contextId);
    const allowed = new Set(context?.recipients.map(recipient => recipient.userId) || []);
    if (!context || memberIds.some(id => !allowed.has(id))) {
      return NextResponse.json({ error: 'One or more recipients are outside your approved chat scope.' }, { status: 403 });
    }

    const chatRef = result.authority.teamRef.collection('groupChats').doc();
    await chatRef.create({
      id: chatRef.id,
      name,
      createdBy: auth.uid,
      memberIds: [...memberIds, auth.uid],
      contextId,
      contextType: context.type,
      contextName: context.name,
      createdAt: new Date().toISOString(),
      isDeleted: false,
      teamId,
    });
    return NextResponse.json({ ok: true, chatId: chatRef.id });
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[teams/chat POST] Error:', error);
    return NextResponse.json({ error: 'Unable to create this tactical chat.' }, { status: 500 });
  }
}
