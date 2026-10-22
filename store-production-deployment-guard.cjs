const assert = require('node:assert/strict');
const origin = 'https://thesquadv2-native-store-prod-tylers-projects-5b59182e.vercel.app';
try {
  const target = process.env.VERCEL_TARGET_ENV;
  if (target === 'native-ios') {
    assert.equal(process.env.VERCEL, '1');
    assert.equal(process.env.VERCEL_PROJECT_ID, 'prj_UGwsgdfqkFaJPTuELNgDG0Extd3f');
    assert.ok(['production', 'preview'].includes(process.env.VERCEL_ENV));
  } else {
    assert.ok(target === undefined || target === 'production');
    assert.equal(process.env.VERCEL_ENV, 'production');
  }
  assert.equal(process.env.NEXT_PUBLIC_APP_DISTRIBUTION, 'store');
  assert.equal(process.env.NEXT_PUBLIC_APP_URL, origin);
  assert.equal(process.env.NATIVE_AUTH_STORE_ORIGIN, origin);
  assert.equal(process.env.NATIVE_AUTH_ENABLED, 'true');
  assert.equal(process.env.NEXT_PUBLIC_NATIVE_AUTH_ENABLED, 'true');
  assert.equal(process.env.NATIVE_AUTH_ALLOWED_PROVIDERS, 'google.com,apple.com');
  assert.notEqual(process.env.QA_VERIFICATION_EMAIL_TRANSPORT, 'firebase');
  for (const key of ['FIREBASE_AUTH_EMULATOR_HOST', 'FIRESTORE_EMULATOR_HOST', 'FIREBASE_STORAGE_EMULATOR_HOST']) {
    assert.ok(!process.env[key]);
  }
  let account;
  try { account = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON); }
  catch { account = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '', 'base64').toString()); }
  assert.equal(account.project_id, 'studio-6850142148-fe343');
  for (const key of ['NEXT_PUBLIC_FIREBASE_WEBAPP_CONFIG', 'FIREBASE_WEBAPP_CONFIG']) {
    assert.equal(JSON.parse(process.env[key]).projectId, 'studio-6850142148-fe343');
  }
  console.log('SQUAD_PRODUCTION_STORE_GUARD PASS');
} catch {
  console.error('SQUAD_PRODUCTION_STORE_GUARD BLOCKED');
  process.exit(42);
}
