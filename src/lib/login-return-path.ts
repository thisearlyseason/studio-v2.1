const RETURN_PATH_DECODE_LIMIT = 5;
const RETURN_PATH_CONTROL = /[\u0000-\u001f\u007f]/;
const RETURN_PATH_SCHEME = /^\/[a-z][a-z0-9+.-]*:/i;

export function canonicalSameOriginReturnPath(value: unknown, origin: string): string | null {
  if (typeof value !== 'string' || value.length === 0 || typeof origin !== 'string') return null;

  const unsafe = (candidate: string) => (
    !candidate.startsWith('/') || candidate.startsWith('//') || candidate.includes('\\') ||
    RETURN_PATH_CONTROL.test(candidate) || RETURN_PATH_SCHEME.test(candidate)
  );
  let decoded = value;
  for (let layer = 0; layer < RETURN_PATH_DECODE_LIMIT; layer += 1) {
    if (unsafe(decoded)) return null;
    let next: string;
    try {
      next = decodeURIComponent(decoded);
    } catch {
      return null;
    }
    if (next === decoded) break;
    if (layer === RETURN_PATH_DECODE_LIMIT - 1) return null;
    decoded = next;
  }
  if (unsafe(decoded)) return null;

  try {
    const base = new URL(origin);
    if (base.origin !== origin || base.pathname !== '/' || base.search || base.hash) return null;
    const resolved = new URL(value, base);
    if (resolved.origin !== base.origin || resolved.href !== `${base.origin}${value}`) return null;
  } catch {
    return null;
  }
  return value;
}
