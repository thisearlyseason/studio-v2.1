import { FieldValue, type DocumentData, type QueryDocumentSnapshot, type Transaction } from 'firebase-admin/firestore';
import { NextRequest, NextResponse } from 'next/server';
import { accountCreationLimit, normalizeCreationText } from '@/lib/account-creation-policy';
import { verifyFirebaseToken, type DecodedToken } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import {
  assertCompetitionMutationAuthority,
  resolveCompetitionAuthority,
  type CompetitionAuthority,
} from '@/lib/server-competition-authority';
import {
  canonicalCompetitionRequest,
  runCompetitionOperation,
  type CompetitionOperationIdentity,
} from '@/lib/server-competition-operation';
import {
  assertLeagueCloneCapacity,
  buildLeagueCloneDocument,
  buildLeagueClonePrivateDocument,
  buildLeagueCloneResult,
  parseLeagueCloneRequest,
  resolveLeagueCloneIdentity,
} from '@/lib/server-league-cloning';
import { readJsonBodyWithLimit, RequestBodyError } from '@/lib/server-request-guards';
import { hashLeagueScorekeeperPin } from '@/lib/server-competition-credential';
import { assertScheduleMutationLock, prepareLeagueProjectionClear, prepareLeagueScheduleClearUpdates, ScheduleDeploymentError, withScheduleMutationLock } from '@/lib/server-schedule-deployment';

type LeagueEditableFields = {
  name?: string;
  sport?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  ages?: string;
  contactEmail?: string;
  contactPhone?: string;
  registrationCost?: string;
  paymentInstructions?: string;
  socialLinks?: { twitter?: string; instagram?: string };
  slug?: string;
  requiredSquads?: number | null;
  blackoutDaysOfWeek?: number[];
  divisions?: string[];
  is_active?: boolean;
  isArchived?: false;
  scorekeeperPin?: string;
  teamUpdate?: {
    teamId: string;
    publicFields: DocumentData;
    privateFields: DocumentData;
  };
  individualRecruitUpdate?: {
    recruitId: string;
    recruit: DocumentData;
  };
};

type LeagueLifecycleRequest =
  | { action: 'create'; requestId: string; teamId?: string; name: string; sport: string; divisionTitle?: string }
  | { action: 'edit'; requestId: string; leagueId: string; expectedVersion: number; updates: LeagueEditableFields }
  | { action: 'clone'; requestId: string; leagueId: string; destination: 'division' | 'league'; name: string }
  | { action: 'archive'; requestId: string; leagueId: string; expectedVersion: number }
  | { action: 'delete'; requestId: string; leagues: Array<{ leagueId: string; expectedVersion: number }> };

export type LeagueLifecycleResult = {
  action: LeagueLifecycleRequest['action'];
  leagueId: string;
  lifecycleVersion?: number;
  deleted?: boolean;
};

const LEAGUE_ID = /^[A-Za-z0-9_-]{1,200}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SENSITIVE_ROOT_FIELDS = ['scorekeeperPin', 'scorekeeperPinHash', 'contactEmail', 'contactPhone', 'individualRecruits'] as const;
const PRIVATE_TEAM_FIELDS = ['coachName', 'coachEmail', 'coachPhone', 'organizerNotes', 'inviteCode'] as const;
const SCHEDULE_FIELDS = new Set(['startDate', 'endDate', 'blackoutDaysOfWeek', 'divisions']);
const EDITABLE_FIELDS = new Set([
  'name', 'sport', 'description', 'startDate', 'endDate', 'ages', 'contactEmail', 'contactPhone',
  'registrationCost', 'paymentInstructions', 'socialLinks', 'slug', 'requiredSquads',
  'blackoutDaysOfWeek', 'divisions', 'is_active', 'isArchived', 'scorekeeperPin',
  'teamUpdate', 'individualRecruitUpdate',
]);

const TEAM_PUBLIC_EDIT_FIELDS = new Set([
  'teamName', 'teamLogoUrl', 'teamId', 'origin', 'wins', 'losses', 'ties', 'points',
  'status', 'signedAt', 'manual', 'createdAt', 'division',
]);
const TEAM_PRIVATE_EDIT_FIELDS = new Set<string>(PRIVATE_TEAM_FIELDS);
const RECRUIT_EDIT_FIELDS = new Set([
  'name', 'email', 'phone', 'status', 'signedAt', 'manual', 'teamName', 'teamCode',
  'teamId', 'inviteCode', 'code', 'guardian_name', 'guardian_email', 'guardian_phone',
  'guardian_relationship',
]);

function fail(code: string): never {
  throw new Error(code);
}

