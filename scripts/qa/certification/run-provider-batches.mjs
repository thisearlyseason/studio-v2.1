import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import Stripe from 'stripe';
import { Webhook } from 'svix';

import { assertProviderSafety } from './provider-safety.mjs';

const EXACT_PROJECT_ID = 'the-squad-v2-staging';
const EXACT_ORIGIN = 'https://studio--the-squad-v2-staging.us-east4.hosted.app';

function hashId(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function buildProviderProbePlan({ origin, runId, recipient }) {
  const stripeId = `evt_${runId.replace(/[^a-z0-9_]/gi, '_')}_standard`;
  const connectId = `evt_${runId.replace(/[^a-z0-9_]/gi, '_')}_connect`;
  const resendDeliveryId = `msg_${runId.replace(/[^a-z0-9_]/gi, '_')}`;
  const resendEmailId = `email_${runId.replace(/[^a-z0-9_]/gi, '_')}`;
  return [
    {
      kind: 'stripe-standard',
      pathname: '/api/webhook',
      url: `${origin}/api/webhook`,
      eventId: stripeId,
      replay: true,
      cleanupPaths: [`stripeWebhookEvents/${stripeId}`],
    },
    {
      kind: 'stripe-connect',
      pathname: '/api/stripe/connect/webhook',
      url: `${origin}/api/stripe/connect/webhook`,
      eventId: connectId,
      replay: true,
      cleanupPaths: [`stripeConnectWebhookEvents/${connectId}`],
    },
    {
      kind: 'resend',
      pathname: '/api/webhooks/resend',
      url: `${origin}/api/webhooks/resend`,
      deliveryId: resendDeliveryId,
      emailId: resendEmailId,
      recipient,
      replay: true,
      cleanupPaths: [
        `newsletter_webhook_events/${hashId(resendDeliveryId)}`,
        `newsletter_email_events/${hashId(resendEmailId)}`,
      ],
    },
  ];
}

const SECRET_FIELDS = /(?:key|secret|token|authorization|cookie|providerObjectId)$/i;

export function sanitizeProviderEvidence(value) {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !SECRET_FIELDS.test(key)));
}

function readSecret(projectId, name) {
  return execFileSync('gcloud', [
    'secrets', 'versions', 'access', 'latest',
    `--project=${projectId}`,
    `--secret=${name}`,
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1024 * 1024 }).trim();
}

async function expectJson(url, init, expectedStatus) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = {}; }
  if (response.status !== expectedStatus) {
    throw new Error(`${new URL(url).pathname} returned ${response.status}, expected ${expectedStatus}`);
  }
  return { status: response.status, body };
}

function stripeEvent(id, account) {
  return {
    id,
    object: 'event',
    api_version: '2025-02-24.acacia',
    created: Math.floor(Date.now() / 1000),
    data: { object: { id: `probe_${id}`, object: 'certification_probe' } },
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type: 'certification.probe',
    ...(account ? { account } : {}),
  };
}

async function runStripeProbe({ probe, secret, stripe, account }) {
  const payload = JSON.stringify(stripeEvent(probe.eventId, account));
  await expectJson(probe.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'stripe-signature': 'forged' },
    body: payload,
  }, 400);
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret });
  const first = await expectJson(probe.url, {
    method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': signature }, body: payload,
  }, 200);
  const replay = await expectJson(probe.url, {
    method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': signature }, body: payload,
  }, 200);
  if (first.body?.received !== true || replay.body?.duplicate !== true) {
    throw new Error(`${probe.kind} did not acknowledge the valid event and replay exactly once`);
  }
  return { kind: probe.kind, forgedStatus: 400, validStatus: 200, replayStatus: 200, duplicate: true };
}

