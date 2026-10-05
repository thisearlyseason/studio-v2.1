import assert from 'node:assert/strict';
import test from 'node:test';
import {
  blocksNewsletterDelivery,
  campaignCounterField,
  emailEventTimestampField,
  isResendContactEvent,
  isResendEmailEvent,
  normalizeWebhookEmail,
} from '../src/lib/resend-webhook.ts';

test('Resend delivery events map to deterministic campaign fields', () => {
  assert.equal(isResendEmailEvent('email.delivered'), true);
  assert.equal(emailEventTimestampField('email.delivered'), 'deliveredAt');
  assert.equal(campaignCounterField('email.delivered'), 'deliveredCount');
  assert.equal(campaignCounterField('email.scheduled'), null);
});

test('only permanent delivery risks suppress newsletter recipients', () => {
  assert.equal(blocksNewsletterDelivery('email.bounced'), true);
  assert.equal(blocksNewsletterDelivery('email.complained'), true);
  assert.equal(blocksNewsletterDelivery('email.suppressed'), true);
  assert.equal(blocksNewsletterDelivery('email.failed'), false);
  assert.equal(blocksNewsletterDelivery('email.delivery_delayed'), false);
});

test('contact events and emails are normalized safely', () => {
  assert.equal(isResendContactEvent('contact.updated'), true);
  assert.equal(isResendContactEvent('domain.updated'), false);
  assert.equal(normalizeWebhookEmail('  Person@Example.COM  '), 'person@example.com');
  assert.equal(normalizeWebhookEmail(null), '');
});