function validDate(value: string): boolean {
  if (!DATE.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function text(value: unknown, field: string, max: number, optional = false): string | undefined {
  return normalizeCreationText(value, { field, max, optional });
}

function leagueId(value: unknown): string {
  if (typeof value !== 'string' || !LEAGUE_ID.test(value)) fail('LEAGUE_ID_INVALID');
  return value;
}

function expectedVersion(value: unknown): number {
  if (!Number.isInteger(value) || Number(value) < 0) fail('EXPECTED_VERSION_INVALID');
  return Number(value);
}

function parseStringArray(value: unknown, field: string, maxItems: number): string[] {
  if (!Array.isArray(value) || value.length > maxItems) fail(`${field.toUpperCase()}_INVALID`);
  const result = value.map(item => text(item, field, 120)!);
  if (new Set(result.map(item => item.toLocaleLowerCase())).size !== result.length) fail(`${field.toUpperCase()}_INVALID`);
  return result;
}

function plainRecord(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  return value as Record<string, unknown>;
}

function parseTeamUpdate(value: unknown): NonNullable<LeagueEditableFields['teamUpdate']> {
  const input = plainRecord(value, 'TEAMUPDATE_INVALID');
  const teamIdValue = leagueId(input.teamId);
  const publicFields = plainRecord(input.publicFields ?? {}, 'TEAMUPDATE_INVALID');
  const privateInput = plainRecord(input.privateFields ?? {}, 'TEAMUPDATE_INVALID');
  if (
    Object.keys(input).some(key => !['teamId', 'publicFields', 'privateFields'].includes(key)) ||
    Object.keys(publicFields).some(key => !TEAM_PUBLIC_EDIT_FIELDS.has(key)) ||
    Object.keys(privateInput).some(key => !TEAM_PRIVATE_EDIT_FIELDS.has(key)) ||
    (!Object.keys(publicFields).length && !Object.keys(privateInput).length)
  ) fail('TEAMUPDATE_INVALID');
  const parsedPublic: DocumentData = {};
  for (const [key, item] of Object.entries(publicFields)) {
    if (['wins', 'losses', 'ties', 'points'].includes(key)) {
      if (!Number.isInteger(item) || Number(item) < 0 || Number(item) > 1_000_000) fail('TEAMUPDATE_INVALID');
      parsedPublic[key] = Number(item);
    } else if (key === 'manual') {
      if (typeof item !== 'boolean') fail('TEAMUPDATE_INVALID');
      parsedPublic[key] = item;
    } else {
      if (item !== null && (typeof item !== 'string' || item.length > 2_000)) fail('TEAMUPDATE_INVALID');
      parsedPublic[key] = typeof item === 'string' ? item.trim() : item;
    }
  }
  const parsedPrivate = Object.fromEntries(Object.entries(privateInput).map(([key, item]) => {
    if (item !== null && (typeof item !== 'string' || item.length > 2_000)) fail('TEAMUPDATE_INVALID');
    return [key, key === 'inviteCode' && typeof item === 'string' ? item.trim().toUpperCase() : typeof item === 'string' ? item.trim() : item];
  }));
  return { teamId: teamIdValue, publicFields: parsedPublic, privateFields: parsedPrivate };
}

function parseIndividualRecruitUpdate(value: unknown): NonNullable<LeagueEditableFields['individualRecruitUpdate']> {
  const input = plainRecord(value, 'INDIVIDUALRECRUITUPDATE_INVALID');
  const recruitId = leagueId(input.recruitId);
  const recruit = plainRecord(input.recruit, 'INDIVIDUALRECRUITUPDATE_INVALID');
  if (Object.keys(input).some(key => !['recruitId', 'recruit'].includes(key)) || Object.keys(recruit).some(key => !RECRUIT_EDIT_FIELDS.has(key))) {
    fail('INDIVIDUALRECRUITUPDATE_INVALID');
  }
  const parsed = Object.fromEntries(Object.entries(recruit).map(([key, item]) => {
    if (key === 'manual') {
      if (typeof item !== 'boolean') fail('INDIVIDUALRECRUITUPDATE_INVALID');
      return [key, item];
    }
    if (item !== null && (typeof item !== 'string' || item.length > 2_000)) fail('INDIVIDUALRECRUITUPDATE_INVALID');
    return [key, typeof item === 'string' ? item.trim() : item];
  }));
  if (typeof parsed.email === 'string' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parsed.email)) fail('INDIVIDUALRECRUITUPDATE_INVALID');
  return { recruitId, recruit: parsed };
}

function parseUpdates(value: unknown): LeagueEditableFields {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('UPDATES_INVALID');
  const input = value as Record<string, unknown>;
  if (!Object.keys(input).length || Object.keys(input).some(key => !EDITABLE_FIELDS.has(key))) fail('UPDATES_INVALID');
  const updates: LeagueEditableFields = {};
  for (const key of ['name', 'sport'] as const) if (key in input) updates[key] = text(input[key], key, key === 'name' ? 120 : 80)!;
  for (const key of ['description', 'ages', 'registrationCost', 'paymentInstructions'] as const) {
    if (key in input) updates[key] = typeof input[key] === 'string' && input[key].length <= (key === 'description' ? 2_000 : 500) ? input[key].trim() : fail(`${key.toUpperCase()}_INVALID`);
  }
  for (const key of ['contactEmail', 'contactPhone'] as const) {
    if (key in input) updates[key] = typeof input[key] === 'string' && input[key].trim().length <= 254 ? input[key].trim() : fail(`${key.toUpperCase()}_INVALID`);
  }
  if (updates.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(updates.contactEmail)) fail('CONTACTEMAIL_INVALID');
  for (const key of ['startDate', 'endDate'] as const) {
    if (key in input) {
      if (typeof input[key] === 'string' && input[key].trim() === '') continue;
      if (typeof input[key] !== 'string' || !validDate(input[key])) fail(`${key.toUpperCase()}_INVALID`);
      updates[key] = input[key];
    }
  }
  if ('slug' in input && !(typeof input.slug === 'string' && input.slug.trim() === '')) {
    if (typeof input.slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug) || input.slug.length > 120) fail('SLUG_INVALID');
    updates.slug = input.slug;
  }
  if ('requiredSquads' in input) {
    if (input.requiredSquads !== null && (!Number.isInteger(input.requiredSquads) || Number(input.requiredSquads) < 1 || Number(input.requiredSquads) > 10_000)) fail('REQUIREDSQUADS_INVALID');
    updates.requiredSquads = input.requiredSquads as number | null;
  }
  if ('blackoutDaysOfWeek' in input) {
    if (!Array.isArray(input.blackoutDaysOfWeek) || input.blackoutDaysOfWeek.some(day => !Number.isInteger(day) || day < 0 || day > 6) || new Set(input.blackoutDaysOfWeek).size !== input.blackoutDaysOfWeek.length) fail('BLACKOUTDAYSOFWEEK_INVALID');
    updates.blackoutDaysOfWeek = [...input.blackoutDaysOfWeek] as number[];
  }
  if ('divisions' in input) updates.divisions = parseStringArray(input.divisions, 'divisions', 100);
  if ('socialLinks' in input) {
    if (!input.socialLinks || typeof input.socialLinks !== 'object' || Array.isArray(input.socialLinks)) fail('SOCIALLINKS_INVALID');
    const links = input.socialLinks as Record<string, unknown>;
    if (Object.keys(links).some(key => key !== 'twitter' && key !== 'instagram')) fail('SOCIALLINKS_INVALID');
    updates.socialLinks = Object.fromEntries(Object.entries(links).map(([key, item]) => {
      if (typeof item !== 'string' || item.length > 300) fail('SOCIALLINKS_INVALID');
      return [key, item.trim()];
    }));
  }
  for (const key of ['is_active'] as const) {
    if (key in input) {
      if (typeof input[key] !== 'boolean') fail(`${key.toUpperCase()}_INVALID`);
      updates[key] = input[key];
    }
  }
  if ('isArchived' in input) {
    if (input.isArchived !== false) fail('ISARCHIVED_INVALID');
    updates.isArchived = false;
  }
  if ('scorekeeperPin' in input) {
    if (typeof input.scorekeeperPin !== 'string' || input.scorekeeperPin.trim().length < 4 || input.scorekeeperPin.trim().length > 64) fail('SCOREKEEPERPIN_INVALID');
    updates.scorekeeperPin = input.scorekeeperPin.trim();
  }
  if ('teamUpdate' in input) updates.teamUpdate = parseTeamUpdate(input.teamUpdate);
  if ('individualRecruitUpdate' in input) updates.individualRecruitUpdate = parseIndividualRecruitUpdate(input.individualRecruitUpdate);
  return updates;
}

