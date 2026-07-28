import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  createNewsletterUnsubscribeToken,
  matchesNewsletterUnsubscribeToken,
} from '../src/lib/newsletter-unsubscribe.ts';

const readSource = path => readFile(new URL(path, import.meta.url), 'utf8');

test('newsletter unsubscribe validation supports stable and legacy signing secrets', () => {
  const email = 'subscriber@example.com';
  const stableToken = createNewsletterUnsubscribeToken(email, 'stable-secret');
  const legacyToken = createNewsletterUnsubscribeToken(email, 'legacy-resend-key');

  assert.equal(
    matchesNewsletterUnsubscribeToken(email, stableToken, ['stable-secret', 'legacy-resend-key']),
    true
  );
  assert.equal(
    matchesNewsletterUnsubscribeToken(email, legacyToken, ['stable-secret', 'legacy-resend-key']),
    true
  );
  assert.equal(matchesNewsletterUnsubscribeToken(email, stableToken, ['wrong-secret']), false);
  assert.equal(matchesNewsletterUnsubscribeToken('other@example.com', stableToken, ['stable-secret']), false);
  assert.equal(matchesNewsletterUnsubscribeToken(email, 'not-a-token', ['stable-secret']), false);
});

test('production validation requires a dedicated unsubscribe secret', async () => {
  const environmentCheck = await readSource('../scripts/check-production-env.mjs');
  assert.match(environmentCheck, /'NEWSLETTER_UNSUBSCRIBE_SECRET'/);
  assert.match(environmentCheck, /NEWSLETTER_UNSUBSCRIBE_SECRET must be at least 32 characters/);
});

test('team emails use recipient-private Resend batches', async () => {
  const route = await readSource('../src/app/api/email/send/route.ts');

  assert.match(route, /RESEND_BATCH_SIZE = 100/);
  assert.match(route, /resend\.batch\.send/);
  assert.match(route, /to: \[recipient\]/);
  assert.doesNotMatch(route, /emails\.send\(\{[\s\S]{0,120}to,/);
});

test('contact delivery is accepted first and confirmed by webhook events', async () => {
  const contact = await readSource('../src/app/api/contact/route.ts');
  const webhook = await readSource('../src/app/api/webhooks/resend/route.ts');

  assert.match(contact, /deliveryStatus: 'accepted'/);
  assert.match(contact, /resendEmailId: data\.id/);
  assert.match(contact, /idempotencyKey: documentId/);
  assert.doesNotMatch(contact, /deliveryStatus: 'sent'/);
  assert.match(webhook, /where\('resendEmailId', '==', emailId\)/);
  assert.match(webhook, /'email\.delivered': 'delivered'/);
});

test('admin notification and beta welcome callers check email responses', async () => {
  const notifyAdmin = await readSource('../src/app/api/public/notify-admin/route.ts');
  const admin = await readSource('../src/app/admin/page.tsx');
  const landing = await readSource('../src/app/page.tsx');
  const beta = await readSource('../src/app/beta/page.tsx');

  assert.match(notifyAdmin, /status: 502/);
  assert.match(admin, /if \(!welcomeResponse\.ok\)/);
  assert.match(admin, /welcomeEmailSent/);
  assert.match(landing, /if \(!response\.ok\)/);
  assert.match(beta, /if \(!response\.ok\)/);
});
