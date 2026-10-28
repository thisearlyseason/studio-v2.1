import { readSaasTaxCatalog } from './saas-tax-catalog';

type Environment = Record<string, string | undefined>;
const project = 'the-squad-audit-preview';

function parseJson(raw: string | undefined) {
  try { return JSON.parse(raw || ''); }
  catch { return JSON.parse(Buffer.from(raw || '', 'base64').toString('utf8')); }
}

export function isSaasTaxPreview(environment: Environment = process.env): boolean {
  return environment.SQUAD_SAAS_TAX_PREVIEW === 'true' ||
    environment.AUDIT_OUTBOUND_PROVIDER_MODE === 'saas-tax-sandbox';
}

export class SaasTaxPreviewConfigurationError extends Error {
  constructor(readonly checks: string[]) {
    super('The isolated SaaS tax preview configuration is invalid. Provider access is blocked.');
  }
}

/** A separate preview, never an exception to the existing audit's block mode.
 * Validate at runtime too: build-time validation alone cannot protect a later
 * misconfigured redeploy. Do not log credentials or parsed service accounts. */
export function assertSaasTaxPreviewEnvironment(environment: Environment = process.env): void {
  const failed: string[] = [];
  const check = (condition: boolean, name: string) => { if (!condition) failed.push(name); };
  check(environment.SQUAD_SAAS_TAX_PREVIEW === 'true' &&
    environment.AUDIT_OUTBOUND_PROVIDER_MODE === 'saas-tax-sandbox', 'preview-markers');
  check(environment.VERCEL_ENV === 'preview' && environment.VERCEL_TARGET_ENV === 'preview' &&
    environment.VERCEL_GIT_COMMIT_REF === 'codex/qa-production-audit', 'vercel-target-and-branch');
  check(environment.NEXT_PUBLIC_APP_DISTRIBUTION === 'web', 'web-distribution');
  check(environment.GCLOUD_PROJECT === project && environment.GOOGLE_CLOUD_PROJECT === project, 'firebase-runtime-project');
  check(/^sk_test_[A-Za-z0-9]+$/.test(environment.STRIPE_SECRET_KEY || ''), 'stripe-test-key-format');
  check(/^thesquadv2-[a-z0-9-]+\.vercel\.app$/.test(environment.VERCEL_URL || ''), 'unique-preview-url');
  try {
    const account = parseJson(environment.FIREBASE_SERVICE_ACCOUNT_JSON);
    check(account.project_id === project &&
      /^[^@]+@the-squad-audit-preview\.iam\.gserviceaccount\.com$/.test(account.client_email || '') &&
      Boolean(account.private_key), 'firebase-admin-binding');
  } catch { failed.push('firebase-admin-binding'); }
  try {
    // next.config uses the server config first; validate both when supplied.
    const configs = [environment.FIREBASE_WEBAPP_CONFIG, environment.NEXT_PUBLIC_FIREBASE_WEBAPP_CONFIG].filter(Boolean);
    check(configs.length > 0 && !configs.some(raw => {
      const config = JSON.parse(raw!);
      return config.projectId !== project || config.authDomain !== `${project}.firebaseapp.com`;
    }), 'firebase-client-binding');
  } catch { failed.push('firebase-client-binding'); }
  try {
    const entries = readSaasTaxCatalog(environment.SQUAD_STRIPE_SAAS_TAX_CATALOG);
    check(entries.length === 20 && !entries.some(entry => entry.livemode), 'sandbox-catalog');
  } catch { failed.push('sandbox-catalog'); }
  for (const flag of ['NATIVE_AUTH_ENABLED', 'NEXT_PUBLIC_NATIVE_AUTH_ENABLED', 'NATIVE_BILLING_ENABLED',
      'NATIVE_BILLING_IOS_ENABLED', 'NATIVE_BILLING_ANDROID_ENABLED', 'SQUAD_STRIPE_MANAGED_PAYMENTS_ENABLED',
      'SQUAD_STRIPE_MANAGED_SUBSCRIPTION_CHANGES_ENABLED', 'NEXT_PUBLIC_USE_FIREBASE_EMULATORS']) {
    check(environment[flag] !== 'true', `disabled-${flag}`);
  }
  for (const name of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST', 'FIREBASE_STORAGE_EMULATOR_HOST',
      'CRON_SECRET', 'RESEND_API_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_CONNECT_WEBHOOK_SECRET']) {
    check(!environment[name], `absent-${name}`);
  }
  check(environment.SQUAD_STRIPE_AUTOMATIC_TAX_ENABLED === 'true', 'automatic-tax');
  if (failed.length) throw new SaasTaxPreviewConfigurationError(failed);
}
