/** Read-only alert refreshes report recoverable failures instead of throwing into the UI. */
export async function fetchAlertHistory<T>({ teamId, getToken, signal, request = fetch }: {
  teamId: string;
  getToken: () => Promise<string | null>;
  signal?: AbortSignal;
  request?: typeof fetch;
}): Promise<{ alerts: T[]; error: string | null } | null> {
  try {
    const token = await getToken();
    if (signal?.aborted) return null;
    if (!token) return { alerts: [], error: 'Sign in again to load your squad alerts.' };
    const response = await request(`/api/teams/alerts?teamId=${encodeURIComponent(teamId)}`, {
      headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal,
    });
    const payload = await response.json().catch(() => null);
    if (signal?.aborted) return null;
    if (response.status === 401) return { alerts: [], error: 'Your session has expired. Sign in again to load alerts.' };
    if (response.status === 403) return { alerts: [], error: 'You no longer have access to this squad’s alerts. Select another squad or contact its organizer.' };
    if (!response.ok || !Array.isArray(payload?.alerts)) {
      return { alerts: [], error: 'Squad alerts are temporarily unavailable. Try again in a moment.' };
    }
    return { alerts: payload.alerts, error: null };
  } catch {
    if (signal?.aborted) return null;
    return { alerts: [], error: 'Could not load squad alerts. Check your connection and try again.' };
  }
}
