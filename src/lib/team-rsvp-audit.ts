const SAFE_ID = /^[A-Za-z0-9_-]{1,200}$/;
const RSVP_STATUSES = new Set(['going', 'maybe', 'declined', 'no_response']);

type TeamRsvpAuditInput = {
  actorId: string;
  participantId: string;
  status: string;
  occurredAt: string;
};

export function buildTeamRsvpAuditRecord({
  actorId,
  participantId,
  status,
  occurredAt,
}: TeamRsvpAuditInput) {
  if (!SAFE_ID.test(actorId) || !SAFE_ID.test(participantId) ||
      !RSVP_STATUSES.has(status) || !Number.isFinite(Date.parse(occurredAt)) ||
      new Date(occurredAt).toISOString() !== occurredAt) {
    throw new Error('Invalid RSVP audit record.');
  }
  return { actorId, participantId, status, occurredAt };
}
