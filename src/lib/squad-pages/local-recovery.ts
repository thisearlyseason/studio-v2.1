import { SECTIONS, validId, type PageContent } from './model';
export interface RecoveryStorage { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void; key(index: number): string | null; readonly length: number; }
export type RecoveryScope = { uid: string; entity: string };
export type LocalRecovery = RecoveryScope & { schema: 1; writer: string; baseVersion: number; updatedAt: number; base: PageContent; content: PageContent };
const PREFIX = 'squad-page-recovery-v1:', TTL = 7 * 86400000, LIMIT = 384000;
export function createRecoveryWriter() { return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : [...crypto.getRandomValues(new Uint8Array(16))].map(v => v.toString(16).padStart(2,'0')).join(''); }
const text = (x: unknown) => typeof x === 'string' && x.length <= 32000;
const object = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const strings = (x: unknown, keys: string[]) => object(x) && keys.every(k => text(x[k]));
const list = (x: unknown, check: (x: unknown) => boolean, max = 12) => Array.isArray(x) && x.length <= max && x.every(check);
const photo = (x: unknown): boolean => x === null || object(x) && validId(x.id) && text(x.alt) && text(x.caption) && ['x', 'y', 'overlay'].every(k => typeof x[k] === 'number' && Number.isFinite(x[k])) && ['size', 'zoom'].every(k => x[k] === undefined || typeof x[k] === 'number' && Number.isFinite(x[k]));
function safeTree(value: unknown, depth = 0): boolean {
  if (depth > 12) return false;
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') return value.length <= 32000;
  if (Array.isArray(value)) return value.length <= 100 && value.every(v => safeTree(v, depth + 1));
  return object(value) && Object.keys(value).length <= 100 && Object.entries(value).every(([key,v]) => !['__proto__','prototype','constructor'].includes(key) && safeTree(v, depth + 1));
}
/** Recover incomplete form input too; publication validation still runs on save. */
export function isDraftContent(x: unknown): x is PageContent {
  if (!safeTree(x) || !object(x) || !strings(x, ['name','slug','title','description','headline','intro','aboutHeading','about','joinHeading','joinText']) || !['simple','modern','bold'].includes(String(x.template))) return false;
  if (!['primary','secondary'].every(k => typeof x[k] === 'string' && /^#[0-9a-fA-F]{6}$/.test(x[k] as string)) || x.background !== undefined && (typeof x.background !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(x.background))) return false;
  if (!strings(x.details, ['sport','ages','location','season','program','dates','timezone','venue','deadline','divisions']) || !strings(x.contact, ['heading','text','email','phone'])) return false;
  if (!['logo','hero','aboutImage','joinImage'].every(k => photo(x[k])) || !list(x.gallery, p => p !== null && photo(p))) return false;
  if (!['links','resources','registrations'].every(k => list(x[k], v => object(v) && validId(v.id) && strings(v, ['label','url']) && (v.formId === undefined || text(v.formId))))) return false;
  if (!list(x.sponsors, v => strings(v, ['name','url']) && object(v) && photo(v.image))) return false;
  if (!Array.isArray(x.sections) || x.sections.length !== SECTIONS.length || !list(x.sections, v => object(v) && SECTIONS.includes(v.id as typeof SECTIONS[number]) && text(v.heading) && typeof v.visible === 'boolean') || new Set(x.sections.map(v => v.id)).size !== SECTIONS.length) return false;
  if (!list(x.extra, v => object(v) && validId(v.id) && strings(v, ['heading','text']) && typeof v.visible === 'boolean', 4) || typeof x.squadBrand !== 'boolean' || typeof x.gamedayBrand !== 'boolean') return false;
  if (x.menu !== undefined && !list(x.menu, v => object(v) && validId(v.id) && strings(v, ['label','target']) && typeof v.visible === 'boolean')) return false;
  if (x.headerButton !== undefined && (!strings(x.headerButton, ['label','target']) || !object(x.headerButton) || typeof x.headerButton.visible !== 'boolean')) return false;
  if (x.detailNotes !== undefined && !strings(x.detailNotes, ['ages','location','season'])) return false;
  if (x.galleryLayout !== undefined && !['row','mosaic','staggered'].includes(String(x.galleryLayout))) return false;
  return ['galleryLightbox','exampleDetails','simpleAboutImage'].every(k => x[k] === undefined || typeof x[k] === 'boolean');
}
function prefix(scope: RecoveryScope) { if (!scope.uid || !/^(team|program|club|school|league|tournament)~[A-Za-z0-9_~-]+$/.test(scope.entity)) throw Error('Recovery needs a current account and entity.'); return PREFIX + encodeURIComponent(scope.uid) + ':' + encodeURIComponent(scope.entity) + ':'; }
export function recoveryKey(scope: RecoveryScope, writer: string) { if (!validId(writer)) throw Error('Invalid local recovery writer.'); return prefix(scope) + writer; }
export function writeRecovery(storage: RecoveryStorage, value: LocalRecovery) {
  if (!isDraftContent(value.base) || !isDraftContent(value.content) || !Number.isSafeInteger(value.baseVersion) || value.baseVersion < 0 || !Number.isFinite(value.updatedAt)) throw Error('Local recovery data is invalid.');
  const raw = JSON.stringify(value); if (raw.length > LIMIT) throw Error('This draft is too large for browser recovery.');
  const key = recoveryKey(value, value.writer);
  storage.setItem(key, raw);
  if (storage.getItem(key) !== raw) throw Error('Browser recovery was not retained.');
}
export function readRecoveries(storage: RecoveryStorage, scope: RecoveryScope, now = Date.now()): LocalRecovery[] {
  const start = prefix(scope), result: LocalRecovery[] = [], keys: string[] = [];
  for (let i = 0; i < storage.length; i++) { const key = storage.key(i); if (key?.startsWith(start)) keys.push(key); }
  for (const key of keys) { try { const raw = storage.getItem(key); if (!raw || raw.length > LIMIT) continue; const v = JSON.parse(raw) as LocalRecovery;
    if (v.schema !== 1 || v.uid !== scope.uid || v.entity !== scope.entity || recoveryKey(scope, v.writer) !== key || !Number.isSafeInteger(v.baseVersion) || v.baseVersion < 0 || !Number.isFinite(v.updatedAt) || v.updatedAt > now + 60000) continue;
    if (now - v.updatedAt > TTL) { storage.removeItem(key); continue; }
    if (isDraftContent(v.base) && isDraftContent(v.content)) result.push(v);
  } catch { /* Corrupt copies never enter the editor or affect another scope. */ } }
  return result.sort((a,b) => b.updatedAt - a.updatedAt);
}
export function clearOwnRecovery(storage: RecoveryStorage, scope: RecoveryScope, writer: string) { storage.removeItem(recoveryKey(scope, writer)); }
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
/** Arrays are atomic. Never silently merge competing reorder/removal changes. */
export function planRecovery(copy: LocalRecovery, current: PageContent): { content: PageContent; conflicts: string[] } {
  const conflicts: string[] = [];
  function merge(base: unknown, local: unknown, remote: unknown, path: string): unknown {
    if (equal(local, base) || equal(local, remote)) return remote;
    if (equal(remote, base)) return local;
    if (object(base) && object(local) && object(remote)) { const result: Record<string, unknown> = {}; for (const key of new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)])) result[key] = merge(base[key],local[key],remote[key],path ? path+'.'+key : key); return result; }
    conflicts.push(path); return remote;
  }
  return { content: merge(copy.base,copy.content,current,'') as PageContent, conflicts };
}
