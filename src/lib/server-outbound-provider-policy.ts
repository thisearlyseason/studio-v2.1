type ProviderEnvironment = Record<string, string | undefined>;

export function isOutboundProviderBlocked(
  environment: ProviderEnvironment = process.env,
): boolean {
  return environment.AUDIT_OUTBOUND_PROVIDER_MODE === 'block';
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