function parseRequest(body: Record<string, unknown>): LeagueLifecycleRequest {
  const action = body.action;
  const requestId = typeof body.requestId === 'string' ? body.requestId.trim() : '';
  if (!requestId) fail('REQUEST_ID_INVALID');
  if (action === 'create') {
    const teamId = body.teamId === undefined ? undefined : leagueId(body.teamId);
    const divisionTitle = text(body.divisionTitle, 'divisionTitle', 120, true);
    return {
      action, requestId, ...(teamId ? { teamId } : {}),
      name: text(body.name, 'name', 120)!, sport: text(body.sport, 'sport', 80)!,
      ...(divisionTitle ? { divisionTitle } : {}),
    };
  }
  if (action === 'clone') {
    const parsed = parseLeagueCloneRequest(body);
    return { action, requestId, leagueId: parsed.sourceLeagueId, destination: parsed.destination, name: parsed.requestedName };
  }
  if (action === 'edit') return { action, requestId, leagueId: leagueId(body.leagueId), expectedVersion: expectedVersion(body.expectedVersion), updates: parseUpdates(body.updates) };
  if (action === 'archive') return { action, requestId, leagueId: leagueId(body.leagueId), expectedVersion: expectedVersion(body.expectedVersion) };
  if (action === 'delete') {
    if (Object.keys(body).some(key => !['action', 'requestId', 'leagues', 'leagueId', 'expectedVersion'].includes(key))) fail('LEAGUES_INVALID');
    if ('leagues' in body && !Array.isArray(body.leagues)) fail('LEAGUES_INVALID');
    if (Array.isArray(body.leagues) && ('leagueId' in body || 'expectedVersion' in body)) fail('LEAGUES_INVALID');
    const rawTargets = Array.isArray(body.leagues)
      ? body.leagues
      : [{ leagueId: body.leagueId, expectedVersion: body.expectedVersion }];
    if (!rawTargets.length || rawTargets.length > 50) fail('LEAGUES_INVALID');
    const leagues = rawTargets.map(target => {
      if (!target || typeof target !== 'object' || Array.isArray(target)) fail('LEAGUES_INVALID');
      const record = target as Record<string, unknown>;
      if (Object.keys(record).some(key => !['leagueId', 'expectedVersion'].includes(key))) fail('LEAGUES_INVALID');
      return { leagueId: leagueId(record.leagueId), expectedVersion: expectedVersion(record.expectedVersion) };
    });
    if (new Set(leagues.map(target => target.leagueId)).size !== leagues.length) fail('LEAGUES_INVALID');
    return { action, requestId, leagues };
  }
  fail('ACTION_INVALID');
}

function nameKey(name: unknown): string {
  return typeof name === 'string' ? name.trim().toLocaleLowerCase() : '';
}

function reservationId(tenantId: string, name: string, divisionTitle: string): string {
  return Buffer.from(JSON.stringify([tenantId, nameKey(name), nameKey(divisionTitle)]), 'utf8').toString('base64url');
}

function currentVersion(league: DocumentData): number {
  const version = league.lifecycleVersion;
  return Number.isInteger(version) && version >= 0 ? version : 0;
}

function pinHash(leagueIdValue: string, pin: string): string {
  return hashLeagueScorekeeperPin(leagueIdValue, pin);
}

function privateTeamContacts(root: DocumentData): DocumentData {
  const contacts: DocumentData = {};
  if (!root.teams || typeof root.teams !== 'object' || Array.isArray(root.teams)) return contacts;
  for (const [teamIdValue, teamValue] of Object.entries(root.teams)) {
    if (!teamValue || typeof teamValue !== 'object' || Array.isArray(teamValue)) continue;
    const contact = Object.fromEntries(PRIVATE_TEAM_FIELDS
      .filter(field => field in teamValue)
      .map(field => [field, (teamValue as DocumentData)[field]]));
    if (Object.keys(contact).length) contacts[teamIdValue] = contact;
  }
  return contacts;
}

function memberSafeTeams(root: DocumentData): DocumentData {
  if (!root.teams || typeof root.teams !== 'object' || Array.isArray(root.teams)) return {};
  return Object.fromEntries(Object.entries(root.teams).map(([teamIdValue, teamValue]) => {
    if (!teamValue || typeof teamValue !== 'object' || Array.isArray(teamValue)) return [teamIdValue, teamValue];
    return [teamIdValue, Object.fromEntries(Object.entries(teamValue).filter(([field]) => !PRIVATE_TEAM_FIELDS.includes(field as typeof PRIVATE_TEAM_FIELDS[number])))];
  }));
}

function privateFields(leagueIdValue: string, root: DocumentData, existing: DocumentData, updates: LeagueEditableFields = {}): DocumentData {
  const result = { ...existing };
  const contactEmail = updates.contactEmail ?? root.contactEmail;
  const contactPhone = updates.contactPhone ?? root.contactPhone;
  if (typeof contactEmail === 'string') result.contactEmail = contactEmail;
  if (typeof contactPhone === 'string') result.contactPhone = contactPhone;
  const teamContacts = { ...(existing.teamContacts || {}), ...privateTeamContacts(root) };
  if (Object.keys(teamContacts).length) result.teamContacts = teamContacts;
  if (root.individualRecruits && typeof root.individualRecruits === 'object' && !Array.isArray(root.individualRecruits)) {
    result.individualRecruits = { ...(existing.individualRecruits || {}), ...root.individualRecruits };
  }
  if (typeof result.scorekeeperPinHash === 'string' && !result.scorekeeperPinHash.startsWith('hmac-sha256:v1:')) delete result.scorekeeperPinHash;
  if (updates.scorekeeperPin) result.scorekeeperPinHash = pinHash(leagueIdValue, updates.scorekeeperPin);
  else if (typeof root.scorekeeperPin === 'string' && root.scorekeeperPin) result.scorekeeperPinHash = pinHash(leagueIdValue, root.scorekeeperPin);
  return result;
}

