const assert = require('node:assert/strict');

function parseServiceAccount(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return JSON.parse(Buffer.from(raw || '', 'base64').toString('utf8'));
  }
}

try {
  assert.equal(process.env.VERCEL_ENV, 'production');
  assert.equal(process.env.NEXT_PUBLIC_APP_DISTRIBUTION, 'web');
  assert.equal(process.env.NEXT_PUBLIC_APP_URL, 'https://www.thesquad.pro');
  assert.notEqual(process.env.NATIVE_AUTH_ENABLED, 'true');
  assert.notEqual(process.env.QA_VERIFICATION_EMAIL_TRANSPORT, 'firebase');

  const serviceAccount = parseServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  assert.equal(serviceAccount.project_id, 'studio-6850142148-fe343');

  console.log('SQUAD_PRODUCTION_WEB_GUARD PASS');
} catch {
  console.error('SQUAD_PRODUCTION_WEB_GUARD BLOCKED');
  process.exit(42);
}
