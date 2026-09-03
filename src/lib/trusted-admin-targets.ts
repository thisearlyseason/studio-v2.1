const EMAIL_PATTERN = /^[^\s@\r\n]+@[^\s@\r\n]+\.[^\s@\r\n]+$/;

export type AdminTargetProfile = {
  uid: string;
  email?: unknown;
  fcmTokens?: unknown;
};

export function collectTrustedAdminTargets(
  profiles: AdminTargetProfile[],
  trustedUids: ReadonlySet<string>,
): { emails: Set<string>; tokens: Set<string> } {
  const emails = new Set<string>();
  const tokens = new Set<string>();

  for (const profile of profiles) {
    if (!trustedUids.has(profile.uid)) continue;
    const email = typeof profile.email === 'string' ? profile.email.trim().toLowerCase() : '';
    if (EMAIL_PATTERN.test(email)) emails.add(email);
    if (!Array.isArray(profile.fcmTokens)) continue;
    for (const token of profile.fcmTokens.slice(0, 20)) {
      if (typeof token === 'string' && token.length >= 20 && token.length <= 4096) {
        tokens.add(token);
      }
    }
  }

  return { emails, tokens };
}
