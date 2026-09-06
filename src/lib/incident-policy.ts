export class IncidentInputError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

const required = ['title', 'date', 'time', 'location', 'description', 'eventId', 'eventKind', 'involvedPeople', 'actionsTaken'] as const;
const optional = ['participantTeamName', 'division', 'gameId', 'participantId', 'participantName', 'incidentType', 'injuryType', 'witnesses', 'severity', 'treatmentProvided', 'followUpNotes', 'reportedTo', 'equipmentInvolved', 'weatherConditions'] as const;
const booleans = ['emergencyServicesCalled', 'parentGuardianContacted', 'followUpRequired'] as const;
export const INCIDENT_STATUSES = ['open', 'monitoring', 'follow_up_required', 'resolved'] as const;
export const incidentId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(value);
export type IncidentInput = Record<string, unknown> & {title:string;date:string;time:string;location:string;description:string;eventId:string;eventKind:string;involvedPeople:string;actionsTaken:string};

/** A closed schema: callers never supply identity, creation time or audit facts. */
export function validateIncidentInput(value: unknown): IncidentInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new IncidentInputError('A complete incident report is required.');
  const input = value as Record<string, unknown>;
  const allowed = new Set<string>([...required, ...optional, ...booleans, 'witnessesList', 'involvedPersonnel', 'status']);
  if (Object.keys(input).some(key => !allowed.has(key))) throw new IncidentInputError('Unsupported incident field.');
  const result: Record<string, unknown> = {};
  for (const key of [...required, ...optional]) {
    const entry = input[key];
    const limit = ['description', 'actionsTaken', 'treatmentProvided', 'followUpNotes'].includes(key) ? 12000 : 500;
    if (entry === undefined && !required.includes(key as typeof required[number])) continue;
    if (typeof entry !== 'string' || entry.length > limit || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(entry) || (required.includes(key as typeof required[number]) && !entry.trim())) throw new IncidentInputError(`Valid ${key} is required (maximum ${limit} characters).`);
    result[key] = entry.trim();
  }
  if (!incidentId(result.eventId) || !['team','league','tournament'].includes(String(result.eventKind))) throw new IncidentInputError('Select a valid incident event.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(result.date)) || !Number.isFinite(Date.parse(String(result.date))) || new Date(String(result.date)).toISOString().slice(0,10) !== result.date || !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(result.time))) throw new IncidentInputError('Valid incident date and time are required.');
  for (const key of booleans) {
    if (input[key] === undefined && key !== 'emergencyServicesCalled') continue;
    if (typeof input[key] !== 'boolean') throw new IncidentInputError(`Valid ${key} is required.`);
    result[key] = input[key];
  }
  if (input.severity !== undefined && !['minor','moderate','severe','critical'].includes(String(input.severity))) throw new IncidentInputError('Invalid incident severity.');
  if (input.status !== undefined && !INCIDENT_STATUSES.includes(input.status as typeof INCIDENT_STATUSES[number])) throw new IncidentInputError('Invalid incident status.');
  result.status = input.status || 'open';
  for (const key of ['witnessesList','involvedPersonnel']) {
    const people = input[key];
    if (people === undefined) continue;
    if (!Array.isArray(people) || people.length > 20) throw new IncidentInputError('Use at most 20 people per list.');
    result[key] = people.map(person => {
      if (!person || typeof person !== 'object' || Array.isArray(person) || Object.keys(person).some(field => !['name','phone','email'].includes(field))) throw new IncidentInputError('Invalid incident person.');
      for (const [field, entry] of Object.entries(person)) if (typeof entry !== 'string' || entry.length > 200 || /[\r\n\u0000]/.test(entry)) throw new IncidentInputError(`Invalid person ${field}.`);
      return person;
    }).filter(person => person.name?.trim());
  }
  return result as IncidentInput;
}
