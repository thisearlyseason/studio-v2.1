import { Resend } from 'resend';
import { assertOutboundProviderAllowed } from '@/lib/server-outbound-provider-policy';

export function getResend(): Resend {
  assertOutboundProviderAllowed('resend');
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY env var not set');
  return new Resend(apiKey);
}
