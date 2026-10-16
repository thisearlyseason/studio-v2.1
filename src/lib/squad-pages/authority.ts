import { pageRegistrationForms } from './registration-forms';
import { hasCurrentPaidSubscription } from '@/lib/native-billing/entitlements';
import { canonicalPlanId } from '@/lib/plan-catalog';
import { isBillableSquadSeat } from '@/lib/team-seat-policy';
import { EntityRef, PageError, entityKey } from './model';
import type { Scope, Data } from './store';
export type Actor = { uid: string; role?: string };
export type EntityContext = { ref: EntityRef; key: string; name: string; ownerId: string; organizationId: string; canManage: boolean; canApprove: boolean; canSetPolicy: boolean; covered: boolean; coverageReason: string; coverageEndedAt: string | null; usesExistingNativeGrace: boolean; resources: { id: string; label: string; url: string }[]; forms: { id: string; label: string; url: string; active: boolean }[]; directory: { name: string; url: string }[]; };
const active = (d: Data | null) => Boolean(d && d.status !== 'removed' && d.status !== 'deleted' && d.isDeleted !== true && d.isArchived !== true && d.isActive !== false && d.is_active !== false);
const includes = (v: unknown, uid: string) => Array.isArray(v) && v.includes(uid);
async function member(scope: Scope, teamId: string, actor?: Actor) { if (!actor) return null; const direct = await scope.get(`teams/${teamId}/members/${actor.uid}`); if (active(direct) && (!direct!.userId || direct!.userId === actor.uid)) return direct; return (await scope.list(`teams/${teamId}/members`, 'userId', actor.uid)).find(active) || null; }
export async function resolvePageEntity(scope: Scope, ref: EntityRef, actor?: Actor, now = Date.now()): Promise<EntityContext> {
  let entity: Data | null = null, team: Data | null = null, teamId = '', ownerId = '', organizationId = '', organization: Data | null = null;
  if (['team', 'school', 'program'].includes(ref.kind)) { teamId = ref.id; team = await scope.get(`teams/${teamId}`); entity = team; if (ref.kind === 'team' && team && !isBillableSquadSeat(team)) throw new PageError('Select the school or organization context.', 400); if (ref.kind === 'school' && !['school', 'school_hub'].includes(String(team?.type || ''))) throw new PageError('School not found.', 404); if (ref.kind === 'program' && (!team?.schoolId || !isBillableSquadSeat(team))) throw new PageError('Select a school program squad.', 404); ownerId = team?.ownerUserId || ''; }
  else if (ref.kind === 'tournament') { teamId = ref.teamId!; team = await scope.get(`teams/${teamId}`); entity = await scope.get(`teams/${teamId}/events/${ref.id}`); if (!entity?.isTournament) throw new PageError('Tournament not found.', 404); ownerId = team?.ownerUserId || ''; }
  else if (ref.kind === 'league') { entity = await scope.get(`leagues/${ref.id}`); ownerId = entity?.billingOwnerUserId || entity?.creatorId || ''; const tenant = entity?.tenantId || entity?.hostTeamId || entity?.ownerTeamId || entity?.teamId; if (typeof tenant === 'string' && !tenant.startsWith('profile:')) { teamId = tenant; team = await scope.get(`teams/${teamId}`); } }
  else { const club = await scope.get(`clubs/${ref.id}`); ownerId = club?.ownerUserId || ref.id; if (club && ownerId !== ref.id) throw new PageError('This club alias has no verified canonical organization binding.', 409); const user = await scope.get(`users/${ownerId}`); if (!club && (!user || (!user.clubName && !['elite', 'league'].includes(canonicalPlanId(user.plan_type))))) throw new PageError('Club not found.', 404); entity = club || { name: user!.clubName || 'Club', ownerUserId: ownerId }; }
  if (!active(entity) || (teamId && !active(team))) throw new PageError('Entity unavailable.', 404);
  const hubId = team?.organizationHubId || team?.schoolId;
  if (hubId) { organization = await scope.get(`teams/${hubId}`); if (!active(organization)) throw new PageError('Organization unavailable.', 404); organizationId = `school~${hubId}`; }
  const billingOwner = organization?.ownerUserId || team?.organizationOwnerUserId || ownerId;
  // Legacy/incomplete entities must not turn one unusable record into an inventory-wide 500.
  if (typeof billingOwner !== 'string' || !billingOwner || billingOwner.includes('/')) throw new PageError('Entity billing owner is unavailable.', 409);
  ownerId = ownerId || billingOwner;
  const owner = await scope.get(`users/${billingOwner}`); const plan = canonicalPlanId(owner?.plan_type);
  if (!organizationId) organizationId = ref.kind === 'school' ? `school~${ref.id}` : ['elite', 'league'].includes(plan) || team?.clubId ? `club~${billingOwner}` : entityKey(ref);
  const superadmin = actor?.role === 'superadmin'; const uid = actor?.uid || '';
  const own = Boolean(uid && (ownerId === uid || (ref.kind === 'league' && entity!.creatorId === uid)));
  const orgAdmin = Boolean(uid && ((ref.kind === 'school' && (includes(team?.schoolAdminIds, uid) || includes(team?.organizationAdminIds, uid))) || organization?.ownerUserId === uid || includes(organization?.schoolAdminIds, uid) || includes(organization?.organizationAdminIds, uid) || (billingOwner === uid && ['elite', 'league', 'school'].includes(plan))));
  const m = teamId ? await member(scope, teamId, actor) : null;
  const teamAdmin = Boolean((m && String(m.role || '').toLowerCase() === 'admin') || (uid && (includes(team?.schoolAdminIds, uid) || includes(team?.organizationAdminIds, uid))));
  // Draft access is independent of paid coverage. These roles grant page rights only.
  const canManage = Boolean(actor && (superadmin || own || orgAdmin || teamAdmin));
  const canApprove = Boolean(actor && (superadmin || orgAdmin || (organizationId === entityKey(ref) && own) || (['club', 'school', 'league'].includes(ref.kind) && own)));
  const canSetPolicy = Boolean(actor && (superadmin || orgAdmin || (organizationId === entityKey(ref) && own)));
  let covered = Boolean(['team', 'elite', 'league', 'school'].includes(plan) && owner && owner.isDemo !== true && team?.isDemo !== true && hasCurrentPaidSubscription(owner, now));
  if (ref.kind === 'club') covered = covered && ['elite', 'league'].includes(plan);
  else if (ref.kind === 'school') covered = covered && plan === 'school';
  else if (ref.kind === 'league' && !team) covered = covered && ['league', 'school'].includes(plan) && entity!.creatorId === billingOwner;
  else covered = covered && Boolean(team?.isPro === true && ['team', 'elite', 'league', 'school'].includes(canonicalPlanId(team?.planId)));
  if (covered && team && isBillableSquadSeat(team)) {
    const owned = await scope.list('teams', 'ownerUserId', billingOwner);
    const allocated = owned.filter(t => active(t) && t.isPro === true && isBillableSquadSeat(t));
    const limit = Number(owner?.team_limit ?? owner?.proTeamLimit ?? 0);
    covered = allocated.some(t => t.id === teamId && (!hubId || t.schoolId === hubId || t.organizationHubId === hubId)) && Number.isInteger(limit) && limit > 0 && allocated.length <= limit;
  }
  if (ref.kind === 'tournament' && entity!.status === 'cancelled') covered = false;
  const forms = await pageRegistrationForms(scope, ref, entity!, team, now);
  const resources: EntityContext['resources'] = ref.kind === 'league' ? [{ id: 'league-spectator', label: 'Schedules & standings', url: `https://thesquad.pro/leagues/spectator/${ref.id}` }] : ref.kind === 'tournament' ? [{ id: 'tournament-public', label: 'Schedules, brackets & results', url: `https://thesquad.pro/tournaments/public/${ref.teamId}/${ref.id}` }] : [];
  const directory: EntityContext['directory'] = [];
  if (['club', 'school', 'league'].includes(ref.kind)) {
    const allocated = (await scope.list('teams', 'ownerUserId', billingOwner)).filter(t => active(t) && t.isPro === true && isBillableSquadSeat(t));
    const squads = allocated.filter(t => ref.kind !== 'school' || t.schoolId === ref.id || t.organizationHubId === ref.id);
    const limit = Number(owner?.team_limit ?? owner?.proTeamLimit ?? 0);
    const directoryCovered = ['team', 'elite', 'league', 'school'].includes(plan) && owner && owner.isDemo !== true && hasCurrentPaidSubscription(owner, now) && Number.isInteger(limit) && limit > 0 && allocated.length <= limit;
    if (directoryCovered) for (const t of squads) {
      if (!['team', 'elite', 'league', 'school'].includes(canonicalPlanId(t.planId)) || t.isDemo === true) continue;
      const page = await scope.get(`squadPagesPrivate/team~${t.id}`);
      if (page?.status === 'published' && page.slug && page.live && page.publicationRevision === page.live.revision) directory.push({ name: String(page.live.content.name || 'Team'), url: `/p/${page.slug}` });
    }
  }
  // Legacy plan synchronization dates do not establish when coverage ended.
  // Observe the transition once and persist it on the page; native billing already applies its own grace.
  const ended = null;
  const canonical = ref.kind === 'club' ? { kind: 'club' as const, id: ownerId } : ref;
  return { ref: canonical, key: entityKey(canonical), name: String(entity!.name || entity!.title || entity!.teamName || 'Squad'), ownerId, organizationId, canManage, canApprove, canSetPolicy, covered, coverageReason: covered ? 'Existing paid allocation verified' : 'Publishing requires current paid coverage and an allocated team/program slot where applicable.', usesExistingNativeGrace: ['app_store', 'play_store'].includes(owner?.billing_provider), coverageEndedAt: typeof ended === 'string' && Number.isFinite(Date.parse(ended)) && Date.parse(ended) <= now ? ended : null, forms, resources, directory };
}
