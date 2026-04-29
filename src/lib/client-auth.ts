/**
 * Client-side helper to get a Firebase ID token for authenticated API requests.
 * 
 * Usage:
 *   const token = await getAuthToken(auth);
 *   fetch('/api/...', {
 *     headers: { 'Content-Type': 'application/json', ...authHeader(token) }
 *   })
 */
import type { Auth } from 'firebase/auth';

/** Gets the current user's Firebase ID token. Returns null if not authenticated. */
export async function getAuthToken(auth: Auth): Promise<string | null> {
  try {
    const user = auth.currentUser;
    if (!user) return null;
    return await user.getIdToken(/* forceRefresh = */ false);
  } catch (err) {
    console.error('[getAuthToken] Failed to get ID token:', err);
    return null;
  }
}

/** Returns Authorization header object for use in fetch calls. */
export function authHeader(token: string | null): Record<string, string> {
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}
