import 'server-only';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAdminAuth } from '@/lib/firebase-admin';
import {
  authorizeDashboardRoute,
  isSensitiveDashboardPath,
} from '@/lib/dashboard-route-policy';
import { resolveServerAccountSession } from '@/lib/server-account-session';
import { accountSessionRedirect } from '@/lib/dashboard-account-session';
import { ACTIVE_SQUAD_COOKIE_NAME, normalizeSelectedSquadId } from '@/lib/selected-squad';

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

  let access;
  try {
    access = await resolveServerAccountSession({
      uid: decoded.uid,
      role: typeof decoded.role === 'string' ? decoded.role : undefined,
      signInProvider: decoded.firebase?.sign_in_provider,
      selectedTeamId: normalizeSelectedSquadId(cookieStore.get(ACTIVE_SQUAD_COOKIE_NAME)?.value),
    });
  } catch {
    redirect('/login?reason=session-unavailable');
  }

  const admissionRedirect = accountSessionRedirect(pathname, access);
  if (admissionRedirect) redirect(admissionRedirect);
  const profile = access.allowed ? access.profile : null;
  const decision = authorizeDashboardRoute(
    pathname,
    profile,
    decoded.role,
    access.allowed && access.institutionAuthority === true,
    access.allowed && access.coachesCornerAuthority === true,
  );
  if (!decision.allowed) redirect(decision.redirectTo);
}
