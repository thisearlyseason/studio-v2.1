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
  'squad-editorial-indoor-action-v1': '/squad-pages/editorial/indoor-action.webp',
  'squad-editorial-team-huddle-v1': '/squad-pages/editorial/team-huddle.webp',
  'squad-editorial-indoor-game-v1': '/squad-pages/editorial/indoor-game.webp',
  'squad-editorial-baseball-run-v1': '/squad-pages/editorial/baseball-run.webp',
  'squad-editorial-baseball-bat-v1': '/squad-pages/editorial/baseball-bat.webp',
  'squad-editorial-baseball-ball-v1': '/squad-pages/editorial/baseball-ball.webp',

  'squad-editorial-athlete-court-v1': '/squad-pages/editorial/athlete-court.webp',
  'squad-editorial-athlete-shot-v1': '/squad-pages/editorial/athlete-shot.webp',
  'squad-editorial-athlete-hands-v1': '/squad-pages/editorial/athlete-hands.webp',
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
  c.exampleDetails = true; c.simpleAboutImage = false;
  c.primary = identity.primary || '#17304a'; c.secondary = identity.secondary || '#f5c451';
  // Three complementary action/team/detail photographs form a complete row.
  c.galleryLayout = 'row';
  c.headline = 'Find your team.\nPlay your game.';
  const exampleSport = identity.sport || 'Basketball';
  const audience = kind === 'school' || kind === 'program' ? 'all ages and abilities' : 'adults 18+';
  c.intro = `Competitive. Inclusive. A ${exampleSport.toLowerCase()} community for ${audience} in River City.`;
  c.description = `${name}${identity.sport ? ' · ' + identity.sport : ''}. A home for the game and the people who love it.`;
  c.aboutHeading = `Built for the love of ${exampleSport.toLowerCase()}.`;
  c.about = identity.description || `${name} brings people together through ${exampleSport.toLowerCase()}. Stay active, develop your skills and enjoy being part of a welcoming community. Whether you are returning to the game or looking for a new team, there is a place for you here.`;
  const sport = exampleSport.toLowerCase();
  const scene = /basket|netball/.test(sport) ? 'court' : /soccer|football|rugby|lacrosse|hockey|baseball|softball/.test(sport) ? 'field' : 'track';
  const photo = (scene: string): Photo => ({ id: `squad-editorial-${scene}-v1`, alt: `${scene.startsWith('court') ? 'Basketball court' : scene === 'field' ? 'Sports field' : 'Running track'} · editorial sports photography`, caption: scene.startsWith('court') ? 'A different perspective on the game.' : scene === 'field' ? 'Space to play. Room to grow.' : 'Every line is a new beginning.', x: scene === 'court' ? 28 : 50, y: 50, overlay: .6 });
  const athlete = (id: string, caption: string, x = 50, y = 50): Photo => ({ id: `squad-editorial-${id}-v1`, alt: `${caption} · illustrative stock photography, not squad members`, caption: `${caption} · Stock photo`, x, y, overlay: .6 });
  const baseball = /baseball|softball/.test(sport);
  c.hero = scene === 'court' ? athlete('indoor-action', 'Indoor basketball, in the thick of the game', 48, 32) : baseball ? athlete('baseball-run', 'Baseball, every play in motion', 50, 52) : photo(scene);
  c.aboutImage = scene === 'court' ? athlete('team-huddle', 'Together, before the next play', 50, 62) : baseball ? athlete('baseball-bat', 'Ready for the next pitch', 50, 50) : photo(scene);
  c.joinImage = scene === 'court' ? athlete('athlete-hands', 'The next play starts here') : baseball ? athlete('baseball-ball', 'A new season in your hands', 70, 50) : photo(scene);
  if (identity.logoUrl) c.logo = { id: ENTITY_LOGO_ID, alt: `${name} logo`, caption: '', x: 50, y: 50, overlay: 0 };
  c.details = { ...c.details, sport: exampleSport, ages: audience === 'adults 18+' ? 'Ages 18+' : 'All ages & abilities', location: 'River City', season: '2027 Season' };
  c.detailNotes = { ages: audience === 'adults 18+' ? 'Open to adult players 18+ of all skill levels. Everyone is welcome.' : 'A welcoming place for players of all ages and abilities.', location: 'Based in River City, with local games, practices and events.', season: 'Register for the 2027 season. Games start in Spring 2027.' };
  const emailName = name.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 48) || 'yoursquad';
  c.contact = { heading: 'Get in touch', text: 'Have questions? We would love to hear from you.', email: `hello@${emailName}.example`, phone: '' };
  c.joinHeading = `Join ${name}`;
  c.joinText = `Be part of a welcoming ${exampleSport.toLowerCase()} community. Explore registration for the next season, or get in touch to find your place on the squad.`;
  c.gallery = scene === 'court' ? [athlete('indoor-action', 'The game in motion', 48, 35), athlete('team-huddle', 'One team, one next play', 50, 62), athlete('indoor-game', 'Under the lights', 60, 55)] : baseball ? [athlete('baseball-run', 'Between the bases', 50, 55), athlete('baseball-bat', 'Meet the next pitch', 50, 50), athlete('baseball-ball', 'The details of the game', 70, 50)] : scene === 'track' ? [photo('track'), photo('track-detail'), photo('field')] : [photo('field'), photo('track'), photo('track-detail')];
  c.headerButton = { label: 'Join the squad', target: '#section-registration', visible: true };
  c.extra = [];
  c.sections = c.sections.map(s => ({ ...s, visible: ['about', 'details', 'registration', 'directory', 'gallery', 'resources', 'contact'].includes(s.id), heading: s.id === 'gallery' ? 'Team gallery' : s.id === 'about' ? `Meet ${name}`.slice(0, 120) : s.heading }));
  // Keep navigation concise even when a squad has a long public name.
  const navigation: Record<string, string> = { about: 'About', details: 'Details', registration: 'Registration', directory: 'Our squads', gallery: 'Gallery', resources: 'Resources', contact: 'Contact' };
  c.menu = [{ id: 'home', label: 'Home', target: '#page-top', visible: true }, ...c.sections.filter(section => section.visible).map(section => ({ id: section.id, label: navigation[section.id] || section.heading, target: `#section-${section.id}`, visible: true }))];
  return c;
}
