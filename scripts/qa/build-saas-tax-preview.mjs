import { spawnSync } from 'node:child_process';
import Stripe from 'stripe';
import { assertSaasTaxPreviewEnvironment, SaasTaxPreviewConfigurationError } from '../../src/lib/saas-tax-preview-policy.ts';
import { readSaasTaxCatalog } from '../../src/lib/saas-tax-catalog.ts';
import { verifiedSaasTaxPrice } from '../../src/lib/server-saas-tax-catalog.ts';

// Intentionally separate from the unchanged production guard and preflight.
// This config cannot build against production Firebase or a live Stripe key.
try {
  assertSaasTaxPreviewEnvironment();
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  for (const entry of readSaasTaxCatalog()) await verifiedSaasTaxPrice(stripe, entry);
  console.log('SQUAD_SAAS_TAX_PREVIEW_GUARD PASS; 20 sandbox Prices verified read-only');
} catch (error) {
  console.error('SQUAD_SAAS_TAX_PREVIEW_GUARD BLOCKED; no credential details logged');
  // Only our fixed check names are emitted, never SDK messages or env values.
  console.error('Failed checks:', error instanceof SaasTaxPreviewConfigurationError ? error.checks.join(', ') : 'provider-catalog-readback');
  process.exit(42);
}

const environment = { ...process.env, NEXT_PUBLIC_APP_URL: `https://${process.env.VERCEL_URL}` };
for (const [command, args] of [[process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit']],
  [process.execPath, ['node_modules/next/dist/bin/next', 'build']]]) {
  const result = spawnSync(command, args, { env: environment, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
