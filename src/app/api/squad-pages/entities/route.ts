import { NextRequest } from 'next/server';
import { pageActor, pageFailure, pageJSON, fixtureRequest } from '@/lib/squad-pages/http';
import { pageStore } from '@/lib/squad-pages/store';
import { resolvePageEntity } from '@/lib/squad-pages/authority';
import { EntityRef, entityKey, PageError } from '@/lib/squad-pages/model';
export async function GET(req: NextRequest) { try {
  const actor = await pageActor(req); const fixture = fixtureRequest(req); const { previewActors, previewEntities } = await import('@/lib/squad-pages/fixtures');
  const options = await (await pageStore()).run(async scope => {
    const refs: EntityRef[] = [];
    if (fixture) refs.push(...previewEntities.map(x => x.ref));
    else {
      const memberships = await scope.list(`users/${actor.uid}/teamMemberships`); const owned = await scope.list('teams', 'ownerUserId', actor.uid);
      const ids = new Set([...memberships.map(m => m.teamId || m.id), ...owned.map(t => t.id)]);
      for (const id of ids) { const team = await scope.get(`teams/${id}`); if (!team) continue; refs.push({ kind: ['school', 'school_hub'].includes(String(team.type || '')) ? 'school' : team.schoolId ? 'program' : 'team', id }); for (const e of await scope.list(`teams/${id}/events`, 'isTournament', true)) refs.push({ kind: 'tournament', teamId: id, id: e.id }); if (['school', 'school_hub'].includes(String(team.type || '')) && (team.ownerUserId === actor.uid || team.schoolAdminIds?.includes(actor.uid))) for (const child of await scope.list('teams', 'schoolId', id)) refs.push({ kind: 'program', id: child.id }); }
      for (const league of await scope.list('leagues', 'creatorId', actor.uid)) refs.push({ kind: 'league', id: league.id });
      for (const id of ids) for (const league of await scope.list('leagues', 'tenantId', id)) refs.push({ kind: 'league', id: league.id });
      refs.push({ kind: 'club', id: actor.uid });
    }
    const result = []; const seen = new Set<string>();
    for (const ref of refs) { if (seen.has(entityKey(ref))) continue; seen.add(entityKey(ref)); try { const context = await resolvePageEntity(scope, ref, actor); if (context.canManage) result.push({ ref: context.ref, key: context.key, name: context.name, covered: context.covered, canApprove: context.canApprove, kind: ref.kind }); } catch (error) { if (!(error instanceof PageError) || ![400, 403, 404, 409].includes(error.status)) throw error; } }
    return result;
  });
  return pageJSON({ entities: options, localPreview: fixture, actors: fixture ? previewActors : [], currentActor: actor.uid });
} catch (error) { return pageFailure(error); } }