async function runResendProbe({ probe, secret }) {
  const createdAt = new Date().toISOString();
  const payload = JSON.stringify({
    type: 'email.sent',
    created_at: createdAt,
    data: {
      email_id: probe.emailId,
      created_at: createdAt,
      from: 'The Squad QA <noreply@thesquad.pro>',
      to: [probe.recipient],
      subject: 'Final certification webhook probe',
    },
  });
  const timestamp = new Date();
  const signature = new Webhook(secret).sign(probe.deliveryId, timestamp, payload);
  const headers = {
    'content-type': 'application/json',
    'svix-id': probe.deliveryId,
    'svix-timestamp': String(Math.floor(timestamp.getTime() / 1000)),
    'svix-signature': signature,
  };
  await expectJson(probe.url, {
    method: 'POST', headers: { ...headers, 'svix-signature': 'v1,forged' }, body: payload,
  }, 400);
  const first = await expectJson(probe.url, { method: 'POST', headers, body: payload }, 200);
  const replay = await expectJson(probe.url, { method: 'POST', headers, body: payload }, 200);
  if (first.body?.received !== true || replay.body?.duplicate !== true) {
    throw new Error('Resend did not acknowledge the valid event and replay exactly once');
  }
  return { kind: probe.kind, forgedStatus: 400, validStatus: 200, replayStatus: 200, duplicate: true };
}

function initializeStagingAdmin(projectId) {
  if (getApps().length > 0) return getFirestore();
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  initializeApp({
    projectId,
    credential: serviceAccount ? cert(JSON.parse(serviceAccount)) : applicationDefault(),
  });
  return getFirestore();
}

export async function main({
  projectId = process.env.CERTIFICATION_PROJECT_ID || EXACT_PROJECT_ID,
  origin = process.env.CERTIFICATION_STAGING_ORIGIN || EXACT_ORIGIN,
  recipient = process.env.CERTIFICATION_RECIPIENT || '',
  approvedRecipient = process.env.CERTIFICATION_APPROVED_RECIPIENT || '',
} = {}) {
  const stripeKey = readSecret(projectId, 'STRIPE_SECRET_KEY');
  const stripeWebhookSecret = readSecret(projectId, 'STRIPE_WEBHOOK_SECRET');
  const stripeConnectWebhookSecret = readSecret(projectId, 'STRIPE_CONNECT_WEBHOOK_SECRET');
  const resendWebhookSecret = readSecret(projectId, 'RESEND_WEBHOOK_SECRET');
  const stripe = new Stripe(stripeKey);
  const balance = await stripe.balance.retrieve();
  assertProviderSafety({
    projectId, origin, recipient, approvedRecipient, stripeKey, livemode: balance.livemode,
  });

  const runId = `provider-cert-${Date.now()}-${randomBytes(3).toString('hex')}`;
  const plan = buildProviderProbePlan({ origin, runId, recipient });
  const db = initializeStagingAdmin(projectId);
  const results = [];
  try {
    results.push(await runStripeProbe({ probe: plan[0], secret: stripeWebhookSecret, stripe }));
    results.push(await runStripeProbe({
      probe: plan[1], secret: stripeConnectWebhookSecret, stripe, account: 'acct_certification_probe',
    }));
    results.push(await runResendProbe({ probe: plan[2], secret: resendWebhookSecret }));

    for (const probe of plan) {
      for (const documentPath of probe.cleanupPaths) {
        const snapshot = await db.doc(documentPath).get();
        if (!snapshot.exists || snapshot.data()?.status !== 'completed') {
          throw new Error(`${probe.kind} staging ledger did not reach completed state`);
        }
      }
    }
  } finally {
    await Promise.all(plan.flatMap(probe => probe.cleanupPaths.map(documentPath => db.doc(documentPath).delete())));
  }

  const evidence = sanitizeProviderEvidence({
    runId,
    projectId,
    origin,
    providerMode: 'test',
    results,
    cleanupDeleted: plan.reduce((count, probe) => count + probe.cleanupPaths.length, 0),
  });
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
  return evidence;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    process.stderr.write(`Provider certification failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
