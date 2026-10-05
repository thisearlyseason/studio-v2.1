/** Stable JSON semantics shared by request receipts and client retries. */
export function teamEventRequestFingerprint(value: unknown): string {
  return JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]]))
    : item);
}

export function createTeamEventRequestRegistry() {
  const pending = new Map<string, string>();
  return {
    acquire(value: unknown) {
      const fingerprint = teamEventRequestFingerprint(value);
      let requestId = pending.get(fingerprint);
      if (!requestId) { requestId = crypto.randomUUID(); pending.set(fingerprint, requestId); }
      return { fingerprint, requestId };
    },
    complete(request: { fingerprint: string; requestId: string }) {
      if (pending.get(request.fingerprint) === request.requestId) pending.delete(request.fingerprint);
    },
  };
}
