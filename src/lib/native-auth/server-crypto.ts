import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { isSecret, NativeAuthError } from './protocol';

export const randomSecret = (): string => randomBytes(32).toString('base64url');
export function hashSecret(raw: string): string {
  if (!isSecret(raw)) throw new NativeAuthError('invalid_request');
  return createHash('sha256').update(raw, 'ascii').digest('base64url');
}
export function matchesSecret(raw: string, hash: string): boolean {
  if (!isSecret(raw) || !isSecret(hash)) return false;
  return timingSafeEqual(Buffer.from(hashSecret(raw), 'base64url'), Buffer.from(hash, 'base64url'));
}
