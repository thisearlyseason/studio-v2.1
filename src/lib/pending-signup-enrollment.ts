type TokenUser = {
  getIdToken(forceRefresh?: boolean): Promise<string>;
};

type PendingSignupEnrollmentResult = {
  pendingEnrollment: boolean;
  teamId?: string;
};

export async function completePendingSignupEnrollment(
  user: TokenUser,
  request: typeof fetch = fetch,
): Promise<PendingSignupEnrollmentResult> {
  const token = await user.getIdToken();
  const response = await request('/api/teams/join', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      usePendingSignupCode: true,
      enrollmentIntent: 'player',
    }),
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(typeof payload.error === 'string' ? payload.error : 'Unable to complete squad enrollment.');
  }
  return {
    pendingEnrollment: payload.pendingEnrollment === true,
    ...(typeof payload.teamId === 'string' ? { teamId: payload.teamId } : {}),
  };
}
