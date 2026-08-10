/**
 * Client-side helper to get a Firebase ID token for authenticated API requests.
 * 
 * Usage:
 *   const token = await getAuthToken(auth);
 *   fetch('/api/...', {
 *     headers: { 'Content-Type': 'application/json', ...authHeader(token) }
 *   })
 */
import { sendEmailVerification, type Auth, type User } from 'firebase/auth';

export const DEMO_EXIT_PENDING_KEY = 'squad_demo_exit_pending';
export const DEMO_START_KEY = 'squad_demo_start_time';

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

export async function sendBrandedVerificationEmail(user: User): Promise<void> {
  const token = await user.getIdToken(true);
  const response = await fetch('/api/email/verify-email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name: user.displayName || '' }),
  });
  if (response.ok) return;

  // Local development intentionally has no production Resend secret. Firebase's
  // isolated-project sender keeps localhost usable while hosted environments
  // always use the branded thesquad.pro delivery path.
  if (process.env.NODE_ENV !== 'production') {
    await sendEmailVerification(user, {
      url: `${window.location.origin}/login?verified=1`,
    });
    return;
  }
  throw new Error('Unable to send verification email.');
}

export async function establishBrowserSession(user: User): Promise<void> {
  const token = await user.getIdToken(true);
  const response = await fetch('/api/auth/session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) throw new Error('Unable to establish a secure browser session.');
}

export async function bootstrapDemoWorkspace(user: User, planId: string): Promise<void> {
  const token = await user.getIdToken(true);
  const response = await fetch('/api/demo/seed', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ planId }),
  });
  if (response.ok) return;

  const payload = await response.json().catch(() => ({}));
  throw new Error(payload.error || 'Unable to initialize the demo workspace.');
}

export async function clearBrowserSession(): Promise<void> {
  await fetch('/api/auth/session', { method: 'DELETE' }).catch(() => {});
}
