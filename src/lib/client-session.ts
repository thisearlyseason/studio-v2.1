'use client';

import type { Auth, User } from 'firebase/auth';
import { signOut } from 'firebase/auth';

async function sessionRequest(method: 'POST' | 'DELETE', idToken?: string): Promise<void> {
  const response = await fetch('/api/auth/session', {
    method,
    headers: idToken ? { Authorization: `Bearer ${idToken}` } : undefined,
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Unable to synchronize the secure session.');
  }
}

export async function establishSession(user: User): Promise<void> {
  await sessionRequest('POST', await user.getIdToken());
}

export async function clearSession(): Promise<void> {
  await sessionRequest('DELETE');
}

export async function signOutWithSession(auth: Auth): Promise<void> {
  await clearSession();
  await signOut(auth);
}
