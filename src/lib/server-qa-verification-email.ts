import { isOutboundProviderBlocked } from '@/lib/server-outbound-provider-policy';

const QA_PROJECT = 'the-squad-audit-preview';
const QA_ORIGIN = 'https://thesquadv2-native-store-qa-tylers-projects-5b59182e.vercel.app';

/** Called only after the route verifies the token, account and rate limit. */
export async function sendHostedQaVerificationEmail(request: Request): Promise<boolean> {
  const mode = process.env.QA_VERIFICATION_EMAIL_TRANSPORT;
  if (!mode) return false; // Ordinary web/store releases keep branded Resend.

  let apiKey: string;
  try {
    const server = JSON.parse(process.env.FIREBASE_WEBAPP_CONFIG || '{}');
    const browser = JSON.parse(process.env.NEXT_PUBLIC_FIREBASE_WEBAPP_CONFIG || '{}');
    if (mode !== 'firebase' || process.env.VERCEL_ENV !== 'preview' ||
        process.env.NEXT_PUBLIC_APP_DISTRIBUTION !== 'store' ||
        process.env.GOOGLE_CLOUD_PROJECT !== QA_PROJECT || process.env.GCLOUD_PROJECT !== QA_PROJECT ||
        server.projectId !== QA_PROJECT || browser.projectId !== QA_PROJECT ||
        typeof server.apiKey !== 'string' || !server.apiKey.trim() || server.apiKey !== browser.apiKey ||
        process.env.NEXT_PUBLIC_APP_URL !== QA_ORIGIN || new URL(request.url).origin !== QA_ORIGIN ||
        isOutboundProviderBlocked()) throw new Error();
    apiKey = server.apiKey;
  } catch {
    throw new Error('QA verification email configuration is invalid.');
  }

  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ') || !authorization.slice(7).trim()) {
    throw new Error('QA verification requires an authenticated account.');
  }
  try {
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestType: 'VERIFY_EMAIL', idToken: authorization.slice(7), continueUrl: `${QA_ORIGIN}/login?verified=1` }),
      signal: AbortSignal.timeout(10_000), redirect: 'error', cache: 'no-store',
    });
    if (!response.ok) throw new Error();
  } catch {
    // Never log provider response bodies, request tokens or fetch diagnostics.
    throw new Error('QA verification email could not be sent.');
  }
  return true;
}
