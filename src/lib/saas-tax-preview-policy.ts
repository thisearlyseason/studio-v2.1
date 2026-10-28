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

/** A separate preview, never an exception to the existing audit's block mode.
 * Validate at runtime too: build-time validation alone cannot protect a later
 * misconfigured redeploy. Do not log credentials or parsed service accounts. */
export function assertSaasTaxPreviewEnvironment(environment: Environment = process.env): void {
  try {
    if (environment.SQUAD_SAAS_TAX_PREVIEW !== 'true' ||
        environment.AUDIT_OUTBOUND_PROVIDER_MODE !== 'saas-tax-sandbox' ||
        environment.VERCEL_ENV !== 'preview' || environment.VERCEL_TARGET_ENV !== 'preview' ||
        environment.VERCEL_GIT_COMMIT_REF !== 'codex/qa-production-audit' ||
        environment.NEXT_PUBLIC_APP_DISTRIBUTION !== 'web' ||
        environment.GCLOUD_PROJECT !== project || environment.GOOGLE_CLOUD_PROJECT !== project ||
        !/^sk_test_[A-Za-z0-9]+$/.test(environment.STRIPE_SECRET_KEY || '') ||
        !/^thesquadv2-[a-z0-9-]+\.vercel\.app$/.test(environment.VERCEL_URL || '')) throw new Error();

    const account = parseJson(environment.FIREBASE_SERVICE_ACCOUNT_JSON);
    if (account.project_id !== project ||
        !/^[^@]+@the-squad-audit-preview\.iam\.gserviceaccount\.com$/.test(account.client_email || '') ||
        !account.private_key) throw new Error();
    // next.config uses the server config first; validate both when supplied.
    const configs = [environment.FIREBASE_WEBAPP_CONFIG, environment.NEXT_PUBLIC_FIREBASE_WEBAPP_CONFIG].filter(Boolean);
    if (!configs.length || configs.some(raw => {
      const config = JSON.parse(raw!);
      return config.projectId !== project || config.authDomain !== `${project}.firebaseapp.com`;
    })) throw new Error();

    const entries = readSaasTaxCatalog(environment.SQUAD_STRIPE_SAAS_TAX_CATALOG);
    if (entries.length !== 20 || entries.some(entry => entry.livemode)) throw new Error();
    for (const flag of ['NATIVE_AUTH_ENABLED', 'NEXT_PUBLIC_NATIVE_AUTH_ENABLED', 'NATIVE_BILLING_ENABLED',
      'NATIVE_BILLING_IOS_ENABLED', 'NATIVE_BILLING_ANDROID_ENABLED', 'SQUAD_STRIPE_MANAGED_PAYMENTS_ENABLED',
      'SQUAD_STRIPE_MANAGED_SUBSCRIPTION_CHANGES_ENABLED', 'NEXT_PUBLIC_USE_FIREBASE_EMULATORS']) {
      if (environment[flag] === 'true') throw new Error();
    }
    for (const name of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST', 'FIREBASE_STORAGE_EMULATOR_HOST',
      'CRON_SECRET', 'RESEND_API_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_CONNECT_WEBHOOK_SECRET']) {
      if (environment[name]) throw new Error();
    }
    if (environment.SQUAD_STRIPE_AUTOMATIC_TAX_ENABLED !== 'true') throw new Error();
  } catch {
    throw new Error('The isolated SaaS tax preview configuration is invalid. Provider access is blocked.');
  }
}
