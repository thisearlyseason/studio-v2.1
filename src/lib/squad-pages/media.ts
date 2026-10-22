import fs from 'node:fs/promises';
import path from 'node:path';
import { localPreview, previewDataDirectory } from './store';
import { PageError } from './model';
async function bucket() { const { mediaBucket } = await import('@/lib/server-media-storage'); return mediaBucket(15000); }
export async function writePageImage(key: string, id: string, bytes: Buffer, contentType: string) {
  if (localPreview()) { const p = path.join(previewDataDirectory(), 'media', key); await fs.mkdir(p, { recursive: true, mode: 0o700 }); await fs.writeFile(path.join(p, id), bytes, { flag: 'wx', mode: 0o600 }); return; }
  const file = (await bucket()).file(`squadPagesPrivate/${key}/${id}`);
  await file.save(bytes, { resumable: false, preconditionOpts: { ifGenerationMatch: 0 }, metadata: { contentType, cacheControl: 'private, no-store', metadata: { squadPageImageId: id } } });
  const [metadata] = await file.getMetadata();
  if (metadata.metadata?.firebaseStorageDownloadTokens || metadata.metadata?.squadPageImageId !== id || !/^\d+$/.test(String(metadata.generation || ''))) throw new PageError('Private image verification failed.', 503);
}
export async function readPageImage(key: string, id: string) { if (localPreview()) return fs.readFile(path.join(previewDataDirectory(), 'media', key, id)); const [bytes] = await (await bucket()).file(`squadPagesPrivate/${key}/${id}`).download(); return bytes; }
export async function discardOwnedImage(key: string, id: string) { if (localPreview()) { await fs.unlink(path.join(previewDataDirectory(), 'media', key, id)).catch(error => { if (error.code !== 'ENOENT') throw error; }); return; } const file = (await bucket()).file(`squadPagesPrivate/${key}/${id}`); let metadata; try { [metadata] = await file.getMetadata(); } catch (error) { if ((error as { code?: number }).code === 404) return; throw error; } if (metadata.metadata?.squadPageImageId !== id || !/^\d+$/.test(String(metadata.generation || ''))) throw new PageError('Owned image cleanup could not verify its identity.', 503); await file.delete({ ifGenerationMatch: Number(metadata.generation) }); }
