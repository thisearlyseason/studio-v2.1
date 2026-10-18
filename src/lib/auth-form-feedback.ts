import type { PasswordPolicy } from 'firebase/auth';

export function authFailureMessage(error: unknown, signup = false): string {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  if (code === 'auth/network-request-failed') return 'Check your connection, then try again.';
  if (code === 'auth/too-many-requests') return 'Too many attempts. Please wait before trying again.';
  if (signup && (code === 'auth/weak-password' || code === 'auth/password-does-not-meet-requirements')) {
    return 'This password does not meet the requirements shown below. Please update it and try again.';
  }
  return signup
    ? 'Unable to create an account with these details. Check your entries, or try signing in or resetting your password.'
    : 'The email or password is incorrect, or this account is unavailable.';
}

export function signupPasswordRequirements(policy?: PasswordPolicy): string {
  const options = policy?.enforcementState === 'OFF' ? undefined : policy?.customStrengthOptions;
  const min = Math.max(8, options?.minPasswordLength ?? 8);
  const max = Math.min(128, options?.maxPasswordLength ?? 128);
  const extra = [
    options?.containsLowercaseLetter && 'a lowercase letter',
    options?.containsUppercaseLetter && 'an uppercase letter',
    options?.containsNumericCharacter && 'a number',
    options?.containsNonAlphanumericCharacter && 'a special character',
  ].filter(Boolean);
  return `Use ${min}–${max} characters${extra.length ? `, including ${extra.join(', ')}` : ''}. Re-enter the same password to confirm it.`;
}
