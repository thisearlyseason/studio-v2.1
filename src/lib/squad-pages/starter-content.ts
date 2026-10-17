import { emptyContent, type EntityKind, type PageContent, type Photo, safeLink, photoIds } from './model';

/** Deliberately small public identity projection. Never accept a roster, member,
 * contact record, internal description or hero/member photo as draft defaults. */
export type PublicIdentity = { sport: string; description: string; primary: string; secondary: string; logoUrl: string };
export const ENTITY_LOGO_ID = 'squad-entity-logo-v1';
export function publicIdentity(entity: Record<string, unknown>): PublicIdentity {
  const text = (value: unknown, max: number) => typeof value === 'string' && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value) ? value.trim() : '';
  const colour = (value: unknown) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : '';
  let logoUrl = '';
  try { logoUrl = safeLink(text(entity.teamLogoUrl, 1000)); } catch { /* Invalid public logo stays absent. */ }
  return { sport: text(entity.sport, 100), description: text(entity.publicDescription, 1200), primary: colour(entity.primaryColor), secondary: colour(entity.secondaryColor), logoUrl };
}
// Static, locally hosted photographs only. Source and reuse evidence travels
// with the assets. These are sporting atmosphere, never this team's athletes.
const photographs: Record<string, string> = {
  'squad-editorial-court-v1': '/squad-pages/editorial/court.webp',
  'squad-editorial-court-detail-v1': '/squad-pages/editorial/court-detail.webp',
  'squad-editorial-field-v1': '/squad-pages/editorial/field.webp',
  'squad-editorial-track-detail-v1': '/squad-pages/editorial/track-detail.webp',
  'squad-editorial-track-v1': '/squad-pages/editorial/track.webp',
};
export function editorialImageUrl(id: string): string { return Object.hasOwn(photographs, id) ? photographs[id] : ''; }
export function hasEditorialImages(c: PageContent) { return photoIds(c).some(id => !!editorialImageUrl(id)); }
export function starterImageUrl(id: string, identity?: PublicIdentity): string {
  return editorialImageUrl(id) || (id === ENTITY_LOGO_ID ? identity?.logoUrl || '' : '');
}
export function starterContent(name: string, kind: EntityKind, identity: PublicIdentity): PageContent {
  const c = emptyContent(name);
  c.template = 'modern';
  c.primary = identity.primary || '#17304a'; c.secondary = identity.secondary || '#f5c451';
  c.galleryLayout = 'mosaic';
  c.headline = `${name}.\nFor the love of the game.`;
  c.intro = `The home of ${name}. Discover our ${kind === 'team' || kind === 'program' ? 'squad' : kind}, explore the game and find your next step.`;
  c.description = `${name}${identity.sport ? ' · ' + identity.sport : ''}. A home for the game and the people who love it.`;
  c.aboutHeading = 'One name. A shared love of sport.';
  c.about = identity.description || `Sport is about more than the final score. It is the anticipation before the game, the effort in every play and the people who make it matter.\n\nWelcome to ${name}. This is a place to discover the squad and stay connected with the game.`;
  const sport = identity.sport.toLowerCase();
  const scene = /basket|netball/.test(sport) ? 'court' : /soccer|football|rugby|lacrosse|hockey|baseball|softball/.test(sport) ? 'field' : 'track';
  const photo = (scene: string): Photo => ({ id: `squad-editorial-${scene}-v1`, alt: `${scene.startsWith('court') ? 'Basketball court' : scene === 'field' ? 'Sports field' : 'Running track'} · editorial sports photography`, caption: scene.startsWith('court') ? 'A different perspective on the game.' : scene === 'field' ? 'Space to play. Room to grow.' : 'Every line is a new beginning.', x: 50, y: 50, overlay: .6 });
  c.hero = photo(scene); c.aboutImage = photo(scene === 'court' ? 'court-detail' : scene); c.joinImage = photo(scene);
  if (identity.logoUrl) c.logo = { id: ENTITY_LOGO_ID, alt: `${name} logo`, caption: '', x: 50, y: 50, overlay: 0 };
  c.details.sport = identity.sport;
  c.joinHeading = 'Your next chapter starts here.';
  c.joinText = `Explore the current registration opportunities with ${name}. Details and availability are kept up to date on each registration page.`;
  c.gallery = scene === 'court' ? [photo('court'), photo('court-detail')] : scene === 'track' ? [photo('track'), photo('track-detail')] : [photo('field'), photo('track')];
  c.headerButton = { label: 'Discover the squad', target: '#section-about', visible: true };
  c.extra = [{ id: 'the-game', heading: 'The game brings us together.', text: 'The first whistle. The next play. The feeling of being part of something. There is always another reason to love the game.', visible: true }];
  c.sections = c.sections.map(s => ({ ...s, visible: ['about', 'details', 'registration', 'directory', 'gallery', 'resources'].includes(s.id), heading: s.id === 'gallery' ? 'The game, in focus' : s.id === 'about' ? `Meet ${name}`.slice(0, 120) : s.heading }));
  return c;
}
