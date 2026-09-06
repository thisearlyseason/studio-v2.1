type RsvpEvent = {
  status?: unknown;
  isArchived?: unknown;
};

type RsvpParticipant = {
  userId?: unknown;
  parentId?: unknown;
};

type RsvpDecisionInput = {
  event: RsvpEvent;
  callerUid: string;
  callerRole?: string;
  callerIsStaff: boolean;
  callerHasActiveMembership: boolean;
  participantId: string;
  participant: RsvpParticipant;
};

export function canUpdateTeamRsvp({
  event,
  callerUid,
  callerRole,
  callerIsStaff,
  callerHasActiveMembership,
  participantId,
  participant,
}: RsvpDecisionInput): boolean {
  if (event.isArchived === true || String(event.status || '').toLowerCase() === 'cancelled') {
    return false;
  }
  if (callerIsStaff) return true;
  if (!callerHasActiveMembership) return false;

  // Guardian accounts coordinate their athletes' attendance. The client has
  // always presented this rule; enforce it on the API boundary as well.
  if (callerRole === 'parent' && participantId === callerUid) return false;
  return participantId === callerUid || participant.userId === callerUid || participant.parentId === callerUid;
}

export function rsvpParticipantId(child: { id?: unknown; userId?: unknown }): string {
  if (typeof child.userId === 'string' && child.userId) return child.userId;
  return typeof child.id === 'string' ? child.id : '';
}
