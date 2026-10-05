import { before, after, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, deleteField } from 'firebase/firestore';
const enabled = process.env.CHECKOUT_DELETION_EMULATOR_TEST === '1';
let env;
before(async () => {
  if (!enabled) return;
  if (!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) throw Error('Requires isolated billing emulator');
  env = await initializeTestEnvironment({ projectId: 'demo-native-auth-test', firestore: { host: (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8187').split(':')[0], port: Number((process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8187').split(':')[1]), rules: readFileSync(process.env.CHECKOUT_RULES_TEST_SOURCE || 'firestore.rules', 'utf8') } });
});
after(async () => { await env?.cleanup(); });
test('new browser profiles cannot forge checkout requests or lifecycle guards', { skip: !enabled }, async () => {
  for (const field of ['pendingCheckout', 'subscriptionMutation', 'subscriptionStatus', 'stripe_subscription_status', 'stripeSubscriptionId', 'deletionStatus', 'deletionRequestedAt', 'deletionPurgeAt', 'accountStatus']) {
    const uid = 'forged-create-' + field, db = env.authenticatedContext(uid, { email_verified: true }).firestore();
    await assertFails(setDoc(doc(db, 'users/' + uid), { role: 'coach', [field]: { request: { customer: 'cus_foreign' }, expiresAt: 0 } }));
  }
});
test('existing browser profile cannot modify or remove a server checkout fence; normal edits work', { skip: !enabled }, async () => {
  const uid = 'checkout-rules-owner', lock = { key: 'existing', sessionId: 'cs_test_fenced' };
  await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'users/' + uid), { role: 'coach', pendingCheckout: lock }));
  const ref = doc(env.authenticatedContext(uid, { email_verified: true }).firestore(), 'users/' + uid);
  await assertFails(updateDoc(ref, { pendingCheckout: deleteField() }));
  await assertFails(updateDoc(ref, { 'pendingCheckout.sessionId': 'cs_other' }));
  for (const field of ['subscriptionStatus', 'subscription_status', 'stripe_subscription_status', 'stripeSubscriptionId', 'stripe_subscription_id', 'subscriptionMutation', 'deletionStatus', 'accountStatus']) {
    await assertFails(updateDoc(ref, { [field]: 'forged' }));
  }
  await assertSucceeds(updateDoc(ref, { fullName: 'Normal profile edit' }));
});
test('normal free profile creation remains available to coach, athlete and parent', { skip: !enabled }, async () => {
  for (const role of ['coach', 'adult_player', 'parent']) {
    const uid = 'normal-checkout-profile-' + role;
    const db = env.authenticatedContext(uid, { email_verified: true }).firestore();
    await assertSucceeds(setDoc(doc(db, 'users/' + uid), { role, fullName: 'QA ' + role }));
  }
});
