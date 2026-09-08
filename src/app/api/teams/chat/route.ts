import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyFirebaseToken } from '@/lib/api-auth';
import {
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
  teamId: string;
  memberId: string;
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

type AuthorizedChatChannel = {
  id: string;
  teamId: string;
  name: string;
  createdAt: string;
  lastMessage: string;
  lastMessageAt: string;
  unread: number;
};

function tacticalChatEnabled(teamData: FirebaseFirestore.DocumentData) {
  return teamData.features?.tacticalChat !== false;
}

function chatTimestamp(value: unknown) {
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  if (value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as { toDate(): Date }).toDate().toISOString();
  }
  return '';
}

async function listAuthorizedChatChannels(uid: string, currentTeamId: string, tokenRole?: string): Promise<AuthorizedChatChannel[]> {
  const [linkedMemberships, hiddenChats] = await Promise.all([
    adminDb.collectionGroup('members')
      .where('userId', '==', uid)
      .limit(500)
      .get(),
    adminDb.collection('users').doc(uid).collection('hiddenChats').limit(500).get(),
  ]);
  let snapshot: { docs: FirebaseFirestore.QueryDocumentSnapshot[] };
  try {
    snapshot = await adminDb.collectionGroup('groupChats')
      .where('memberIds', 'array-contains', uid)
      .limit(500)
      .get();
  } catch (error) {
    if (!(error && typeof error === 'object' && 'code' in error && (error as { code?: unknown }).code === 9)) throw error;
    // Keep current-team chat usable while a newly deployed collection-group
    // index finishes building. Full cross-team discovery resumes automatically
    // as soon as that index is ready.
    const fallbackTeamIds = new Set([currentTeamId]);
    linkedMemberships.docs.forEach(member => {
      const segments = member.ref.path.split('/');
      if (segments.length === 4 && segments[0] === 'teams' && segments[2] === 'members') fallbackTeamIds.add(segments[1]);
    });
    const fallback = await Promise.all([...fallbackTeamIds].map(teamId =>
      adminDb.collection('teams').doc(teamId).collection('groupChats')
        .where('memberIds', 'array-contains', uid)
        .limit(500)
        .get()
    ));
    snapshot = {
      docs: [...new Map(fallback.flatMap(result => result.docs).map(chat => [chat.ref.path, chat])).values()],
    };
  }
  const hiddenKeys = new Set(hiddenChats.docs.map(hidden => {
    const data = hidden.data() || {};
    return `${String(data.teamId || '')}:${String(data.chatId || '')}`;
  }));
  const membershipRefsByTeam = new Map<string, FirebaseFirestore.DocumentReference[]>();
  for (const membership of linkedMemberships.docs) {
    const segments = membership.ref.path.split('/');
    if (segments.length !== 4 || segments[0] !== 'teams' || segments[2] !== 'members') continue;
    const refs = membershipRefsByTeam.get(segments[1]) || [];
    refs.push(membership.ref);
    membershipRefsByTeam.set(segments[1], refs);
  }
  const summaries = await Promise.all(snapshot.docs.map(async chat => {
    const segments = chat.ref.path.split('/');
    if (segments.length !== 4 || segments[0] !== 'teams' || segments[2] !== 'groupChats') return null;
    const teamId = segments[1];
    return adminDb.runTransaction(async transaction => {
      const teamRef = adminDb.collection('teams').doc(teamId);
      const [freshChat, team] = await Promise.all([transaction.get(chat.ref), transaction.get(teamRef)]);
      const data = freshChat.data() || {};
      if (!freshChat.exists || data.isDeleted === true || !Array.isArray(data.memberIds) ||
          !data.memberIds.includes(uid) || !team.exists || !tacticalChatEnabled(team.data() || {})) return null;
      if (typeof data.teamId === 'string' && data.teamId !== teamId) return null;
      const legacyUpdates: Record<string, unknown> = {};
      if (data.isDeleted === undefined) legacyUpdates.isDeleted = false;
      if (data.teamId === undefined) legacyUpdates.teamId = teamId;
      const privileged = tokenRole === 'superadmin' || team.data()?.ownerUserId === uid;
      if (!privileged) {
        const authority = data.memberAuthorities?.[uid];
        if (authority) {
          const sourceTeamId = typeof authority.teamId === 'string' && ID_PATTERN.test(authority.teamId)
            ? authority.teamId : '';
          const sourceMemberId = typeof authority.memberId === 'string' && ID_PATTERN.test(authority.memberId)
            ? authority.memberId : '';
          if (!sourceTeamId || !sourceMemberId) return null;
          const member = await transaction.get(
            adminDb.collection('teams').doc(sourceTeamId).collection('members').doc(sourceMemberId),
          );
          const memberData = member.data() || {};
          if (!member.exists || memberData.status === 'removed' || memberData.isDeleted === true ||
              (memberData.userId !== uid && (sourceMemberId !== uid || Boolean(memberData.userId)))) return null;
        } else {
          const memberCollection = adminDb.collection('teams').doc(teamId).collection('members');
          const candidateRefs = new Map(
            [...(membershipRefsByTeam.get(teamId) || []), memberCollection.doc(uid)]
              .map(ref => [ref.path, ref]),
          );
          const candidates = await Promise.all([...candidateRefs.values()].map(ref => transaction.get(ref)));
          const member = candidates.find(candidate => {
            const memberData = candidate.data() || {};
            if (!candidate.exists || memberData.status === 'removed' || memberData.isDeleted === true) return false;
            return memberData.userId === uid || (candidate.id === uid && !memberData.userId);
          });
          if (!member) return null;
          legacyUpdates[`memberAuthorities.${uid}`] = { teamId, memberId: member.id };
        }
      }
      if (Object.keys(legacyUpdates).length) transaction.update(chat.ref, legacyUpdates);
      return {
        id: freshChat.id,
        teamId,
        name: String(data.name || 'Team Chat').slice(0, 100),
        createdAt: chatTimestamp(data.createdAt),
        lastMessage: String(data.lastMessage || '').slice(0, 10_000),
        lastMessageAt: chatTimestamp(data.lastMessageAt),
        unread: Math.max(0, Number(data.unreadBy?.[uid] || 0)),
      } satisfies AuthorizedChatChannel;
    });
  }));
  return summaries
    .filter((channel): channel is AuthorizedChatChannel => Boolean(channel))
    .filter(channel => !hiddenKeys.has(`${channel.teamId}:${channel.id}`))
    .sort((left, right) => (right.lastMessageAt || right.createdAt).localeCompare(left.lastMessageAt || left.createdAt));
}

