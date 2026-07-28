import { createHmac, timingSafeEqual } from 'node:crypto';

export function createNewsletterUnsubscribeToken(email: string, secret: string): string {
  return createHmac('sha256', secret)
    .update(`newsletter-unsubscribe:${email}`)
    .digest('hex');
}

export function matchesNewsletterUnsubscribeToken(
  email: string,
  token: string,
  secrets: readonly string[]
): boolean {
  if (!email || !/^[a-f0-9]{64}$/.test(token)) return false;
  const supplied = Buffer.from(token, 'hex');

  return secrets.some(secret => {
    const expected = Buffer.from(createNewsletterUnsubscribeToken(email, secret), 'hex');
    return expected.length === supplied.length && timingSafeEqual(expected, supplied);
  });
}