function rootSensitiveDeletes(): Record<string, unknown> {
  return Object.fromEntries(SENSITIVE_ROOT_FIELDS.map(field => [field, FieldValue.delete()]));
}

function ensureMethod(method: string, action: LeagueLifecycleRequest['action']): void {
  const expected = action === 'edit' || action === 'archive' ? 'PATCH' : action === 'delete' ? 'DELETE' : 'POST';
  if (method !== expected) fail('METHOD_INVALID');
}

async function deleteAuthorityScope(transaction: Transaction, auth: DecodedToken, targetId: string, identity?: CompetitionOperationIdentity) {
  const root = await transaction.get(adminDb.collection('leagues').doc(targetId));
  if (root.exists) return { scope: { leagueId: targetId }, tenantId: undefined };
  // Only the server writes this identity when the root and its operation are
  // committed together. It contains no League data or client-selected tenant.
  const tombstone = await transaction.get(adminDb.collection('leagueLifecycleTombstones').doc(targetId));
  const retained = tombstone.data();
  if (!tombstone.exists || typeof retained?.tenantId !== 'string' || typeof retained.operationId !== 'string') fail('LEAGUE_NOT_FOUND');
  if (identity && retained.operationId !== identity.operationId) fail('Request collision.');
  const tenantId: string = retained.tenantId;
  if (tenantId.startsWith('profile:') && tenantId !== `profile:${auth.uid}`) fail('Forbidden competition mutation.');
  return { scope: tenantId.startsWith('profile:') ? {} : { teamId: tenantId }, tenantId };
}

async function preflight(auth: DecodedToken, input: LeagueLifecycleRequest): Promise<CompetitionAuthority> {
  return adminDb.runTransaction(async transaction => {
    const leagueIds = input.action === 'create'
      ? [undefined]
      : input.action === 'delete'
        ? input.leagues.map(target => target.leagueId)
        : [input.leagueId];
    if (auth.signInProvider === 'anonymous') {
      if (input.action !== 'edit') fail('ANONYMOUS_DEMO_MUTATION_FORBIDDEN');
      const demo = await transaction.get(adminDb.collection('leagues').doc(input.leagueId));
      const data = demo.data() || {};
      if (!demo.exists || data.isDemo !== true || data.demoSeeded !== true || data.demoSessionOwnerId !== auth.uid || data.tenantId !== `profile:${auth.uid}`) {
        fail('ANONYMOUS_DEMO_MUTATION_FORBIDDEN');
      }
    }
    const authorities = await Promise.all(leagueIds.map(async id => {
      const retained = input.action === 'delete' ? await deleteAuthorityScope(transaction, auth, id!) : null;
      const authority = await resolveCompetitionAuthority({
        db: adminDb,
        transaction,
        actorUid: auth.uid,
        actorRole: auth.role,
        ...(retained?.scope ?? { teamId: input.action === 'create' ? input.teamId : undefined, leagueId: id }),
      });
      if (retained?.tenantId && authority.tenantId !== retained.tenantId) fail('LEAGUE_TENANT_CONFLICT');
      return authority;
    }));
    if (authorities.some(candidate => candidate.tenantId !== authorities[0].tenantId)) fail('TENANT_TOPOLOGY_INVALID');
    return authorities[0];
  });
}

async function assertCurrentAuthority(
  transaction: Transaction,
  auth: DecodedToken,
  expectedTenantId: string,
  scope: { teamId?: string; leagueId?: string },
): Promise<void> {
  await assertCompetitionMutationAuthority({
    db: adminDb,
    transaction,
    actorUid: auth.uid,
    actorRole: auth.role,
    ...scope,
  });
  const current = await resolveCompetitionAuthority({
    db: adminDb,
    transaction,
    actorUid: auth.uid,
    actorRole: auth.role,
    ...scope,
  });
  if (current.tenantId !== expectedTenantId) fail('LEAGUE_TENANT_CONFLICT');
}

async function tenantOwnerUid(transaction: Transaction, tenantId: string): Promise<string> {
  if (tenantId.startsWith('profile:')) return tenantId.slice('profile:'.length);
  const team = await transaction.get(adminDb.collection('teams').doc(tenantId));
  const ownerUid = team.data()?.ownerUserId;
  if (!team.exists || typeof ownerUid !== 'string' || !ownerUid.trim()) fail('TENANT_OWNER_MISSING');
  return ownerUid.trim();
}

async function existingTenantLeagues(transaction: Transaction, tenantId: string, auth: DecodedToken, ownerUid: string): Promise<QueryDocumentSnapshot[]> {
  const explicit = await transaction.get(adminDb.collection('leagues').where('tenantId', '==', tenantId));
  const legacy = await transaction.get(adminDb.collection('leagues').where('creatorId', '==', ownerUid));
  const deterministicLegacy = await Promise.all(legacy.docs
    .filter(doc => !doc.data().tenantId)
    .map(async doc => {
      try {
        const resolved = await resolveCompetitionAuthority({
          db: adminDb,
          transaction,
          actorUid: auth.uid,
          actorRole: auth.role,
          leagueId: doc.id,
        });
        return resolved.tenantId === tenantId ? doc : null;
      } catch {
        // Ambiguous or unauthorized legacy records cannot be assigned to this tenant.
        return null;
      }
    }));
  return [...new Map([...explicit.docs, ...deterministicLegacy.filter((doc): doc is QueryDocumentSnapshot => doc !== null)]
    .map(doc => [doc.id, doc])).values()];
}

