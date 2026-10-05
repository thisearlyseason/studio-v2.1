import type { UserRecord } from 'firebase-admin/auth';
import { signupPostVerificationPath, type SignupRegistrationTarget } from '../store-signup-policy';
import { NativeAuthError, onboardingSchema, parseNativeValue, type NativeOnboarding } from './protocol';

export function parseNativeOnboarding(input: unknown): NativeOnboarding {
  const value = parseNativeValue(onboardingSchema, input);
  if (/[\u0000-\u001f\u007f]/.test(value.fullName + value.joinCode)) throw new NativeAuthError('invalid_request');
  return { ...value, fullName: value.fullName.replace(/\s+/g, ' '), joinCode: value.joinCode.trim().toUpperCase() };
}

export function profileWrites(identity: UserRecord, input: NativeOnboarding, now: number) {
  const value = parseNativeOnboarding(input);
  if (!identity.uid || identity.disabled || !identity.emailVerified || !identity.email) throw new NativeAuthError('account_unavailable');
  const targets: Record<NativeOnboarding['role'], SignupRegistrationTarget> = {
    adult_player: 'self', parent: 'child', coach: 'coach', admin: 'school_ad', league_creator: 'league_creator',
  };
  const user: Record<string, unknown> = {
    id: identity.uid, fullName: value.fullName, email: identity.email.trim().toLowerCase(), role: value.role,
    notificationsEnabled: false, upcomingEventNotificationsEnabled: false, createdAt: new Date(now).toISOString(),
    nativeSignupConsent: { adultConfirmed: true, termsAccepted: true, recordedAt: new Date(now).toISOString(), version: 1 },
  };
  if (identity.photoURL && identity.photoURL.length <= 2048) {
    try {
      const photo = new URL(identity.photoURL);
      if (photo.protocol === 'https:' && !photo.username && !photo.password) user.avatarUrl = photo.href;
    } catch { /* A provider photo is optional, never required for account creation. */ }
  }
  const [firstName, ...lastName] = value.fullName.split(' ');
  const player = value.role === 'adult_player' ? {
    firstName, lastName: lastName.join(' '), userId: identity.uid, isMinor: false,
    parentId: '', hasLogin: true, recruitingProfileEnabled: false, createdAt: new Date(now).toISOString(),
  } : null;
  return { user, player, returnPath: signupPostVerificationPath({ target: targets[value.role], joinCode: value.joinCode, planChoice: 'starter' }, 'store') };
}