function recipientFrom(data: FirebaseFirestore.DocumentData, squadName: string, teamId: string, memberId: string): Recipient | null {
  const userId = typeof data.userId === 'string' ? data.userId : '';
  if (!userId || data.status === 'removed' || data.isDeleted === true) return null;
  return {
    userId,
    teamId,
    memberId,
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
    .map(doc => recipientFrom({ ...doc.data(), userId: doc.data().userId || doc.id }, name, teamId, doc.id))
    .filter((value): value is Recipient => Boolean(value));
}

async function chatMemberDirectory(teamId: string, chatId: string) {
  const chat = await adminDb.collection('teams').doc(teamId).collection('groupChats').doc(chatId).get();
  if (!chat.exists || chat.data()?.isDeleted === true) return [];
  const data = chat.data() || {};
  const memberIds = Array.isArray(data.memberIds)
    ? data.memberIds.filter((id: unknown): id is string => typeof id === 'string' && ID_PATTERN.test(id))
    : [];
  const authorities = data.memberAuthorities && typeof data.memberAuthorities === 'object'
    ? data.memberAuthorities as Record<string, { teamId?: unknown; memberId?: unknown }>
    : {};
  const storedMetadata = data.staffMetadata && typeof data.staffMetadata === 'object'
    ? data.staffMetadata as Record<string, { name?: unknown; position?: unknown; avatar?: unknown; squadName?: unknown }>
    : {};

  return (await Promise.all(memberIds.map(async userId => {
    const authority = authorities[userId];
    const sourceTeamId = typeof authority?.teamId === 'string' && ID_PATTERN.test(authority.teamId)
      ? authority.teamId : teamId;
    const sourceMemberId = typeof authority?.memberId === 'string' && ID_PATTERN.test(authority.memberId)
      ? authority.memberId : userId;
    const [team, member] = await Promise.all([
      adminDb.collection('teams').doc(sourceTeamId).get(),
      adminDb.collection('teams').doc(sourceTeamId).collection('members').doc(sourceMemberId).get(),
    ]);
    const memberData = member.data() || {};
    if (member.exists && memberData.status !== 'removed' && memberData.isDeleted !== true &&
        (memberData.userId === userId || (sourceMemberId === userId && !memberData.userId))) {
      return {
        userId,
        name: String(memberData.name || 'Squad Member'),
        position: String(memberData.position || memberData.role || 'Member'),
        avatar: String(memberData.avatar || ''),
        squadName: String(team.data()?.name || team.data()?.teamName || 'Squad'),
      };
    }
    const metadata = storedMetadata[userId];
    if (!metadata) return null;
    return {
      userId,
      name: String(metadata.name || 'Squad Member'),
      position: String(metadata.position || 'Member'),
      avatar: String(metadata.avatar || ''),
      squadName: String(metadata.squadName || ''),
    };
  }))).filter((member): member is NonNullable<typeof member> => Boolean(member));
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
  const requestedChatId = req.nextUrl.searchParams.get('chatId') || '';
  if (!ID_PATTERN.test(teamId)) return NextResponse.json({ error: 'Invalid squad.' }, { status: 400 });
  if (requestedChatId && !ID_PATTERN.test(requestedChatId)) return NextResponse.json({ error: 'Invalid tactical channel.' }, { status: 400 });
  try {
    const result = await buildContexts(teamId, auth.uid, auth.role);
    if (!result) return NextResponse.json({ error: 'You do not belong to this squad.' }, { status: 403 });
    if (!tacticalChatEnabled(result.authority.teamData)) {
      return NextResponse.json({ error: 'Tactical chat is unavailable for this squad.' }, { status: 403 });
    }
    const channels = await listAuthorizedChatChannels(auth.uid, teamId, auth.role);
    const requestedChannel = requestedChatId
      ? channels.find(channel => channel.teamId === teamId && channel.id === requestedChatId)
      : null;
    if (requestedChatId && !requestedChannel) {
      return NextResponse.json({ error: 'You are no longer authorized for this chat.' }, { status: 403 });
    }
    const memberDirectory = requestedChannel ? await chatMemberDirectory(teamId, requestedChatId) : undefined;
    return NextResponse.json(
      { contexts: result.contexts, channels, ...(memberDirectory ? { memberDirectory } : {}) },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    console.error('[teams/chat GET] Error:', error);
    return NextResponse.json({ error: 'Unable to load approved chat recipients.' }, { status: 500 });
  }
}

/** Clears only the current active member's unread count for one channel. */
export async function PATCH(req: NextRequest) {
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const body = await readJsonBodyWithLimit<Record<string, unknown>>(req, 8_000);
    const teamId = typeof body.teamId === 'string' && ID_PATTERN.test(body.teamId) ? body.teamId : '';
    const chatId = typeof body.chatId === 'string' && ID_PATTERN.test(body.chatId) ? body.chatId : '';
    if (!teamId || !chatId) return NextResponse.json({ error: 'Invalid tactical channel.' }, { status: 400 });
    const action = typeof body.action === 'string' ? body.action : 'mark-read';
    const rateLimit = await enforceUserRateLimit(auth.uid, `team-chat-${action}`, 120, 5 * 60 * 1000);
    if (rateLimit) return rateLimit;
    if (!['mark-read', 'rename', 'set-members', 'configure-hub', 'delete'].includes(action)) {
      return NextResponse.json({ error: 'Unsupported chat action.' }, { status: 400 });
    }
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 100) : '';
    const requested = Array.isArray(body.memberIds)
      ? Array.from(new Set(body.memberIds.filter((id): id is string => typeof id === 'string' && ID_PATTERN.test(id))))
      : [];
    if (action === 'rename' && !name) return NextResponse.json({ error: 'Enter a channel name.' }, { status: 400 });
    if (action === 'set-members' && requested.length > 100) return NextResponse.json({ error: 'Too many channel members.' }, { status: 400 });
    const scoped = action === 'set-members' ? await buildContexts(teamId, auth.uid, auth.role) : null;
    const teamRef = adminDb.collection('teams').doc(teamId);
    const chatRef = teamRef.collection('groupChats').doc(chatId);
    await adminDb.runTransaction(async transaction => {
      const [team, chat] = await Promise.all([transaction.get(teamRef), transaction.get(chatRef)]);
      const teamData = team.data() || {};
      const chatData = chat.data() || {};
      const memberIds = Array.isArray(chatData.memberIds) ? chatData.memberIds : [];
      const isPrivileged = auth.role === 'superadmin' || teamData.ownerUserId === auth.uid;
      const memberAuthority = chatData.memberAuthorities?.[auth.uid];
      const sourceTeamId = typeof memberAuthority?.teamId === 'string' ? memberAuthority.teamId : teamId;
      const sourceMemberId = typeof memberAuthority?.memberId === 'string' ? memberAuthority.memberId : auth.uid;
      const member = isPrivileged ? null : await transaction.get(
        adminDb.collection('teams').doc(sourceTeamId).collection('members').doc(sourceMemberId),
      );
      const memberData = member?.data() || {};
      const activeMember = Boolean(member?.exists && memberData.status !== 'removed' && memberData.isDeleted !== true &&
        (memberData.userId === auth.uid || sourceMemberId === auth.uid));
      if (!team.exists || !chat.exists || chatData.isDeleted === true || !tacticalChatEnabled(teamData) ||
          (!isPrivileged && (!activeMember || !memberIds.includes(auth.uid)))) throw new Error('FORBIDDEN');
      if (action !== 'mark-read' && !isPrivileged && !isStaffMember(memberData)) throw new Error('FORBIDDEN');
      const updatedAt = new Date().toISOString();
      if (action === 'mark-read') {
        transaction.update(chatRef, { [`unreadBy.${auth.uid}`]: 0, [`lastReadAtBy.${auth.uid}`]: updatedAt });
      } else if (action === 'rename') {
        transaction.update(chatRef, { name, updatedAt, updatedBy: auth.uid });
      } else if (action === 'delete') {
        transaction.update(chatRef, { isDeleted: true, deletedAt: updatedAt, deletedBy: auth.uid });
      } else if (action === 'configure-hub') {
        const staffMetadata = body.staffMetadata && typeof body.staffMetadata === 'object'
          ? body.staffMetadata as Record<string, unknown>
          : {};
        if (body.hubTeamId !== teamId || Object.keys(staffMetadata).some(uid => !memberIds.includes(uid))) throw new Error('FORBIDDEN');
        transaction.update(chatRef, { isHubChannel: true, hubTeamId: teamId, staffMetadata, updatedAt, updatedBy: auth.uid });
      } else {
        const context = scoped?.contexts.find(candidate => candidate.id === chatData.contextId) || scoped?.contexts[0];
        const recipientById = new Map((context?.recipients || []).map(recipient => [recipient.userId, recipient]));
        if (!scoped || requested.some(id => id !== auth.uid && !recipientById.has(id))) throw new Error('FORBIDDEN');
        const selected = requested.filter(id => id !== auth.uid).map(id => recipientById.get(id)!);
        const snapshots = await Promise.all(selected.map(recipient => transaction.get(
          adminDb.collection('teams').doc(recipient.teamId).collection('members').doc(recipient.memberId),
        )));
        if (snapshots.some((snapshot, index) => !snapshot.exists || snapshot.data()?.status === 'removed' ||
            snapshot.data()?.isDeleted === true || snapshot.data()?.userId !== selected[index].userId)) throw new Error('FORBIDDEN');
        transaction.update(chatRef, {
          memberIds: Array.from(new Set([...requested, auth.uid])),
          memberAuthorities: Object.fromEntries([
            ...selected.map(recipient => [recipient.userId, { teamId: recipient.teamId, memberId: recipient.memberId }]),
            [auth.uid, { teamId: sourceTeamId, memberId: sourceMemberId }],
          ]),
          updatedAt, updatedBy: auth.uid,
        });
      }
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof RequestBodyError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'You are no longer authorized for this chat.' }, { status: 403 });
    }
    console.error('[teams/chat PATCH] Error:', error);
    return NextResponse.json({ error: 'Unable to mark this chat as read.' }, { status: 500 });
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
    if (!tacticalChatEnabled(result.authority.teamData)) {
      return NextResponse.json({ error: 'Tactical chat is unavailable for this squad.' }, { status: 403 });
    }
    const context = result.contexts.find(candidate => candidate.id === contextId);
    const allowed = new Set(context?.recipients.map(recipient => recipient.userId) || []);
    if (!context || memberIds.some(id => !allowed.has(id))) {
      return NextResponse.json({ error: 'One or more recipients are outside your approved chat scope.' }, { status: 403 });
    }

    const selected = memberIds.map(id => context.recipients.find(recipient => recipient.userId === id)!);
    const chatRef = result.authority.teamRef.collection('groupChats').doc();
    await adminDb.runTransaction(async transaction => {
      const freshTeam = await transaction.get(result.authority.teamRef);
      const isPrivileged = auth.role === 'superadmin' || freshTeam.data()?.ownerUserId === auth.uid;
      const senderRef = result.authority.teamRef.collection('members').doc(auth.uid);
      const sender = isPrivileged ? null : await transaction.get(senderRef);
      const senderData = sender?.data() || {};
      const senderActive = Boolean(sender?.exists && senderData.status !== 'removed' && senderData.isDeleted !== true);
      const recipientSnapshots = await Promise.all(selected.map(recipient => transaction.get(
        adminDb.collection('teams').doc(recipient.teamId).collection('members').doc(recipient.memberId),
      )));
      if (!freshTeam.exists || !tacticalChatEnabled(freshTeam.data() || {}) || (!isPrivileged && !senderActive) ||
          recipientSnapshots.some((snapshot, index) => !snapshot.exists || snapshot.data()?.status === 'removed' ||
            snapshot.data()?.isDeleted === true || snapshot.data()?.userId !== selected[index].userId)) throw new Error('FORBIDDEN');
      if (context.type === 'team' && selected.some(recipient => recipient.teamId !== teamId)) throw new Error('FORBIDDEN');
      if (!isPrivileged && !isStaffMember(senderData)) {
        const senderIsParent = isParentMember(senderData);
        if (context.type !== 'team' || selected.some(recipient => senderIsParent
          ? !recipient.isStaff && !(freshTeam.data()?.parentChatEnabled === true && recipient.isParent)
          : recipient.isParent)) throw new Error('FORBIDDEN');
      }
      if (context.type === 'league') {
        const leagueId = contextId.slice('league:'.length);
        const league = await transaction.get(adminDb.collection('leagues').doc(leagueId));
        const data = league.data() || {};
        const enrolled = new Set([...(Array.isArray(data.memberTeamIds) ? data.memberTeamIds : []), ...Object.keys(data.teams || {})]);
        if (!league.exists || (data.creatorId !== auth.uid && !enrolled.has(teamId)) || selected.some(recipient => !enrolled.has(recipient.teamId))) throw new Error('FORBIDDEN');
      } else if (context.type === 'tournament') {
        const eventId = contextId.slice('tournament:'.length);
        const event = await transaction.get(result.authority.teamRef.collection('events').doc(eventId));
        const enrolled = new Set((Array.isArray(event.data()?.tournamentTeamsData) ? event.data()?.tournamentTeamsData : [])
          .map((entry: any) => entry?.teamId || entry?.id).filter((id: unknown) => typeof id === 'string'));
        if (!event.exists || event.data()?.eventType !== 'tournament' || selected.some(recipient => !enrolled.has(recipient.teamId))) throw new Error('FORBIDDEN');
      }
      transaction.create(chatRef, {
        id: chatRef.id,
        name,
        createdBy: auth.uid,
        memberIds: Array.from(new Set([...memberIds, auth.uid])),
        memberAuthorities: Object.fromEntries([
          ...selected.map(recipient => [recipient.userId, { teamId: recipient.teamId, memberId: recipient.memberId }]),
          [auth.uid, { teamId, memberId: auth.uid }],
        ]),
        contextId,
        contextType: context.type,
        contextName: context.name,
        createdAt: new Date().toISOString(),
        isDeleted: false,
        teamId,
      });
    });
    return NextResponse.json({ ok: true, chatId: chatRef.id });
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Your chat scope changed. Refresh and try again.' }, { status: 403 });
    }
    console.error('[teams/chat POST] Error:', error);
    return NextResponse.json({ error: 'Unable to create this tactical chat.' }, { status: 500 });
  }
}