function assertIdentityAvailable(leagues: QueryDocumentSnapshot[], name: string, divisionTitle: string, excludeId?: string): void {
  if (leagues.some(league => league.id !== excludeId && nameKey(league.data().name) === nameKey(name) && nameKey(league.data().divisionTitle) === nameKey(divisionTitle))) {
    fail(divisionTitle ? 'DIVISION_ALREADY_EXISTS' : 'LEAGUE_ALREADY_EXISTS');
  }
}

function assertVersion(league: DocumentData, expected: number): void {
  if (currentVersion(league) !== expected) fail('LEAGUE_VERSION_CONFLICT');
}

function audit(transaction: Transaction, identity: CompetitionOperationIdentity, input: LeagueLifecycleRequest, tenantId: string, actorUid: string, leagueIdValue: string): void {
  transaction.create(adminDb.collection('leagueLifecycleAudits').doc(identity.operationId), {
    operationId: identity.operationId,
    requestId: identity.requestId,
    actorUid,
    tenantId,
    leagueId: leagueIdValue,
    action: input.action,
    createdAt: new Date().toISOString(),
  });
}

function deleteAudit(transaction: Transaction, identity: CompetitionOperationIdentity, tenantId: string, actorUid: string, leagueIdValue: string, index: number): void {
  transaction.create(adminDb.collection('leagueLifecycleAudits').doc(`${identity.operationId}_${index}`), {
    operationId: identity.operationId,
    requestId: identity.requestId,
    actorUid,
    tenantId,
    leagueId: leagueIdValue,
    action: 'delete',
    createdAt: new Date().toISOString(),
  });
}

async function mutateCreate(auth: DecodedToken, input: Extract<LeagueLifecycleRequest, { action: 'create' }>, authority: CompetitionAuthority, identity: CompetitionOperationIdentity) {
  const generated = adminDb.collection('leagues').doc();
  const createdLeagueId = `league_${generated.id}`;
  return runCompetitionOperation({ db: adminDb, actorUid: auth.uid, identity }, async ({ transaction }) => {
    await assertCurrentAuthority(transaction, auth, authority.tenantId, { teamId: input.teamId });
    const ownerUid = await tenantOwnerUid(transaction, authority.tenantId);
    const profileRef = adminDb.collection('users').doc(ownerUid);
    const profile = await transaction.get(profileRef);
    if (!profile.exists) fail('OWNER_PROFILE_MISSING');
    const team = input.teamId ? await transaction.get(adminDb.collection('teams').doc(input.teamId)) : null;
    const leagues = await existingTenantLeagues(transaction, authority.tenantId, auth, ownerUid);
    assertIdentityAvailable(leagues, input.name, input.divisionTitle || '');
    const nameReservation = adminDb.collection('leagueLifecycleNames').doc(reservationId(authority.tenantId, input.name, input.divisionTitle || ''));
    if ((await transaction.get(nameReservation)).exists) fail(input.divisionTitle ? 'DIVISION_ALREADY_EXISTS' : 'LEAGUE_ALREADY_EXISTS');
    const groups = new Set(leagues.map(league => nameKey(league.data().name)).filter(Boolean));
    if (!groups.has(nameKey(input.name)) && auth.role !== 'superadmin' && groups.size >= accountCreationLimit(profile.data())) fail('LEAGUE_LIMIT_REACHED');
    const now = new Date().toISOString();
    transaction.create(nameReservation, {
      tenantId: authority.tenantId, leagueId: createdLeagueId, nameKey: nameKey(input.name), divisionKey: nameKey(input.divisionTitle || ''), createdAt: now,
    });
    transaction.create(adminDb.collection('leagues').doc(createdLeagueId), {
      id: createdLeagueId, name: input.name, divisionTitle: input.divisionTitle || '', creatorId: ownerUid, billingOwnerUserId: ownerUid,
      tenantId: authority.tenantId, lifecycleVersion: 1, sensitiveFieldsMigrated: true, sport: input.sport || team?.data()?.sport || 'General',
      teams: input.teamId ? { [input.teamId]: { teamName: team?.data()?.teamName || team?.data()?.name || 'Team', teamLogoUrl: team?.data()?.teamLogoUrl || '', wins: 0, losses: 0, ties: 0, points: 0, status: 'accepted' } } : {},
      memberTeamIds: input.teamId ? [input.teamId] : [], memberUserIds: [...new Set([ownerUid, auth.uid])], memberIndivIds: [],
      finances: {}, inviteCode: createdLeagueId.slice(-6).toUpperCase(), createdAt: now, isArchived: false,
      is_active: false, schedule: [], deploymentStatus: 'undeployed',
    });
    if (input.teamId) transaction.update(adminDb.collection('teams').doc(input.teamId), { [`leagueIds.${createdLeagueId}`]: true });
    audit(transaction, identity, input, authority.tenantId, auth.uid, createdLeagueId);
    return { action: 'create' as const, leagueId: createdLeagueId, lifecycleVersion: 1 };
  });
}

