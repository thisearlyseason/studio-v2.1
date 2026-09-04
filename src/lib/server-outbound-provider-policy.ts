type ProviderEnvironment = Record<string, string | undefined>;

export function isOutboundProviderBlocked(
  environment: ProviderEnvironment = process.env,
): boolean {
  return environment.AUDIT_OUTBOUND_PROVIDER_MODE === 'block';
}

export function assertOutboundProviderAllowed(
  provider: 'stripe' | 'resend',
  environment: ProviderEnvironment = process.env,
): void {
  if (!isOutboundProviderBlocked(environment)) return;
  const label = provider === 'stripe' ? 'Stripe' : 'Resend';
  throw new Error(`${label} outbound provider access is blocked for the isolated emulator audit.`);
}
