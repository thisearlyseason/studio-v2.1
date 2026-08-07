import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const BLOCKED_HOST_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.home', '.test', '.invalid'];

export function isPrivateIp(address: string): boolean {
  const normalized = address.toLowerCase().split('%')[0];
  if (isIP(normalized) === 4) {
    const parts = normalized.split('.').map(Number);
    const [a, b] = parts;
    return a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 0 || b === 168)) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224;
  }
  if (isIP(normalized) === 6) {
    if (normalized === '::' || normalized === '::1') return true;
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
    if (/^fe[89ab]/.test(normalized)) return true;
    const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return mapped ? isPrivateIp(mapped[1]) : false;
  }
  return true;
}

export function isObviouslyPrivateHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, '');
  return normalized === 'localhost' || normalized === 'metadata.google.internal' ||
    BLOCKED_HOST_SUFFIXES.some(suffix => normalized.endsWith(suffix));
}

export async function assertPublicHttpUrl(value: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Feed URL must be a valid URL.');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Feed URL must use public HTTP or HTTPS without embedded credentials.');
  }
  if (isObviouslyPrivateHostname(url.hostname)) {
    throw new Error('Feed URL cannot target a private network host.');
  }
  if (isIP(url.hostname) && isPrivateIp(url.hostname)) {
    throw new Error('Feed URL cannot target a private network address.');
  }

  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(result => isPrivateIp(result.address))) {
    throw new Error('Feed URL resolved to a private or unavailable network address.');
  }
  return url;
}

export async function fetchPublicUrl(
  value: string,
  init: RequestInit = {},
  maxRedirects = 3,
): Promise<Response> {
  let current = await assertPublicHttpUrl(value);
  for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
    const response = await fetch(current, { ...init, redirect: 'manual' });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    if (redirects === maxRedirects) throw new Error('Feed redirected too many times.');
    const location = response.headers.get('location');
    if (!location) throw new Error('Feed returned an invalid redirect.');
    current = await assertPublicHttpUrl(new URL(location, current).toString());
  }
  throw new Error('Feed request failed.');
}

export async function readResponseTextWithLimit(response: Response, maxBytes = 2_000_000): Promise<string> {
  const declaredLength = Number.parseInt(response.headers.get('content-length') || '', 10);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new Error('Feed response is too large.');
  }
  if (!response.body) return '';

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new Error('Feed response is too large.');
    }
    chunks.push(value);
  }
  const combined = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(combined);
}
