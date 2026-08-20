export function getTrialCountdown(input: {
  subscriptionStatus?: unknown;
  trialEnd?: unknown;
  now?: number;
}): { active: boolean; days: number; hours: number } {
  if (String(input.subscriptionStatus || '').toLowerCase() !== 'trialing') {
    return { active: false, days: 0, hours: 0 };
  }
  const end = typeof input.trialEnd === 'number'
    ? input.trialEnd
    : Date.parse(String(input.trialEnd || ''));
  const remaining = end - (input.now ?? Date.now());
  if (!Number.isFinite(end) || remaining <= 0) return { active: false, days: 0, hours: 0 };
  const totalHours = Math.ceil(remaining / (60 * 60 * 1000));
  return { active: true, days: Math.floor(totalHours / 24), hours: totalHours % 24 };
}
