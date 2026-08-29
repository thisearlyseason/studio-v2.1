const RETURN_PATH_DECODE_LIMIT = 5;
const RETURN_PATH_LENGTH_LIMIT = 2048;
const RETURN_PATH_CONTROL = /[\u0000-\u001f\u007f]/;
const RETURN_PATH_SCHEME = /^\/[a-z][a-z0-9+.-]*:/i;
const RETURN_PATH_ENCODED_AMBIGUITY = /%(?:25|2f|5c|0[0-9a-f]|1[0-9a-f]|7f)/i;

export function canonicalSameOriginReturnPath(value: unknown, origin: string): string | null {
  if (
    typeof value !== 'string' || value.length === 0 || value.length > RETURN_PATH_LENGTH_LIMIT ||
    typeof origin !== 'string'
  ) return null;

  let base: URL;
  try {
    base = new URL(origin);
    if (base.origin !== origin || base.pathname !== '/' || base.search || base.hash) return null;
  } catch {
    return null;
  }
  const unsafe = (candidate: string) => (
    !candidate.startsWith('/') || candidate.startsWith('//') || candidate.includes('\\') ||
    RETURN_PATH_CONTROL.test(candidate) || RETURN_PATH_SCHEME.test(candidate) ||
    RETURN_PATH_ENCODED_AMBIGUITY.test(candidate)
  );
  const nonCanonical = (candidate: string) => {
    try {
      const resolved = new URL(candidate, base);
      return resolved.origin !== base.origin || resolved.href !== `${base.origin}${candidate}`;
    } catch {
      return true;
    }
  };
  let decoded = value;
  for (let layer = 0; layer < RETURN_PATH_DECODE_LIMIT; layer += 1) {
    if (unsafe(decoded) || nonCanonical(decoded)) return null;
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
  if (unsafe(decoded) || nonCanonical(decoded)) return null;
  return value;
}
