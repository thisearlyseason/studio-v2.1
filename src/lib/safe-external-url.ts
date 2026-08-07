import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

function isPrivateIpv4(address: string): boolean {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateIpv6(address: string): boolean {
  const normalized = address.toLowerCase();
  if (normalized === '::' || normalized === '::1') return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  if (/^fe[89ab]/.test(normalized)) return true;
  if (normalized.startsWith('::ffff:')) {
    return isPrivateIpv4(normalized.slice('::ffff:'.length));
  }
  return false;
}

export function isPrivateNetworkAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isPrivateIpv4(address);
  if (version === 6) return isPrivateIpv6(address);
  return true;
}

export async function assertSafeExternalUrl(value: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('The feed URL is invalid.');
  }

  if (url.protocol !== 'https:' || url.username || url.password || url.port) {
    throw new Error('Only standard HTTPS feed URLs are allowed.');
  }

  const rawHostname = url.hostname.toLowerCase().replace(/\.$/, '');
  const hostname =
    rawHostname.startsWith('[') && rawHostname.endsWith(']')
      ? rawHostname.slice(1, -1)
      : rawHostname;
  if (
    !hostname ||
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    throw new Error('Private network feed URLs are not allowed.');
  }

  if (isIP(hostname)) {
    if (isPrivateNetworkAddress(hostname)) {
      throw new Error('Private network feed URLs are not allowed.');
    }
    return url;
  }

  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (
    addresses.length === 0 ||
    addresses.some(result => isPrivateNetworkAddress(result.address))
  ) {
    throw new Error('The feed hostname does not resolve to a public address.');
  }

  return url;
}
