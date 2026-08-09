import 'server-only';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAdminAuth, adminDb } from '@/lib/firebase-admin';
import {
  authorizeDashboardRoute,
  isSensitiveDashboardPath,
  type DashboardAccessProfile,
} from '@/lib/dashboard-route-policy';

export const SESSION_COOKIE_NAME = '__session';

function invalidSessionPath(pathname: string): string {
  return `/api/auth/session?returnTo=${encodeURIComponent(pathname)}`;
}

export async function requireDashboardSession(pathname: string): Promise<void> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionCookie) redirect(invalidSessionPath(pathname));

  let decoded;
  try {
    decoded = await getAdminAuth().verifySessionCookie(
      sessionCookie,
      isSensitiveDashboardPath(pathname),
    );
  } catch {
    redirect(invalidSessionPath(pathname));
  }

  const snapshot = await adminDb.collection('users').doc(decoded.uid).get();
  const profile = snapshot.exists ? snapshot.data() as DashboardAccessProfile : null;
  if (!profile) redirect('/onboarding');
  const decision = authorizeDashboardRoute(pathname, profile, decoded.role);
  if (!decision.allowed) redirect(decision.redirectTo);
}
