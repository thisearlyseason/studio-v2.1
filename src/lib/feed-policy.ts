import { MAX_IMAGE_UPLOAD_BYTES } from './storage-upload-policy';

export const FEED_AUDIENCES = ['everyone', 'coaches', 'parents', 'players'] as const;
export type FeedAudience = typeof FEED_AUDIENCES[number];

export function feedAudience(value: unknown): FeedAudience | null {
  // Legacy posts were visible to all active members of their original team.
  if (value === undefined) return 'everyone';
  return FEED_AUDIENCES.includes(value as FeedAudience) ? value as FeedAudience : null;
}

export function canReadFeedAudience(value: unknown, staff: boolean, parent: boolean) {
  const audience = feedAudience(value);
  return audience !== null && (staff || audience === 'everyone' || audience === (parent ? 'parents' : 'players'));
}

export function decodeFeedImage(value: unknown): { bytes: Buffer; contentType: string } | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new Error('INVALID_IMAGE');
  const match = /^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || match[2].length > Math.ceil(MAX_IMAGE_UPLOAD_BYTES / 3) * 4) throw new Error('INVALID_IMAGE');
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_UPLOAD_BYTES || bytes.toString('base64') !== match[2]) throw new Error('INVALID_IMAGE');
  const valid = match[1] === 'image/png' ? bytes.length >= 24 && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
    : match[1] === 'image/jpeg' ? bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 && bytes.at(-2) === 255 && bytes.at(-1) === 217
      : match[1] === 'image/gif' ? bytes.length >= 14 && /GIF8[79]a/.test(bytes.subarray(0,6).toString())
        : bytes.length >= 20 && bytes.subarray(0,4).toString() === 'RIFF' && bytes.subarray(8,12).toString() === 'WEBP';
  if (!valid) throw new Error('INVALID_IMAGE');
  return {bytes,contentType:match[1]};
}
