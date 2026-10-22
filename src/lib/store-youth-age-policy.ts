import { APP_DISTRIBUTION, type AppDistribution } from '@/lib/app-distribution';

export const STORE_MINIMUM_DIRECT_ACCOUNT_AGE = 13;
export const STORE_YOUTH_AGE_ERROR =
  'The mobile app supports athlete accounts from age 13. A parent or guardian can manage younger athletes from their own account.';

function ageOnDate(dateOfBirth: unknown, now: Date): number | null {
  if (typeof dateOfBirth !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) return null;
  const [year, month, day] = dateOfBirth.split('-').map(Number);
  const birthDate = new Date(Date.UTC(year, month - 1, day));
  if (
    birthDate.getUTCFullYear() !== year ||
    birthDate.getUTCMonth() !== month - 1 ||
    birthDate.getUTCDate() !== day ||
    birthDate.getTime() > now.getTime()
  ) {
    return null;
  }
  let age = now.getUTCFullYear() - year;
  if (
    now.getUTCMonth() < month - 1 ||
    (now.getUTCMonth() === month - 1 && now.getUTCDate() < day)
  ) {
    age -= 1;
  }
  return age;
}

export function canActivateYouthAccount(
  dateOfBirth: unknown,
  distribution: AppDistribution = APP_DISTRIBUTION,
  now = new Date(),
): boolean {
  if (distribution !== 'store') return true;
  const age = ageOnDate(dateOfBirth, now);
  return age !== null && age >= STORE_MINIMUM_DIRECT_ACCOUNT_AGE;
}