async function mutateClone(auth: DecodedToken, input: Extract<LeagueLifecycleRequest, { action: 'clone' }>, authority: CompetitionAuthority, identity: CompetitionOperationIdentity) {
  const generated = adminDb.collection('leagues').doc();
  const clonedLeagueId = `league_${generated.id}`;
  return runCompetitionOperation({ db: adminDb, actorUid: auth.uid, identity }, async ({ transaction }) => {
    await assertCurrentAuthority(transaction, auth, authority.tenantId, { leagueId: input.leagueId });
    const sourceRef = adminDb.collection('leagues').doc(input.leagueId);
    const sourceSnapshot = await transaction.get(sourceRef);
    if (!sourceSnapshot.exists) fail('LEAGUE_NOT_FOUND');
    const sourcePrivate = await transaction.get(sourceRef.collection('private').doc('lifecycle'));
    const configs = await transaction.get(sourceRef.collection('registration'));
    const ownerUid = await tenantOwnerUid(transaction, authority.tenantId);
    const profile = await transaction.get(adminDb.collection('users').doc(ownerUid));
    if (!profile.exists) fail('OWNER_PROFILE_MISSING');
    const leagues = await existingTenantLeagues(transaction, authority.tenantId, auth, ownerUid);
    const source = { id: sourceSnapshot.id, ...(sourceSnapshot.data() || {}) } as Record<string, unknown> & { id: string; name: string; divisionTitle?: string };
    if (source.isArchived === true) fail('LEAGUE_LIFECYCLE_STATE_CONFLICT');
    const existingLeagues = leagues.map(league => ({ id: league.id, ...league.data() }));
    if (auth.role !== 'superadmin') assertLeagueCloneCapacity({ destination: input.destination, existingLeagues, leagueLimit: accountCreationLimit(profile.data()) });
    const cloneIdentity = resolveLeagueCloneIdentity({ source, destination: input.destination, requestedName: input.name, existingLeagues });
    const nameReservation = adminDb.collection('leagueLifecycleNames').doc(reservationId(authority.tenantId, cloneIdentity.name, cloneIdentity.divisionTitle));
    if ((await transaction.get(nameReservation)).exists) fail(cloneIdentity.divisionTitle ? 'DIVISION_ALREADY_EXISTS' : 'LEAGUE_ALREADY_EXISTS');
    const now = new Date().toISOString();
    const cloneRef = adminDb.collection('leagues').doc(clonedLeagueId);
    transaction.create(nameReservation, {
      tenantId: authority.tenantId, leagueId: clonedLeagueId, nameKey: nameKey(cloneIdentity.name), divisionKey: nameKey(cloneIdentity.divisionTitle), createdAt: now,
    });
    transaction.create(cloneRef, { ...buildLeagueCloneDocument({ source, leagueId: clonedLeagueId, actorUid: auth.uid, ownerUid, identity: cloneIdentity, now }), tenantId: authority.tenantId, lifecycleVersion: 1, sensitiveFieldsMigrated: true });
    const clonePrivate = buildLeagueClonePrivateDocument({ source: { ...source, ...(sourcePrivate.data() || {}) } });
    if (Object.keys(clonePrivate).length) transaction.set(cloneRef.collection('private').doc('lifecycle'), clonePrivate);
    for (const config of configs.docs) transaction.set(cloneRef.collection('registration').doc(config.id), { ...config.data(), is_active: false });
    if (!source.tenantId) transaction.update(sourceRef, { tenantId: authority.tenantId });
    audit(transaction, identity, input, authority.tenantId, auth.uid, clonedLeagueId);
    return { action: 'clone' as const, ...buildLeagueCloneResult({ leagueId: clonedLeagueId, destination: input.destination, identity: cloneIdentity }), lifecycleVersion: 1 };
  });
}

async function mutateEdit(auth: DecodedToken, input: Extract<LeagueLifecycleRequest, { action: 'edit' }>, authority: CompetitionAuthority, identity: CompetitionOperationIdentity) {
  return withScheduleMutationLock(holder => runCompetitionOperation({ db: adminDb, actorUid: auth.uid, identity, authorizeTransaction: async transaction => {
    await assertScheduleMutationLock(transaction, holder);
    await assertCurrentAuthority(transaction, auth, authority.tenantId, { leagueId: input.leagueId });
  } }, async ({ transaction }) => {
    await assertCurrentAuthority(transaction, auth, authority.tenantId, { leagueId: input.leagueId });
    const rootRef = adminDb.collection('leagues').doc(input.leagueId);
    const ownerUid = await tenantOwnerUid(transaction, authority.tenantId);
    const [snapshot, privateSnapshot, leagues] = await Promise.all([
      transaction.get(rootRef),
      transaction.get(rootRef.collection('private').doc('lifecycle')),
      existingTenantLeagues(transaction, authority.tenantId, auth, ownerUid),
    ]);
    if (!snapshot.exists) fail('LEAGUE_NOT_FOUND');
    const league = snapshot.data() || {};
    if (auth.signInProvider === 'anonymous' && (
      league.isDemo !== true || league.demoSeeded !== true || league.demoSessionOwnerId !== auth.uid ||
      league.tenantId !== `profile:${auth.uid}`
    )) fail('ANONYMOUS_DEMO_MUTATION_FORBIDDEN');
    assertVersion(league, input.expectedVersion);
    const isRestore = Object.keys(input.updates).length === 1 && input.updates.isArchived === false;
    if (league.isArchived === true && !isRestore) fail('LEAGUE_LIFECYCLE_STATE_CONFLICT');
    const nextStart = input.updates.startDate ?? league.startDate;
    const nextEnd = input.updates.endDate ?? league.endDate;
    if (nextStart && nextEnd && nextStart > nextEnd) fail('DATE_RANGE_INVALID');
    const scheduleChanged = [...SCHEDULE_FIELDS].some(field => field in input.updates && JSON.stringify(input.updates[field as keyof LeagueEditableFields]) !== JSON.stringify(league[field] ?? (field === 'blackoutDaysOfWeek' || field === 'divisions' ? [] : undefined))) ||
      Boolean(input.updates.teamUpdate?.publicFields.teamName && input.updates.teamUpdate.publicFields.teamName !== league.teams?.[input.updates.teamUpdate.teamId]?.teamName);
    const hasScheduleState = (Array.isArray(league.schedule) && league.schedule.length > 0) || (league.schedulerConfig && typeof league.schedulerConfig === 'object');
    const clearProjections = scheduleChanged && hasScheduleState ? await prepareLeagueProjectionClear(transaction, input.leagueId) : null;
    if (input.updates.name) assertIdentityAvailable(leagues, input.updates.name, String(league.divisionTitle || ''), input.leagueId);
    const renamedReservation = input.updates.name && nameKey(input.updates.name) !== nameKey(league.name)
      ? adminDb.collection('leagueLifecycleNames').doc(reservationId(authority.tenantId, input.updates.name, String(league.divisionTitle || '')))
      : null;
    if (renamedReservation && (await transaction.get(renamedReservation)).exists) fail('LEAGUE_ALREADY_EXISTS');
    if (renamedReservation && auth.role !== 'superadmin') {
      const beforeGroups = new Set(leagues.map(candidate => nameKey(candidate.data().name)).filter(Boolean));
      const afterGroups = new Set(leagues.map(candidate => nameKey(candidate.id === input.leagueId ? input.updates.name : candidate.data().name)).filter(Boolean));
      if (afterGroups.size > beforeGroups.size) {
        const profile = await transaction.get(adminDb.collection('users').doc(ownerUid));
        if (!profile.exists) fail('OWNER_PROFILE_MISSING');
        if (afterGroups.size > accountCreationLimit(profile.data())) fail('LEAGUE_LIMIT_REACHED');
      }
    }
    const publicUpdates = Object.fromEntries(Object.entries(input.updates).filter(([key]) => ![
      'scorekeeperPin', 'contactEmail', 'contactPhone', 'teamUpdate', 'individualRecruitUpdate',
    ].includes(key)));
    const nextVersion = input.expectedVersion + 1;
    const safeTeams = memberSafeTeams(league);
    if (input.updates.teamUpdate) {
      const { teamId: teamIdValue, publicFields: teamPublic } = input.updates.teamUpdate;
      safeTeams[teamIdValue] = { ...(safeTeams[teamIdValue] || {}), ...teamPublic };
    }
    clearProjections?.();
    transaction.update(rootRef, {
      ...publicUpdates,
      ...(clearProjections ? { ...prepareLeagueScheduleClearUpdates('clear', auth.uid, new Date().toISOString()), schedulerConfig: FieldValue.delete() } : {}),
      ...rootSensitiveDeletes(),
      ...((league.teams && typeof league.teams === 'object' && !Array.isArray(league.teams)) || input.updates.teamUpdate ? { teams: safeTeams } : {}),
      sensitiveFieldsMigrated: true,
      billingOwnerUserId: ownerUid,
      tenantId: authority.tenantId,
      lifecycleVersion: nextVersion,
      updatedAt: new Date().toISOString(),
    });
    const nextPrivate = privateFields(input.leagueId, league, privateSnapshot.data() || {}, input.updates);
    if (input.updates.teamUpdate) {
      const { teamId: teamIdValue, privateFields: teamPrivate } = input.updates.teamUpdate;
      nextPrivate.teamContacts = {
        ...(nextPrivate.teamContacts || {}),
        [teamIdValue]: { ...(nextPrivate.teamContacts?.[teamIdValue] || {}), ...teamPrivate },
      };
    }
    if (input.updates.individualRecruitUpdate) {
      const { recruitId, recruit } = input.updates.individualRecruitUpdate;
      nextPrivate.individualRecruits = { ...(nextPrivate.individualRecruits || {}), [recruitId]: recruit };
    }
    if (Object.keys(nextPrivate).length) transaction.set(rootRef.collection('private').doc('lifecycle'), nextPrivate);
    if (input.updates.name && renamedReservation) {
      transaction.create(renamedReservation, {
        tenantId: authority.tenantId, leagueId: input.leagueId, nameKey: nameKey(input.updates.name), divisionKey: nameKey(league.divisionTitle), createdAt: new Date().toISOString(),
      });
      transaction.delete(adminDb.collection('leagueLifecycleNames').doc(reservationId(authority.tenantId, String(league.name || ''), String(league.divisionTitle || ''))));
    }
    audit(transaction, identity, input, authority.tenantId, auth.uid, input.leagueId);
    return { action: 'edit' as const, leagueId: input.leagueId, lifecycleVersion: nextVersion };
  }));
}

