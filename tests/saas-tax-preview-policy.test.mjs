import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { assertSaasTaxPreviewEnvironment } from '../src/lib/saas-tax-preview-policy.ts';
import { assertOutboundProviderAllowed, isOutboundProviderBlocked } from '../src/lib/server-outbound-provider-policy.ts';
import { saasTaxFixture } from './helpers/saas-tax-fixture.mjs';

const project = 'the-squad-audit-preview';
const valid = {
  SQUAD_SAAS_TAX_PREVIEW: 'true', AUDIT_OUTBOUND_PROVIDER_MODE: 'saas-tax-sandbox',
  VERCEL_ENV: 'preview', VERCEL_TARGET_ENV: 'preview', VERCEL_GIT_COMMIT_REF: 'codex/qa-production-audit',
  VERCEL_URL: 'thesquadv2-synthetic.vercel.app',
  NEXT_PUBLIC_APP_DISTRIBUTION: 'web', GCLOUD_PROJECT: project, GOOGLE_CLOUD_PROJECT: project,
  STRIPE_SECRET_KEY: 'sk_test_synthetic',
  FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({ project_id: project, client_email: `fixture@${project}.iam.gserviceaccount.com`, private_key: 'synthetic' }),
  NEXT_PUBLIC_FIREBASE_WEBAPP_CONFIG: JSON.stringify({ projectId: project, authDomain: `${project}.firebaseapp.com` }),
  SQUAD_STRIPE_SAAS_TAX_CATALOG: saasTaxFixture().raw, SQUAD_STRIPE_AUTOMATIC_TAX_ENABLED: 'true',
};

test('dedicated sandbox preview permits Stripe only and preserves the old audit block', () => {
  assert.doesNotThrow(() => assertSaasTaxPreviewEnvironment(valid));
  assert.doesNotThrow(() => assertOutboundProviderAllowed('stripe', valid));
  assert.equal(isOutboundProviderBlocked(valid), true);
  for (const kind of ['resend', 'notification']) assert.throws(() => assertOutboundProviderAllowed(kind, valid), /blocked/);
  assert.throws(() => assertOutboundProviderAllowed('stripe', { ...valid, AUDIT_OUTBOUND_PROVIDER_MODE: 'block' }), /isolated emulator audit/);
  assert.doesNotThrow(() => assertOutboundProviderAllowed('stripe', { STRIPE_SECRET_KEY: 'sk_live_synthetic' }));
});

test('preview rejects production data, live credentials, missing markers and inherited effects at runtime', () => {
  const mutations = [
    { VERCEL_ENV: 'production' }, { VERCEL_TARGET_ENV: 'native-ios' }, { VERCEL_GIT_COMMIT_REF: 'fix' },
    { SQUAD_SAAS_TAX_PREVIEW: undefined }, { AUDIT_OUTBOUND_PROVIDER_MODE: undefined },
    { STRIPE_SECRET_KEY: 'sk_live_synthetic' }, { STRIPE_SECRET_KEY: undefined },
    { NEXT_PUBLIC_APP_DISTRIBUTION: 'store' }, { VERCEL_URL: 'www.thesquad.pro' },
    { GCLOUD_PROJECT: 'studio-6850142148-fe343' }, { GOOGLE_CLOUD_PROJECT: 'studio-6850142148-fe343' },
    { FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({ project_id: 'studio-6850142148-fe343' }) },
    { FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({ project_id: project, client_email: 'fixture@studio-6850142148-fe343.iam.gserviceaccount.com', private_key: 'synthetic' }) },
    { FIREBASE_SERVICE_ACCOUNT_JSON: 'secret-invalid-json' }, { NEXT_PUBLIC_FIREBASE_WEBAPP_CONFIG: undefined },
    { FIREBASE_WEBAPP_CONFIG: JSON.stringify({ projectId: 'studio-6850142148-fe343' }) },
    { SQUAD_STRIPE_SAAS_TAX_CATALOG: undefined },
    { SQUAD_STRIPE_SAAS_TAX_CATALOG: JSON.stringify({ ...saasTaxFixture().config, livemode: true }) },
    { SQUAD_STRIPE_AUTOMATIC_TAX_ENABLED: 'false' },
    ...['NATIVE_AUTH_ENABLED', 'NEXT_PUBLIC_NATIVE_AUTH_ENABLED', 'NATIVE_BILLING_ENABLED', 'NATIVE_BILLING_IOS_ENABLED',
      'NATIVE_BILLING_ANDROID_ENABLED', 'SQUAD_STRIPE_MANAGED_PAYMENTS_ENABLED', 'SQUAD_STRIPE_MANAGED_SUBSCRIPTION_CHANGES_ENABLED',
      'NEXT_PUBLIC_USE_FIREBASE_EMULATORS'].map(name => ({ [name]: 'true' })),
    ...['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST', 'FIREBASE_STORAGE_EMULATOR_HOST',
      'CRON_SECRET', 'RESEND_API_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_CONNECT_WEBHOOK_SECRET'].map(name => ({ [name]: 'synthetic-inherited-value' })),
  ];
  for (const override of mutations) {
    assert.throws(() => assertSaasTaxPreviewEnvironment({ ...valid, ...override }), /configuration is invalid/);
    assert.throws(() => assertOutboundProviderAllowed('stripe', { ...valid, ...override }), /blocked/);
  }
});

test('invalid preview build stops before provider access and never emits credentials', () => {
  const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/qa/build-saas-tax-preview.mjs'], {
    env: { PATH: process.env.PATH, STRIPE_SECRET_KEY: 'sk_live_mustneverappear' }, encoding: 'utf8',
  });
  assert.equal(result.status, 42, result.stderr);
  assert.match(result.stderr, /GUARD BLOCKED/);
  assert.match(result.stderr, /Failed checks: preview-markers, vercel-target-and-branch/);
  assert.doesNotMatch(result.stderr + result.stdout, /sk_live_mustneverappear/);
});

test('preview deployment has no cron and leaves the production build path intact', () => {
  const preview = JSON.parse(readFileSync(new URL('../vercel.saas-tax-preview.json', import.meta.url), 'utf8'));
  const production = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.deepEqual(preview.crons, []);
  assert.match(preview.buildCommand, /build-saas-tax-preview/);
  assert.match(production.buildCommand, /^node production-deployment-guard\.cjs && npm run verify:env/);
  assert.equal(production.crons.length, 1);
});
