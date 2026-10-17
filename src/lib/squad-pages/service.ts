import { starterContent, starterImageUrl, ENTITY_LOGO_ID } from './starter-content';
import { sampleImageUrl } from './sample-content';
import { randomUUID } from 'node:crypto';
import { emptyContent, PageContent, PageError, PageRecord, parseEntity, photoIds, validateContent, validateSlug } from './model';
import { Actor, resolvePageEntity, type EntityContext } from './authority';
import type { PageStore, Scope, Data } from './store';
function verifyRegistrationLinks(content: PageContent, forms: { id: string; url: string }[], status: number) {
  const seen = new Set<string>();
  for (const link of content.registrations) if (link.formId || link.url.startsWith('/')) {
    if (!forms.some(f => f.id === link.formId && f.url === link.url)) throw new PageError('Select a currently published registration form for this entity.', status);
    if (seen.has(link.url)) throw new PageError('Select each registration form only once.', 400);
    seen.add(link.url);
  }
}
// Capture public identity media on first save; subsequent entity changes must
// not silently rewrite a saved or published page. Existing records do not adopt defaults.
function contextForPage(context: EntityContext, record: PageRecord | null) {
  return record && context.identity ? { ...context, identity: { ...context.identity, logoUrl: record.identityLogoUrl || '' } } : context;
}
const privatePath = (key: string) => `squadPagesPrivate/${key}`;
const graceMs = () => { const days = Number(process.env.SQUAD_PAGES_GRACE_DAYS ?? 7); return Math.max(0, Math.min(30, Number.isFinite(days) ? days : 7)) * 86400000; };
async function verifyMedia(scope: Scope, key: string, content: PageContent, context: EntityContext) { for (const id of photoIds(content)) { if (sampleImageUrl(id) || starterImageUrl(id, context.identity)) continue; const meta = await scope.get(`squadPageMedia/${key}/items/${id}`); if (!meta || meta.retired === true) throw new PageError('An image is missing or belongs to another entity.', 403); } }
export async function editorState(store: PageStore, entity: unknown, actor: Actor) {
  const ref = parseEntity(entity);
  return store.run(async scope => {
    const context = await resolvePageEntity(scope, ref, actor);
    if (!context.canManage) throw new PageError('Entity administrator access required.', 403);
    const record = await scope.get(privatePath(context.key)) as PageRecord | null;
    const policy = await scope.get(`squadPagePolicies/${context.organizationId}`);
    // A separately inspectable proposal, never merged into an existing revision.
    const proposed = starterContent(context.name, ref.kind, context.identity!);
    proposed.resources = context.resources.map(r => ({ ...r }));
    const openForms = context.forms.filter(f => f.active);
    if (openForms.length === 1) {
      const form = openForms[0];
      proposed.registrations = [{ id: 'linked-registration', formId: form.id, label: form.label, url: form.url }];
    }
    return { context: contextForPage(context, record), record,
      approvalRequired: policy?.directTeamPublication !== true,
      initial: record ? emptyContent(context.name) : structuredClone(proposed),
      startingDesign: { content: proposed, identity: context.identity! } };
  });
}
export async function slugAvailable(store: PageStore, slug: string, entity: unknown, actor: Actor) { validateSlug(slug); const ref = parseEntity(entity); return store.run(async scope => { const ctx = await resolvePageEntity(scope, ref, actor); if (!ctx.canManage) throw new PageError('Entity administrator access required.', 403); const held = await scope.get(`squadPageSlugs/${slug}`); return { available: !held || held.key === ctx.key }; }); }
export async function mutatePage(store: PageStore, actor: Actor, input: Data, now = Date.now()) {
  const ref = parseEntity(input.entity); const expected = input.expectedVersion;
  if (!Number.isInteger(expected) || expected < 0) throw new PageError('A current page version is required.');
  if (!['save', 'submit', 'approve', 'publish', 'unpublish', 'restore', 'policy'].includes(input.action)) throw new PageError('Unsupported page action.');
  return store.run(async scope => {
    const context = await resolvePageEntity(scope, ref, actor, now); const key = context.key; if (!context.canManage) throw new PageError('Entity administrator access required.', 403);
    let record = await scope.get(privatePath(key)) as PageRecord | null;
    if ((record?.version || 0) !== expected) throw new PageError('This page changed. Reload before saving; your local edits have been retained.', 409);
    const policy = await scope.get(`squadPagePolicies/${context.organizationId}`); const timestamp = new Date(now).toISOString();
    if (input.action === 'policy') { if (!context.canSetPolicy || typeof input.direct !== 'boolean') throw new PageError('Organization owner/admin access required.', 403); scope.set(`squadPagePolicies/${context.organizationId}`, { directTeamPublication: input.direct, updatedBy: actor.uid, updatedAt: timestamp }); return { policy: { directTeamPublication: input.direct } }; }
    if (input.action === 'save') {
      const content = validateContent(input.content); await verifyMedia(scope, key, content, contextForPage(context, record));
      // Stored relative form links must match a currently eligible form of this exact entity.
      verifyRegistrationLinks(content, context.forms, 403);
      record = record || { ...(photoIds(content).includes(ENTITY_LOGO_ID) && context.identity?.logoUrl ? { identityLogoUrl: context.identity.logoUrl } : {}), entity: context.ref, key, version: 0, draft: { revision: 0, content, author: actor.uid, savedAt: timestamp }, live: null, previous: null, status: 'draft', slug: null, approval: null, submittedRevision: null, coverageLostAt: null, lastCoveredAt: null, publicationRevision: null };
      record.draft = { revision: record.draft.revision + 1, content, author: actor.uid, savedAt: timestamp }; record.approval = null; record.submittedRevision = null;
    } else {
      if (!record) throw new PageError('Save a draft first.', 409);
      if (input.action === 'submit') record.submittedRevision = record.draft.revision;
      if (input.action === 'approve') { if (!context.canApprove || input.revision !== record.draft.revision || record.submittedRevision !== input.revision) throw new PageError('Approval requires the exact submitted revision and owner/admin authority.', 409); record.approval = { revision: input.revision, by: actor.uid, at: timestamp }; }
      if (input.action === 'unpublish') { record.status = 'unpublished'; record.publicationRevision = null; }
      if (input.action === 'restore') { if (!record.previous) throw new PageError('No previous published revision is available.'); record.draft = { revision: record.draft.revision + 1, content: record.previous.content, author: actor.uid, savedAt: timestamp }; record.approval = null; record.submittedRevision = null; }
      if (input.action === 'publish') {
        if (!context.covered) throw new PageError(context.coverageReason, 403);
        if (input.revision !== record.draft.revision) throw new PageError('Publish the exact saved revision.', 409);
        if (!context.canApprove && policy?.directTeamPublication !== true && record.approval?.revision !== record.draft.revision) throw new PageError('This saved revision needs owner/admin approval.', 403);
        const content = validateContent(record.draft.content); const slug = validateSlug(content.slug); await verifyMedia(scope, key, content, contextForPage(context, record));
        verifyRegistrationLinks(content, context.forms, 409);
        const held = await scope.get(`squadPageSlugs/${slug}`); if (held && held.key !== key) throw new PageError('This address is already in use.', 409);
        if (record.slug && slug !== record.slug) throw new PageError('Published addresses are stable in this release. Keep the existing address.');
        scope.set(`squadPageSlugs/${slug}`, { key }); record.previous = record.live; record.live = structuredClone(record.draft); record.status = 'published'; record.slug = slug; record.publicationRevision = record.live.revision; record.coverageLostAt = null; record.lastCoveredAt = timestamp;
      }
    }
    record.version++; scope.set(privatePath(key), record); return { record };
  });
}
/** Public reads return only an explicitly published revision. Revocation is evaluated before images or content leave the server. */
export async function publicPage(store: PageStore, slug: string, now = Date.now()) {
  validateSlug(slug); return store.run(async scope => {
    const mapping = await scope.get(`squadPageSlugs/${slug}`); if (!mapping) throw new PageError('Page not found.', 404);
    const record = await scope.get(privatePath(mapping.key)) as PageRecord | null; if (!record || record.status !== 'published' || !record.live || record.publicationRevision !== record.live.revision) throw new PageError('Page not found.', 404);
    let context; try { context = await resolvePageEntity(scope, record.entity, undefined, now); } catch (error) { if (!(error instanceof PageError) || error.status !== 404) throw error; record.status = 'expired'; record.publicationRevision = null; record.version++; scope.set(privatePath(record.key), record); return null; }
    const grace = context.usesExistingNativeGrace ? 0 : graceMs();
    if (record.coverageLostAt && !Number.isFinite(Date.parse(record.coverageLostAt))) throw new PageError('Publication state needs administrator review.', 500);
    if (context.covered) { if (record.coverageLostAt || !record.lastCoveredAt) { record.coverageLostAt = null; record.lastCoveredAt = new Date(now).toISOString(); scope.set(privatePath(record.key), record); } }
    else {
      if (!record.coverageLostAt) record.coverageLostAt = context.coverageEndedAt || new Date(now).toISOString();
      if (now >= Date.parse(record.coverageLostAt) + grace) { record.status = 'expired'; record.publicationRevision = null; record.version++; scope.set(privatePath(record.key), record); return null; }
      scope.set(privatePath(record.key), record);
    }
    // Re-read current eligibility for every public request; private/deleted forms never leak saved labels or destinations.
    const seen = new Set<string>();
    const content = { ...record.live.content, registrations: record.live.content.registrations.filter(link => {
      if (!link.formId && !link.url.startsWith('/')) return true;
      if (!context.forms.some(f => f.id === link.formId && f.url === link.url) || seen.has(link.url)) return false;
      seen.add(link.url); return true;
    }) };
    return { identity: contextForPage(context, record).identity, key: record.key, content, revision: record.live.revision, updatedAt: record.live.savedAt, directory: context.directory, forms: context.forms.filter(f => record.live!.content.registrations.some(l => l.formId === f.id)), graceUntil: record.coverageLostAt ? new Date(Date.parse(record.coverageLostAt) + grace).toISOString() : null };
  });
}
export async function reconcilePages(store: PageStore, now = Date.now()) { const slugs = await store.run(scope => scope.list('squadPageSlugs')); let expired = 0; for (const row of slugs) { try { const result = await publicPage(store, row.id, now); if (!result) expired++; } catch (error) { if (!(error instanceof PageError)) throw error; } } return { checked: slugs.length, expired }; }
export const newMediaId = () => randomUUID();