async function mutateArchive(auth: DecodedToken, input: Extract<LeagueLifecycleRequest, { action: 'archive' }>, authority: CompetitionAuthority, identity: CompetitionOperationIdentity) {
  return runCompetitionOperation({ db: adminDb, actorUid: auth.uid, identity }, async ({ transaction }) => {
    await assertCurrentAuthority(transaction, auth, authority.tenantId, { leagueId: input.leagueId });
    const rootRef = adminDb.collection('leagues').doc(input.leagueId);
    const [snapshot, privateSnapshot] = await Promise.all([transaction.get(rootRef), transaction.get(rootRef.collection('private').doc('lifecycle'))]);
    if (!snapshot.exists) fail('LEAGUE_NOT_FOUND');
    const league = snapshot.data() || {};
    const ownerUid = await tenantOwnerUid(transaction, authority.tenantId);
    assertVersion(league, input.expectedVersion);
    if (league.isArchived === true) fail('LEAGUE_LIFECYCLE_STATE_CONFLICT');
    const nextVersion = input.expectedVersion + 1;
    transaction.update(rootRef, {
      isArchived: true,
      tenantId: authority.tenantId,
      lifecycleVersion: nextVersion,
      archivedAt: new Date().toISOString(),
      ...rootSensitiveDeletes(),
      ...(league.teams && typeof league.teams === 'object' && !Array.isArray(league.teams) ? { teams: memberSafeTeams(league) } : {}),
      sensitiveFieldsMigrated: true,
      billingOwnerUserId: ownerUid,
    });
    const nextPrivate = privateFields(input.leagueId, league, privateSnapshot.data() || {});
    if (Object.keys(nextPrivate).length) transaction.set(rootRef.collection('private').doc('lifecycle'), nextPrivate);
    audit(transaction, identity, input, authority.tenantId, auth.uid, input.leagueId);
    return { action: 'archive' as const, leagueId: input.leagueId, lifecycleVersion: nextVersion };
  });
}

