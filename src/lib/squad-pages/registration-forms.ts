import { createHash } from 'node:crypto';
import { permitsLegacyOrPaidPortals } from '@/lib/public-portal-data';
import { isCalendarDateCurrent } from '@/lib/registration-policy';
import type { EntityRef } from './model';
import type { Data, Scope } from './store';
export type PageRegistrationForm = { id: string; label: string; url: string; active: boolean };
const publicRecord = (d: Data) => d.isArchived !== true && d.isDeleted !== true && d.isActive !== false && d.is_active !== false && d.isPublic !== false && d.isPublished !== false && !['private', 'draft', 'members', 'internal'].includes(String(d.visibility || '').toLowerCase()) && !['draft', 'private', 'deleted', 'removed', 'cancelled'].includes(String(d.status || '').toLowerCase());
const scopedId = (...parts: string[]) => 'form_' + createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 32);
function accepting(parent: Data, config: Data, ordinary: boolean, now: number) {
  if (parent.registrationOpen === false) return false;
  if (!ordinary && parent.registrationCloseAt) { const end = Date.parse(parent.registrationCloseAt); if (!Number.isFinite(end) || end <= now) return false; }
  const teamPipeline = !ordinary && parent.isTournament === true && (config.type === 'team' || config.id === 'team_config');
  if (teamPipeline && Array.isArray(parent.tournamentGames) && parent.tournamentGames.length > 0) return false;
  const raw = ordinary ? parent.registrationCapacity ?? parent.maxRegistrations ?? parent.capacity ?? 0 : (teamPipeline ? undefined : config.max_registrations) ?? parent.registrationCapacity ?? parent.maxRegistrations ?? 0;
  const capacity = Number(raw), count = ordinary ? parent.registrationCount : parent.registrationEntryCount;
  if (!Number.isInteger(capacity) || capacity < 0 || capacity > 100000) return false;
  // Unknown legacy counts are evaluated by the existing submission transaction, never assumed zero here.
  if (count != null && (!Number.isInteger(Number(count)) || Number(count) < 0 || (capacity > 0 && Number(count) >= capacity))) return false;
  return true;
}
/** Discover references only. Never read entrants, copy form schemas, or create submission storage. */
export async function pageRegistrationForms(scope: Scope, ref: EntityRef, entity: Data, team: Data | null, now: number): Promise<PageRegistrationForm[]> {
  const result: PageRegistrationForm[] = [], seen = new Set<string>();
  function add(form: PageRegistrationForm) { if (!seen.has(form.url)) { seen.add(form.url); result.push(form); } }
  async function league(leagueId: string, data: Data, qualified: boolean) {
    if (!publicRecord(data)) return;
    const ownerId = data.billingOwnerUserId || data.creatorId;
    const owner = typeof ownerId === 'string' ? await scope.get(`users/${ownerId}`) : null;
    if (!owner || !permitsLegacyOrPaidPortals(owner.planId, owner.plan_type, owner.subscriptionPlanId)) return;
    for (const form of await scope.list(`leagues/${leagueId}/registration`)) if (form.is_active === true && publicRecord(form)) add({ id: qualified ? scopedId('league', leagueId, form.id) : form.id, label: String(form.title || form.name || 'Register'), url: `/register/league/${leagueId}?protocol=${encodeURIComponent(form.id)}`, active: accepting(data, form, false, now) });
  }
  async function tournament(teamId: string, eventId: string, data: Data, qualified: boolean) {
    if (!team || !publicRecord(team) || !publicRecord(data) || data.isTournament !== true || (data.teamId && data.teamId !== teamId) || !permitsLegacyOrPaidPortals(team.planId, team.plan_type, team.subscriptionPlanId)) return;
    // Registration can open before schedule publication; don't apply spectator-only competition gates.
    for (const form of await scope.list(`teams/${teamId}/events/${eventId}/registration`)) if (form.is_active === true && publicRecord(form)) add({ id: qualified ? scopedId('tournament', teamId, eventId, form.id) : form.id, label: qualified ? `${data.title || 'Tournament'} · ${form.title || form.name || 'Register'}` : String(form.title || form.name || 'Register'), url: `/register/tournament/${teamId}/${eventId}?protocol=${encodeURIComponent(form.id)}`, active: data.registrationOpen === true && accepting(data, form, false, now) });
  }
  if (ref.kind === 'league') await league(ref.id, entity, false);
  else if (ref.kind === 'tournament') await tournament(ref.teamId!, ref.id, entity, false);
  else if (['team', 'program', 'school'].includes(ref.kind) && team && publicRecord(team)) {
    const teamId = ref.id, paid = permitsLegacyOrPaidPortals(team.planId, team.plan_type, team.subscriptionPlanId);
    const candidates = new Map<string, Data & { id: string }>();
    for (const field of ['registrationOpen', 'isTournament']) for (const event of await scope.list(`teams/${teamId}/events`, field, true)) candidates.set(event.id, event);
    for (const event of candidates.values()) {
      if (event.isTournament === true) await tournament(teamId, event.id, event, true);
      else if (paid && publicRecord(event) && (!event.teamId || event.teamId === teamId) && event.registrationOpen === true && isCalendarDateCurrent(event.endDate || event.date, now)) add({ id: scopedId('event', teamId, event.id), label: String(event.title || 'Event registration'), url: `/events/register/${teamId}?eventId=${encodeURIComponent(event.id)}`, active: accepting(event, {}, true, now) });
    }
    // This exact tenant relationship is the same one used by the existing team Leagues screen.
    for (const linked of await scope.list('leagues', 'tenantId', teamId)) await league(linked.id, linked, true);
  }
  return result.sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
}
