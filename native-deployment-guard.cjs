const assert = require('node:assert/strict');

try {
  assert.equal(process.env.VERCEL_ENV, 'preview');
  assert.equal(process.env.VERCEL_TARGET_ENV, 'native-ios');
  assert.equal(process.env.NEXT_PUBLIC_APP_DISTRIBUTION, 'store');
  assert.equal(process.env.NATIVE_BILLING_ENABLED, 'false');
  assert.equal(process.env.NATIVE_BILLING_IOS_ENABLED, 'true');
  assert.equal(process.env.NATIVE_BILLING_ANDROID_ENABLED, 'false');
  assert.notEqual(process.env.SQUAD_SAAS_TAX_PREVIEW, 'true');
  assert.notEqual(process.env.QA_VERIFICATION_EMAIL_TRANSPORT, 'firebase');
  for (const key of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST', 'FIREBASE_STORAGE_EMULATOR_HOST']) {
    assert(!process.env[key]);
  }
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '';
  let serviceAccount;
  try { serviceAccount = JSON.parse(raw); }
  catch { serviceAccount = JSON.parse(Buffer.from(raw, 'base64').toString('utf8')); }
  assert.equal(serviceAccount.project_id, 'studio-6850142148-fe343');
  console.log('SQUAD_NATIVE_STORE_GUARD PASS');
} catch {
  console.error('SQUAD_NATIVE_STORE_GUARD BLOCKED');
  process.exit(42);
}