async function mutateDelete(auth: DecodedToken, input: Extract<LeagueLifecycleRequest, { action: 'delete' }>, authority: CompetitionAuthority, identity: CompetitionOperationIdentity) {
  return runCompetitionOperation({
    db: adminDb, actorUid: auth.uid, identity,
    authorizeTransaction: async transaction => {
      await Promise.all(input.leagues.map(async target => {
        const retained = await deleteAuthorityScope(transaction, auth, target.leagueId, identity);
        if (retained.tenantId && retained.tenantId !== authority.tenantId) fail('LEAGUE_TENANT_CONFLICT');
        await assertCurrentAuthority(transaction, auth, authority.tenantId, retained.scope);
      }));
    },
  }, async ({ transaction }) => {
    const records = await Promise.all(input.leagues.map(async target => {
      const rootRef = adminDb.collection('leagues').doc(target.leagueId);
      const [snapshot, registrationEntries, waivers, scores, scoreAudit, payments, invites, divisions, accessRedemptions, configs, privateDocs, bookings, events] = await Promise.all([
        transaction.get(rootRef),
        transaction.get(rootRef.collection('registrationEntries').limit(1)),
        transaction.get(rootRef.collection('archived_waivers').limit(1)),
        transaction.get(rootRef.collection('scores').limit(1)),
        transaction.get(rootRef.collection('scoreAudit').limit(1)),
        transaction.get(rootRef.collection('payments').limit(1)),
        transaction.get(rootRef.collection('invites').limit(1)),
        transaction.get(rootRef.collection('divisions').limit(1)),
        transaction.get(rootRef.collection('accessRedemptions').limit(1)),
        transaction.get(rootRef.collection('registration')),
        transaction.get(rootRef.collection('private')),
        transaction.get(adminDb.collection('scheduleBookings').where('leagueId', '==', target.leagueId).limit(1)),
        transaction.get(adminDb.collectionGroup('events').where('leagueId', '==', target.leagueId).limit(1)),
      ]);
      return { target, rootRef, snapshot, registrationEntries, waivers, scores, scoreAudit, payments, invites, divisions, accessRedemptions, configs, privateDocs, bookings, events };
    }));
    for (const record of records) {
      if (!record.snapshot.exists) fail('LEAGUE_NOT_FOUND');
      const league = record.snapshot.data() || {};
      assertVersion(league, record.target.expectedVersion);
      const hasRootDependencies = (Array.isArray(league.schedule) && league.schedule.length > 0) ||
        (Array.isArray(league.memberTeamIds) && league.memberTeamIds.length > 0) ||
        (league.teams && typeof league.teams === 'object' && Object.keys(league.teams).length > 0);
      if (hasRootDependencies || !record.registrationEntries.empty || !record.waivers.empty || !record.scores.empty || !record.scoreAudit.empty || !record.payments.empty || !record.invites.empty || !record.divisions.empty || !record.accessRedemptions.empty || !record.bookings.empty || !record.events.empty) fail('LEAGUE_HAS_DEPENDENCIES');
    }
    records.forEach((record, index) => {
      const league = record.snapshot.data() || {};
      for (const config of record.configs.docs) transaction.delete(config.ref);
      for (const privateDoc of record.privateDocs.docs) transaction.delete(privateDoc.ref);
      transaction.delete(adminDb.collection('publicLeagueViews').doc(record.target.leagueId));
      transaction.delete(adminDb.collection('leagueLifecycleNames').doc(reservationId(authority.tenantId, String(league.name || ''), String(league.divisionTitle || ''))));
      if (!authority.tenantId.startsWith('profile:')) transaction.update(adminDb.collection('teams').doc(authority.tenantId), { [`leagueIds.${record.target.leagueId}`]: FieldValue.delete() });
      transaction.create(adminDb.collection('leagueLifecycleTombstones').doc(record.target.leagueId), {
        tenantId: authority.tenantId,
        operationId: identity.operationId,
      });
      transaction.delete(record.rootRef);
      deleteAudit(transaction, identity, authority.tenantId, auth.uid, record.target.leagueId, index);
    });
    return { action: 'delete' as const, leagueId: records[0].target.leagueId, deleted: true, deletedLeagueIds: records.map(record => record.target.leagueId) };
  });
}

async function handle(request: NextRequest): Promise<NextResponse> {
  const authResult = await verifyFirebaseToken(request);
  if (authResult instanceof Response) return authResult as NextResponse;
  try {
    const body = await readJsonBodyWithLimit<Record<string, unknown>>(request, 12_000);
    const input = parseRequest(body);
    ensureMethod(request.method, input.action);
    if (authResult.signInProvider === 'anonymous' && input.action !== 'edit') fail('ANONYMOUS_DEMO_MUTATION_FORBIDDEN');
    const authority = await preflight(authResult, input);
    const identity = canonicalCompetitionRequest({ requestId: input.requestId, tenantId: authority.tenantId, kind: `league.${input.action}`, payload: input });
    const result = input.action === 'create'
      ? await mutateCreate(authResult, input, authority, identity)
      : input.action === 'clone'
        ? await mutateClone(authResult, input, authority, identity)
        : input.action === 'edit'
          ? await mutateEdit(authResult, input, authority, identity)
          : input.action === 'archive'
            ? await mutateArchive(authResult, input, authority, identity)
            : await mutateDelete(authResult, input, authority, identity);
    return NextResponse.json(result, { status: input.action === 'create' || input.action === 'clone' ? 201 : 200 });
  } catch (error) {
    if (error instanceof ScheduleDeploymentError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof RequestBodyError) return NextResponse.json({ error: error.message }, { status: error.status });
    const code = error instanceof Error ? error.message : 'LEAGUE_LIFECYCLE_FAILED';
    if (code.includes('Forbidden competition mutation') || code === 'ANONYMOUS_DEMO_MUTATION_FORBIDDEN') return NextResponse.json({ error: 'You do not have permission to manage this league.' }, { status: 403 });
    if (['Request collision.', 'LEAGUE_VERSION_CONFLICT', 'LEAGUE_TENANT_CONFLICT', 'LEAGUE_LIFECYCLE_STATE_CONFLICT', 'LEAGUE_HAS_DEPENDENCIES', 'SCHEDULE_MUTATION_BOUNDARY_REQUIRED', 'DIVISION_ALREADY_EXISTS', 'LEAGUE_ALREADY_EXISTS', 'LEAGUE_LIMIT_REACHED'].includes(code)) {
      return NextResponse.json({ error: code }, { status: 409 });
    }
    if (code === 'LEAGUE_NOT_FOUND') return NextResponse.json({ error: 'League not found.' }, { status: 404 });
    if (code === 'OWNER_PROFILE_MISSING' || code === 'TENANT_OWNER_MISSING') return NextResponse.json({ error: 'Account profile is incomplete.' }, { status: 409 });
    if (code.startsWith('Invalid competition ')) return NextResponse.json({ error: 'One or more request fields are invalid.' }, { status: 400 });
    if (code.endsWith('_INVALID') || code.endsWith('_REQUIRED')) return NextResponse.json({ error: 'One or more league fields are invalid.' }, { status: 400 });
    console.error('[leagues/lifecycle] Failed:', error);
    return NextResponse.json({ error: 'Unable to update the league.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) { return handle(request); }
export async function PATCH(request: NextRequest) { return handle(request); }
export async function DELETE(request: NextRequest) { return handle(request); }
