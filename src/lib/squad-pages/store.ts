import fs from 'node:fs/promises';
import type { DocumentData } from 'firebase-admin/firestore';
import path from 'node:path';
export type Data = DocumentData & { type?: string; isInstitution?: unknown; isOrganizationHub?: unknown };
export type Row = Data & { id: string };
export interface Scope { get(path: string): Promise<Data | null>; list(path: string, field?: string, value?: unknown): Promise<Row[]>; set(path: string, value: Data): void; }
export interface PageStore { run<T>(work: (scope: Scope) => Promise<T>): Promise<T>; }
export function memoryStore(initial: Record<string, Data> = {}, persist?: (records: Record<string, Data>) => Promise<void>): PageStore {
  let records = structuredClone(initial), tail = Promise.resolve();
  return { run(work) { const task = tail.then(async () => { const next = structuredClone(records); const result = await work({ get: async p => structuredClone(next[p] || null), list: async (p, f, v) => Object.entries(next).filter(([k, x]) => k.startsWith(p + '/') && k.split('/').length === p.split('/').length + 1 && (!f || x[f] === v)).map(([k, x]) => ({ ...structuredClone(x), id: k.split('/').at(-1)! })), set: (p, v) => { next[p] = structuredClone(v); } }); if (persist) await persist(next); records = next; return result; }); tail = task.then(() => undefined, () => undefined); return task; } };
}
export const localPreview = () => process.env.SQUAD_PAGES_PREVIEW_FIXTURES === 'true' && process.env.NODE_ENV !== 'production' && !process.env.VERCEL;
export const previewDataDirectory = () => path.resolve(process.env.SQUAD_PAGES_PREVIEW_DATA_DIR || path.join(process.cwd(), '.squad-pages-preview'));
export const pagesEnabled = () => process.env.SQUAD_PAGES_ENABLED === 'true' && process.env.NEXT_PUBLIC_SQUAD_PAGES_ENABLED === 'true';
const fixtureStores = globalThis as typeof globalThis & { __squadPageStores?: Map<string, Promise<PageStore>> };
export async function pageStore(): Promise<PageStore> {
  if (localPreview()) {
    const file = path.join(previewDataDirectory(), 'state.json');
    const stores = fixtureStores.__squadPageStores ||= new Map();
    if (!stores.has(file)) stores.set(file, (async () => {
      const { previewRecords } = await import('./fixtures');
      let records: Record<string, Data>;
      try { records = JSON.parse(await fs.readFile(file, 'utf8')); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; records = previewRecords(true); }
      return memoryStore(records, async data => { await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 }); const temp = file + '.' + crypto.randomUUID(); try { await fs.writeFile(temp, JSON.stringify(data), { mode: 0o600, flag: 'wx' }); await fs.rename(temp, file); } finally { await fs.unlink(temp).catch(error => { if (error.code !== 'ENOENT') throw error; }); } });
    })());
    return stores.get(file)!;
  }
  const { adminDb } = await import('@/lib/firebase-admin');
  return { run: work => adminDb.runTransaction(async transaction => { const writes: Array<[string, Data]> = []; const result = await work({ get: async p => { const s = await transaction.get(adminDb.doc(p)); return s.exists ? s.data()! : null; }, list: async (p, field, value) => { const q = field ? adminDb.collection(p).where(field, '==', value) : adminDb.collection(p); const s = await transaction.get(q.limit(251)); if (s.size > 250) throw Error('Entity list exceeds the bounded page scope.'); return s.docs.map(d => ({ ...d.data(), id: d.id })); }, set: (p, v) => { writes.push([p, v]); } }); for (const [p, value] of writes) transaction.set(adminDb.doc(p), value); return result; }) };
}
