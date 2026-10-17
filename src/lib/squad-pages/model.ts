export const ENTITY_KINDS = ['team', 'club', 'league', 'school', 'program', 'tournament'] as const;
export type EntityKind = typeof ENTITY_KINDS[number];
export type EntityRef = { kind: EntityKind; id: string; teamId?: string };
export type Template = 'simple' | 'modern' | 'bold';
export const SECTIONS = ['about', 'details', 'registration', 'directory', 'gallery', 'links', 'contact', 'sponsors', 'resources'] as const;
export type Section = typeof SECTIONS[number];
export type Photo = { id: string; alt: string; caption: string; x: number; y: number; overlay: number; size?: number; zoom?: number };
export type PageLink = { id: string; label: string; url: string; formId?: string };
export type PageContent = {
  template: Template; name: string; slug: string; title: string; description: string;
  detailNotes?: { ages: string; location: string; season: string };
  exampleDetails?: boolean; simpleAboutImage?: boolean;
  background?: string; galleryLayout?: 'row' | 'mosaic' | 'staggered'; galleryLightbox?: boolean;
  headerButton?: { label: string; target: string; visible: boolean };
  menu?: { id: string; label: string; target: string; visible: boolean }[];
  primary: string; secondary: string; logo: Photo | null; hero: Photo | null; aboutImage: Photo | null; joinImage: Photo | null;
  headline: string; intro: string; aboutHeading: string; about: string; joinHeading: string; joinText: string;
  details: { sport: string; ages: string; location: string; season: string; program: string; dates: string; timezone: string; venue: string; deadline: string; divisions: string };
  gallery: Photo[]; links: PageLink[]; resources: PageLink[]; registrations: PageLink[]; sponsors: { name: string; image: Photo | null; url: string }[];
  contact: { heading: string; text: string; email: string; phone: string };
  sections: { id: Section; visible: boolean; heading: string }[];
  extra: { id: string; heading: string; text: string; visible: boolean }[];
  squadBrand: boolean; gamedayBrand: boolean;
};
export type Revision = { revision: number; content: PageContent; author: string; savedAt: string };
export type PageRecord = {
  identityLogoUrl?: string;
  entity: EntityRef; key: string; version: number; draft: Revision; live: Revision | null; previous: Revision | null;
  status: 'draft' | 'published' | 'unpublished' | 'expired'; slug: string | null;
  approval: { revision: number; by: string; at: string } | null; submittedRevision: number | null;
  coverageLostAt: string | null; lastCoveredAt: string | null; publicationRevision: number | null;
};
export class PageError extends Error { constructor(message: string, public status = 400) { super(message); } }
export const validId = (id: unknown): id is string => typeof id === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(id);
export function parseEntity(input: unknown): EntityRef {
  const x = input as Partial<EntityRef> | null;
  if (!x || !ENTITY_KINDS.includes(x.kind as EntityKind) || !validId(x.id) || (x.kind === 'tournament' && !validId(x.teamId))) throw new PageError('Select a valid entity.');
  return { kind: x.kind as EntityKind, id: x.id, ...(x.kind === 'tournament' ? { teamId: x.teamId } : {}) };
}
export function entityKey(ref: EntityRef) { return `${ref.kind === 'program' ? 'team' : ref.kind}~${ref.teamId ? ref.teamId + '~' : ''}${ref.id}`; }
const reserved = new Set(['admin', 'api', 'login', 'register', 'squad', 'support', 'privacy', 'terms', 'new', 'preview', 'settings', 'www', 'the-squad', 'gameday', 'demo']);
export function validateSlug(slug: string) {
  if (!/^[a-z0-9](?:[a-z0-9-]{1,58}[a-z0-9])$/.test(slug) || reserved.has(slug) || slug.startsWith('demo-')) throw new PageError('Use 3–60 lowercase letters, numbers or hyphens; this address may be reserved.');
  return slug;
}
export function safeLink(input: string, allowRelative = false) {
  if (typeof input !== 'string') throw new PageError('Use a valid link.');
  if (!input) return '';
  if (input.length > 1000 || /[\u0000-\u0020\\]/.test(input)) throw new PageError('Use a valid HTTPS link without spaces.');
  if (allowRelative && /^\/(register\/(league|tournament|squad)|events\/register|leagues\/spectator|tournaments\/(public|spectator))\//.test(input) && !input.includes('..')) return input;
  let url: URL; try { url = new URL(input); } catch { throw new PageError('Use a valid HTTPS link.'); }
  if (url.protocol !== 'https:' || url.username || url.password || !url.hostname.includes('.') || /(^|\.)(localhost|local|internal|test)$/.test(url.hostname) || /^\d/.test(url.hostname) || url.hostname.includes(':')) throw new PageError('Use a public HTTPS link.');
  if (allowRelative && ['thesquad.pro', 'www.thesquad.pro'].includes(url.hostname)) {
    if (url.port || url.hash) throw new PageError('Use an eligible registration form.');
    return safeLink(url.pathname + url.search, true);
  }
  return url.toString();
}
const cleanText = (v: unknown, max: number) => { if (typeof v !== 'string' || v.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v)) throw new PageError('Text is missing or too long.'); return v.trim(); };
export function emptyContent(name: string): PageContent {
  return { template: 'simple', name, slug: '', title: name, description: '', primary: '#17304a', secondary: '#ffbf36', logo: null, hero: null, aboutImage: null, joinImage: null,
    headline: '', intro: '', aboutHeading: 'About us', about: '', joinHeading: 'Join us', joinText: '',
    details: { sport: '', ages: '', location: '', season: '', program: '', dates: '', timezone: '', venue: '', deadline: '', divisions: '' }, gallery: [], links: [], resources: [], registrations: [], sponsors: [],
    contact: { heading: 'Get in touch', text: '', email: '', phone: '' }, sections: SECTIONS.map(id => ({ id, visible: true, heading: id[0].toUpperCase() + id.slice(1) })), extra: [], squadBrand: true, gamedayBrand: true };
}
export function validateContent(input: unknown): PageContent {
  const x = input as PageContent; if (!x || typeof x !== 'object') throw new PageError('Page content is required.');
  const out = emptyContent(cleanText(x.name, 120)); if (!out.name) throw new PageError('Name is required.');
  if (!['simple', 'modern', 'bold'].includes(x.template)) throw new PageError('Choose a template.'); out.template = x.template;
  for (const key of ['slug', 'title', 'description', 'headline', 'intro', 'aboutHeading', 'about', 'joinHeading', 'joinText'] as const) out[key] = cleanText(x[key], key === 'about' ? 6000 : key === 'slug' ? 60 : 1200);
  if (out.slug) validateSlug(out.slug);
  for (const key of ['primary', 'secondary'] as const) { if (!/^#[0-9a-fA-F]{6}$/.test(x[key])) throw new PageError('Choose a valid colour.'); out[key] = x[key]; }
  if (x.detailNotes !== undefined) { if (!x.detailNotes || typeof x.detailNotes !== 'object' || Array.isArray(x.detailNotes) || Object.keys(x.detailNotes).some(key => !['ages', 'location', 'season'].includes(key))) throw new PageError('Use valid detail descriptions.'); out.detailNotes = { ages: cleanText(x.detailNotes.ages ?? '', 600), location: cleanText(x.detailNotes.location ?? '', 600), season: cleanText(x.detailNotes.season ?? '', 600) }; }
  for (const key of ['exampleDetails', 'simpleAboutImage'] as const) { if (x[key] !== undefined) { if (typeof x[key] !== 'boolean') throw new PageError('Choose valid example and image settings.'); out[key] = x[key]; } }
  if (x.background !== undefined) { if (typeof x.background !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(x.background)) throw new PageError('Choose a valid page background.'); out.background = x.background; }
  if (x.galleryLayout !== undefined) { if (!['row', 'mosaic', 'staggered'].includes(x.galleryLayout)) throw new PageError('Choose a valid gallery layout.'); out.galleryLayout = x.galleryLayout; }
  if (x.galleryLightbox !== undefined) { if (typeof x.galleryLightbox !== 'boolean') throw new PageError('Choose whether gallery images expand.'); out.galleryLightbox = x.galleryLightbox; }
  if (x.headerButton !== undefined) {
    const button = x.headerButton;
    if (!button || typeof button.visible !== 'boolean') throw new PageError('Choose header button visibility.');
    const label = cleanText(button.label, 100), target = cleanText(button.target, 1000);
    if (!label || !target) throw new PageError('Header buttons need a label and destination.');
    if (target.startsWith('#') && !['#page-top', '#page-footer', ...SECTIONS.map(id => '#section-' + id)].includes(target)) throw new PageError('Choose an existing page section.');
    out.headerButton = { label, target: target.startsWith('#') ? target : safeLink(target), visible: button.visible };
  }
  if (x.menu !== undefined) { if (!Array.isArray(x.menu) || x.menu.length > 12 || x.menu.some(item => !item || !validId(item.id)) || new Set(x.menu.map(item => item.id)).size !== x.menu.length) throw new PageError('Use up to twelve unique menu links.');
    out.menu = x.menu.map(item => { const label = cleanText(item.label, 100), target = cleanText(item.target, 1000); if (!label) throw new PageError('Menu links need a title.');
      if (target.startsWith('#')) { if (!['#page-top', '#page-footer', ...SECTIONS.map(id => '#section-' + id)].includes(target)) throw new PageError('Choose an existing page section.'); } else if (!target) throw new PageError('Menu links need a valid target.');
      return { id: item.id, label, target: target.startsWith('#') ? target : safeLink(target), visible: item.visible === true }; }); }
  function photo(p: Photo | null): Photo | null { if (p === null) return null; if (!p || !validId(p.id)) throw new PageError('Use a page-owned image.'); for (const [key, minimum, maximum] of [['size', 70, 130], ['zoom', 100, 200]] as const) { if (p[key] !== undefined && (typeof p[key] !== 'number' || !Number.isFinite(p[key]) || p[key]! < minimum || p[key]! > maximum)) throw new PageError('Choose an image size or zoom within the allowed range.'); } return { ...(p.size !== undefined ? { size: p.size } : {}), ...(p.zoom !== undefined ? { zoom: p.zoom } : {}), id: p.id, alt: cleanText(p.alt, 300), caption: cleanText(p.caption, 300), x: Math.max(0, Math.min(100, Number(p.x) || 0)), y: Math.max(0, Math.min(100, Number(p.y) || 0)), overlay: Math.max(0, Math.min(.85, Number(p.overlay) || 0)) }; }
  for (const key of ['logo', 'hero', 'aboutImage', 'joinImage'] as const) out[key] = photo(x[key]);
  if (!Array.isArray(x.gallery) || x.gallery.length > 12) throw new PageError('Use up to twelve gallery images.'); out.gallery = x.gallery.map(p => { if (!p) throw new PageError('Use valid gallery images.'); return photo(p)!; });
  for (const key of Object.keys(out.details) as Array<keyof PageContent['details']>) out.details[key] = cleanText(x.details?.[key] ?? '', 300);
  for (const key of Object.keys(out.contact) as Array<keyof PageContent['contact']>) out.contact[key] = cleanText(x.contact?.[key], 600);
  if (out.contact.email && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(out.contact.email)) throw new PageError('Use a valid public email.');
  function links(items: PageLink[], forms = false) { if (!Array.isArray(items) || items.length > 12) throw new PageError('Use up to twelve links.'); if (items.some(l => !l || !validId(l.id)) || new Set(items.map(l => l.id)).size !== items.length) throw new PageError('Use unique valid link identifiers.'); return items.map(l => ({ id: cleanText(l.id, 120), label: cleanText(l.label, 100), url: safeLink(l.url, forms), ...(l.formId ? { formId: cleanText(l.formId, 120) } : {}) })); }
  out.links = links(x.links); out.resources = links(x.resources ?? []); out.registrations = links(x.registrations, true);
  if (!Array.isArray(x.sponsors) || x.sponsors.length > 12 || x.sponsors.some(s => !s)) throw new PageError('Use up to twelve sponsors.'); out.sponsors = x.sponsors.map(s => ({ name: cleanText(s.name, 120), image: photo(s.image), url: safeLink(s.url) }));
  if (!Array.isArray(x.sections) || x.sections.length !== SECTIONS.length || x.sections.some(s => !s) || new Set(x.sections.map(s => s.id)).size !== SECTIONS.length || x.sections.some(s => !SECTIONS.includes(s.id))) throw new PageError('Invalid section order.'); out.sections = x.sections.map(s => ({ id: s.id, visible: s.visible === true, heading: cleanText(s.heading, 120) }));
  if (!Array.isArray(x.extra) || x.extra.length > 4 || x.extra.some(e => !e || !validId(e.id)) || new Set(x.extra.map(e => e.id)).size !== x.extra.length) throw new PageError('Use up to four additional text sections.'); out.extra = x.extra.map(e => ({ id: cleanText(e.id, 120), heading: cleanText(e.heading, 120), text: cleanText(e.text, 6000), visible: e.visible === true }));
  if (typeof x.squadBrand !== 'boolean' || typeof x.gamedayBrand !== 'boolean') throw new PageError('Choose footer branding settings.'); out.squadBrand = x.squadBrand; out.gamedayBrand = x.gamedayBrand;
  return out;
}
export function photoIds(c: PageContent) { return [...new Set([c.logo, c.hero, c.aboutImage, c.joinImage, ...c.gallery, ...c.sponsors.map(s => s.image)].filter((p): p is Photo => Boolean(p)).map(p => p.id))]; }
export function textOn(colour: string) { const rgb = colour.slice(1).match(/../g)!.map(v => parseInt(v, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4); return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2] > .179 ? '#000000' : '#ffffff'; }
