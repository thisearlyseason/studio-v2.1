import { emptyContent, photoIds, type EntityKind, type PageContent, type PageLink, type Photo } from './model';
const illustrations: Record<string, string> = {
  'squad-sample-court-v1': '/squad-pages/samples/court.svg',
  'squad-sample-field-v1': '/squad-pages/samples/field.svg',
  'squad-sample-track-v1': '/squad-pages/samples/track.svg',
};
export function sampleImageUrl(id: string): string { return Object.hasOwn(illustrations, id) ? illustrations[id] : ''; }
const placeholderIds = new Set(['squad-sample-registration-v1', 'squad-sample-link-v1', 'squad-sample-resource-v1']);
export function isSamplePlaceholder(link: PageLink) { return placeholderIds.has(link.id) && !link.url && !link.formId && !!link.label; }
export function hasSampleContent(content: PageContent) { return content.exampleDetails === true || JSON.stringify(content).includes('[Sample]') || photoIds(content).some(id => !!sampleImageUrl(id)) || [...content.registrations, ...content.links, ...(content.resources || [])].some(isSamplePlaceholder); }
/** Pure new-draft defaults only: no writes, external media, contacts or registration destinations. */
export function sampleContent(name: string, kind: EntityKind): PageContent {
  const c = emptyContent(name);
  const label = ({ team: 'team', club: 'club', league: 'league', school: 'school', program: 'program', tournament: 'tournament' } as const)[kind];
  const picture = (id: string, scene: string): Photo => ({ id, alt: `[Sample] Original ${scene} illustration`, caption: `[Sample] ${scene} illustration — replace with your own photos`, x: 50, y: 50, overlay: .55 });
  c.headline = `[Sample] A home for your ${label}.`;
  c.intro = '[Sample] Welcome visitors with a short introduction. Replace this editable copy with your story, who you welcome and what comes next.';
  c.description = `[Sample] An editable starting point for your ${label} landing page.`;
  c.aboutHeading = '[Sample] Your story starts here.';
  c.about = `[Sample] Introduce your ${label}: what you do, who can take part and what makes your community yours.\n\n[Sample] Add your real approach, values and season information. This is sample copy, not a statement about your organization.`;
  c.hero = picture('squad-sample-court-v1', 'court'); c.aboutImage = picture('squad-sample-field-v1', 'field'); c.joinImage = picture('squad-sample-track-v1', 'track');
  c.joinHeading = '[Sample] Find your next step.';
  c.joinText = '[Sample] Describe how to take part. Connect an eligible published registration form or add your real public destination. The sample button is inactive.';
  c.details = { ...c.details, sport: '[Sample] Your sport', ages: '[Sample] Your age groups', location: '[Sample] Your community', season: '[Sample] Your season', program: `[Sample] Your ${label} activities` };
  if (kind === 'tournament') { c.details.dates = '[Sample] Your event dates'; c.details.venue = '[Sample] Your venue'; c.details.divisions = '[Sample] Your divisions'; }
  c.gallery = [picture('squad-sample-court-v1', 'court'), picture('squad-sample-field-v1', 'field'), picture('squad-sample-track-v1', 'track')];
  c.registrations = [{ id: 'squad-sample-registration-v1', label: '[Sample] Registration — connect a real form', url: '' }];
  c.links = [{ id: 'squad-sample-link-v1', label: '[Sample] Add a community link', url: '' }];
  c.resources = [{ id: 'squad-sample-resource-v1', label: '[Sample] Add a public resource', url: '' }];
  c.contact = { heading: '[Sample] Get in touch', text: '[Sample] Add your public contact details and the questions you can help with. No email address or phone number is connected yet.', email: '', phone: '' };
  c.sponsors = [{ name: '[Sample] Sponsor space — add an approved sponsor or remove this section', image: null, url: '' }];
  return c;
}
