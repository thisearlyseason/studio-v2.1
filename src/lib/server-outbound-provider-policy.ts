type ProviderEnvironment = Record<string, string | undefined>;

export function isOutboundProviderBlocked(
  environment: ProviderEnvironment = process.env,
): boolean {
  return environment.AUDIT_OUTBOUND_PROVIDER_MODE === 'block';
}

export function isApprovedLocalMailSink(
  environment: ProviderEnvironment = process.env,
): boolean {
  const projectId = environment.GCLOUD_PROJECT || environment.GOOGLE_CLOUD_PROJECT || '';
  const firestoreHost = environment.FIRESTORE_EMULATOR_HOST || '';
  const loopbackFirestore = /^(?:127\.0\.0\.1|localhost):\d{1,5}$/.test(firestoreHost) ||
    /^\[::1\]:\d{1,5}$/.test(firestoreHost);
  return environment.NODE_ENV !== 'production' &&
    isOutboundProviderBlocked(environment) &&
    environment.AUDIT_LOCAL_MAIL_TRANSPORT === 'memory-sink' &&
    projectId.startsWith('demo-') &&
    loopbackFirestore;
}

export function assertOutboundProviderAllowed(
  provider: 'stripe' | 'resend' | 'notification',
  environment: ProviderEnvironment = process.env,
): void {
  if (!isOutboundProviderBlocked(environment)) return;
  const label = provider === 'stripe'
    ? 'Stripe'
    : provider === 'resend'
      ? 'Resend'
      : 'Notification';
  throw new Error(`${label} outbound provider access is blocked for the isolated emulator audit.`);
}
