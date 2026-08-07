const PAID_PLAN_TYPES = new Set(['team', 'elite', 'league', 'school']);
const ENTITLED_STATUSES = new Set(['active', 'trialing']);

export function accountCreationLimit(profile: Record<string, unknown> | undefined): number {
  const plan = typeof profile?.plan_type === 'string' ? profile.plan_type : 'free';
  const status =
    typeof profile?.subscription_status === 'string'
      ? profile.subscription_status.toLowerCase()
      : '';
  if (!PAID_PLAN_TYPES.has(plan) || !ENTITLED_STATUSES.has(status)) return 1;

  const configured = Number(profile?.team_limit);
  const addOns = Number(profile?.extra_teams);
  const base = Number.isFinite(configured) ? Math.max(1, Math.floor(configured)) : 1;
  const extras = Number.isFinite(addOns) ? Math.max(0, Math.floor(addOns)) : 0;
  return Math.min(base + extras, 100);
}

export function normalizeCreationText(
  value: unknown,
  options: { field: string; min?: number; max: number; optional?: boolean }
): string | undefined {
  if (value === undefined || value === null || value === '') {
    if (options.optional) return undefined;
    throw new Error(`${options.field.toUpperCase()}_REQUIRED`);
  }
  if (typeof value !== 'string') throw new Error(`${options.field.toUpperCase()}_INVALID`);
  const normalized = value.trim();
  if (normalized.length < (options.min ?? 1) || normalized.length > options.max) {
    throw new Error(`${options.field.toUpperCase()}_INVALID`);
  }
  return normalized;
}
