import type { Provider } from './protocol';

export type NativeAuthConfig = { origin: string; providers: readonly Provider[] };

export function readNativeAuthConfig(env: Record<string, string | undefined>): NativeAuthConfig | null {
  if (env.NEXT_PUBLIC_APP_DISTRIBUTION !== 'store' || env.NATIVE_AUTH_ENABLED !== 'true') return null;
  const raw = env.NATIVE_AUTH_STORE_ORIGIN || '';
  if (/\s/.test(raw)) return null;
  const parts = /^https:\/\/([a-z0-9.-]+)(?::443)?\/?$/i.exec(raw);
  if (!parts || parts[0] !== raw) return null;
  const host = parts[1].toLowerCase();
  const labels = host.split('.');
  if (host.length > 253 || host === 'localhost' || host.endsWith('.localhost') ||
      labels.some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) ||
      labels.every(label => /^(?:\d+|0x[0-9a-f]+)$/.test(label))) return null;
  try {
    if (new URL(raw).hostname !== host) return null;
  } catch { return null; }
  const providers = (env.NATIVE_AUTH_ALLOWED_PROVIDERS || '').split(',');
  if (providers.some(value => value !== 'google.com' && value !== 'apple.com') || new Set(providers).size !== providers.length) return null;
  return { origin: `https://${host}`, providers: providers as Provider[] };
}
