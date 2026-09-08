import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { Resend } from 'resend';
import { Webhook } from 'svix';

const STAGING_PROJECT_ID = 'the-squad-v2-staging';
const STAGING_ORIGIN = 'https://studio--the-squad-v2-staging.us-east4.hosted.app';
const RUN_ID_PATTERN = /^email-cert-[a-z0-9-]{3,64}$/;
const TEST_IP = '192.0.2.44';
const TEST_UA = 'TheSquadFinalCertification/1.0';

function refuse(reason) {
  throw new Error(`Refusing email identity certification: ${reason}`);
}

export function assertEmailIdentitySafety({ projectId, origin, runId, approvedRecipient, resendKey }) {
  if (projectId !== STAGING_PROJECT_ID || origin !== STAGING_ORIGIN) refuse('target is not isolated staging');
  if (!RUN_ID_PATTERN.test(String(runId))) refuse('run identifier is not staging-owned');
  if (typeof approvedRecipient !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(approvedRecipient)) refuse('approved recipient is missing');
  if (!String(resendKey || '').startsWith('re_')) refuse('Resend credential is invalid');
}

export function deriveApprovedAliases(approvedRecipient, runId) {
  const at = approvedRecipient.lastIndexOf('@');
  if (at <= 0) refuse('approved recipient is invalid');
  const local = approvedRecipient.slice(0, at).replace(/\+.*/, '');
  const domain = approvedRecipient.slice(at + 1);
  const suffix = runId.replace(/^email-cert-/, '').slice(0, 36);
  return Object.fromEntries([
    'adult_player', 'parent', 'coach', 'admin', 'league_creator', 'youth_player', 'unknown',
  ].map(role => [role, `${local}+squad-${suffix}-${role.replaceAll('_', '-')}@${domain}`]));
}

export function deliveryRecipientForRole(approvedRecipient, role) {
  if (!['adult_player', 'parent', 'coach', 'admin', 'league_creator', 'youth_player'].includes(role)) refuse('delivery role is not approved');
  if (typeof approvedRecipient !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(approvedRecipient)) refuse('approved recipient is invalid');
  return approvedRecipient;
}

export function requiredEmailIdentityObservations() {
  return [
    'five-role-verification-delivered',
    'known-reset-delivered-unknown-neutral',
    'durable-session-block-and-revocation',
    'youth-invitation-delivered-and-consumed-once',
    'resend-unknown-message-isolated-and-replay-safe',
  ];
}

export function emailHasDelivered(status) {
  return ['delivered', 'opened', 'clicked'].includes(status);
}

export function buildEmailIdentityCleanupGraph(runId) {
  if (!RUN_ID_PATTERN.test(String(runId))) refuse('run identifier is not staging-owned');
  const roles = ['adult-player', 'parent', 'coach', 'admin', 'league-creator'];
  const userIds = [...roles.map(role => `${runId}-${role}`), `${runId}-youth`];
  return {
    userIds,
    firestorePaths: [
      ...userIds.map(uid => `users/${uid}`),
      `players/${runId}-child`,
      `teams/${runId}-team`,
      `certificationEmailRuns/${runId}`,
    ],
  };
}

export function assertEmailIdentityCleanup({ firestore, auth, syntheticLedgers }) {
  const result = { firestore, auth, syntheticLedgers, total: firestore + auth + syntheticLedgers };
  if (result.total !== 0) throw new Error(`Email identity cleanup left ${result.total} residual resource(s)`);
  return result;
}

export async function resolveRedeemedYouthUid(payload, auth, email) {
  if (typeof payload?.uid === 'string' && payload.uid) return payload.uid;
  return (await auth.getUserByEmail(email)).uid;
}

function hash(value) {
  return createHash('sha256').update(value).digest('hex');
}

function readSecret(name) {
  return execFileSync('gcloud', [
    'secrets', 'versions', 'access', 'latest',
    `--project=${STAGING_PROJECT_ID}`, `--secret=${name}`,
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1024 * 1024 }).trim();
}

function readSdkConfig() {
  const raw = execFileSync('npx', [
    'firebase', 'apps:sdkconfig', 'WEB', '1:100620894746:web:936e8e921c9c41851d87a3',
    `--project=${STAGING_PROJECT_ID}`, '--json',
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1024 * 1024 });
  return JSON.parse(raw).result.sdkConfig;
}

function services() {
  if (getApps().length === 0) initializeApp({ projectId: STAGING_PROJECT_ID, credential: applicationDefault() });
  return { auth: getAuth(), db: getFirestore() };
}

async function signIn(apiKey, email, password) {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }), signal: AbortSignal.timeout(30_000),
  });
  const body = await response.json();
  if (!response.ok || !body.idToken) throw new Error(`Staging sign-in failed with ${response.status}`);
  return body.idToken;
}

async function request(pathname, { method = 'GET', token, body, cookie, expectedStatus = 200, discriminator = '' } = {}) {
  const response = await fetch(`${STAGING_ORIGIN}${pathname}`, {
    method,
    headers: {
      'user-agent': TEST_UA,
      'x-forwarded-for': TEST_IP,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(cookie ? { cookie: `__session=${cookie}` } : {}),
      ...(discriminator ? { 'x-certification-discriminator': discriminator } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(60_000),
  });
  const text = await response.text();
  let payload = {};
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = {}; }
  if (response.status !== expectedStatus) throw new Error(`${method} ${pathname} returned ${response.status}, expected ${expectedStatus}: ${payload.error || text.slice(0, 120)}`);
  return { payload, headers: response.headers };
}

async function waitFor(description, check, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try { if (await check()) return; } catch (error) { lastError = error; }
    await new Promise(resolve => setTimeout(resolve, 2_000));
  }
  throw new Error(`${description} did not converge${lastError ? `: ${lastError.message}` : ''}`);
}

async function waitForEmailDelivery(resend, id) {
  let status = '';
  await waitFor(`Resend delivery ${id}`, async () => {
    const response = await resend.emails.get(id);
    if (response.error) throw new Error(response.error.message);
    status = response.data?.last_event || '';
    if (['failed', 'bounced', 'suppressed'].includes(status)) throw new Error(`terminal delivery state ${status}`);
    return emailHasDelivered(status);
  });
  return status;
}

function sessionCookie(headers) {
  const value = headers.get('set-cookie') || '';
  return /__session=([^;]+)/.exec(value)?.[1] || '';
}

async function findLatestEmailTo(resend, recipient, createdAfter) {
  const listed = await resend.emails.list({ limit: 100 });
  if (listed.error) throw new Error(listed.error.message);
  return listed.data?.data.find(email => email.to.includes(recipient) && Date.parse(email.created_at) >= createdAfter) || null;
}

function publicRateLimitPath(scope, discriminator) {
  const fingerprint = hash(`${TEST_IP}:${TEST_UA}:${discriminator}`);
  return `apiRateLimits/${hash(`public-${scope}:${fingerprint}`)}`;
}

function userRateLimitPath(scope, uid) {
  return `apiRateLimits/${hash(`${scope}:${uid}`)}`;
}

export async function main({
  projectId = STAGING_PROJECT_ID,
  origin = STAGING_ORIGIN,
  runId = `email-cert-${Date.now()}`,
} = {}) {
  const resendKey = readSecret('RESEND_API_KEY');
  const resendWebhookSecret = readSecret('RESEND_WEBHOOK_SECRET');
  const approvedRecipient = readSecret('OWNER_NOTIFICATION_EMAIL').trim().toLowerCase();
  assertEmailIdentitySafety({ projectId, origin, runId, approvedRecipient, resendKey });
  const aliases = deriveApprovedAliases(approvedRecipient, runId);
  const resend = new Resend(resendKey);
  const { auth, db } = services();
  const sdk = readSdkConfig();
  const graph = buildEmailIdentityCleanupGraph(runId);
  const roles = ['adult_player', 'parent', 'coach', 'admin', 'league_creator'];
  const roleUids = Object.fromEntries(roles.map((role, index) => [role, graph.userIds[index]]));
  const youthUid = graph.userIds[5];
  const password = 'Staging-Identity-QA!4096';
  const childId = `${runId}-child`;
  const teamId = `${runId}-team`;
  const syntheticDeliveryId = `msg-${runId}-unknown`;
  const syntheticEmailId = `email-${runId}-unknown`;
  const targetSubscriberPath = `newsletter_subscribers/${hash(approvedRecipient)}`;
  const unrelatedEmail = aliases.unknown;
  const unrelatedSubscriberPath = `newsletter_subscribers/${hash(unrelatedEmail)}`;
  const syntheticPaths = [
    `newsletter_webhook_events/${hash(syntheticDeliveryId)}`,
    `newsletter_email_events/${hash(syntheticEmailId)}`,
    targetSubscriberPath,
    unrelatedSubscriberPath,
  ];
  const publicRatePaths = new Set();
  const userRatePaths = new Set();
  const dynamicPaths = new Set();
  let evidence;
  try {
    await Promise.all(graph.userIds.map(async uid => {
      try { await auth.deleteUser(uid); } catch (error) { if (error?.code !== 'auth/user-not-found') throw error; }
    }));
    await db.doc(`certificationEmailRuns/${runId}`).set({ runId, createdAt: new Date().toISOString() });

    const deliveryStates = {};
    for (const role of roles) {
      const uid = roleUids[role];
      const recipient = deliveryRecipientForRole(approvedRecipient, role);
      await auth.createUser({ uid, email: recipient, password, displayName: `Certification ${role}`, emailVerified: false });
      await db.doc(`users/${uid}`).set({ id: uid, fullName: `Certification ${role}`, email: recipient, role, accountStatus: 'active', fixtureRunId: runId });
      const token = await signIn(sdk.apiKey, recipient, password);
      const verification = await request('/api/email/verify-email', { method: 'POST', token, body: { name: `Certification ${role}` } });
      const emailId = verification.payload.id;
      if (typeof emailId !== 'string') throw new Error(`Verification email ID missing for ${role}`);
      deliveryStates[role] = await waitForEmailDelivery(resend, emailId);
      userRatePaths.add(userRateLimitPath('verification-email', uid));
      await auth.deleteUser(uid);
    }
    const observations = ['five-role-verification-delivered'];

    const sessionUid = roleUids.coach;
    await auth.createUser({ uid: sessionUid, email: approvedRecipient, password, displayName: 'Certification coach', emailVerified: true });
    const verifiedToken = await signIn(sdk.apiKey, approvedRecipient, password);
    const firstSession = await request('/api/auth/session', { method: 'POST', token: verifiedToken });
    const secondSession = await request('/api/auth/session', { method: 'POST', token: verifiedToken });
    const firstCookie = sessionCookie(firstSession.headers);
    const secondCookie = sessionCookie(secondSession.headers);
    if (!firstCookie || !secondCookie) throw new Error('Hosted session cookies were not returned');
    await request('/api/auth/session', { cookie: firstCookie });
    await request('/api/auth/session', { cookie: secondCookie });
    await db.doc(`users/${sessionUid}`).update({ accountStatus: 'pending_deletion' });
    await request('/api/auth/session', { cookie: firstCookie, expectedStatus: 403 });
    await request('/api/auth/session', { cookie: secondCookie, expectedStatus: 403 });
    await db.doc(`users/${sessionUid}`).update({ accountStatus: 'active' });
    await new Promise(resolve => setTimeout(resolve, 1_100));
    await auth.revokeRefreshTokens(sessionUid);
    await new Promise(resolve => setTimeout(resolve, 2_000));
    await request('/api/auth/session', { cookie: firstCookie, expectedStatus: 401 });
    await request('/api/auth/session', { cookie: secondCookie, expectedStatus: 401 });
    observations.push('durable-session-block-and-revocation');

    const resetStartedAt = Date.now() - 1_000;
    const knownReset = await request('/api/email/reset-password', { method: 'POST', body: { email: approvedRecipient } });
    if (knownReset.payload.success !== true) throw new Error('Known password reset did not return the neutral success response');
    publicRatePaths.add(publicRateLimitPath('reset-password', approvedRecipient));
    let resetEmail;
    await waitFor('known password-reset email', async () => {
      resetEmail = await findLatestEmailTo(resend, approvedRecipient, resetStartedAt);
      return Boolean(resetEmail);
    });
    await waitForEmailDelivery(resend, resetEmail.id);
    const unknownStartedAt = Date.now() - 500;
    const unknownReset = await request('/api/email/reset-password', { method: 'POST', body: { email: aliases.unknown } });
    if (unknownReset.payload.success !== true) throw new Error('Unknown password reset disclosed account existence');
    publicRatePaths.add(publicRateLimitPath('reset-password', aliases.unknown));
    await new Promise(resolve => setTimeout(resolve, 3_000));
    if (await findLatestEmailTo(resend, aliases.unknown, unknownStartedAt)) throw new Error('Unknown password reset sent an email');
    await request('/api/email/reset-password', { method: 'POST', body: { email: 'invalid' }, expectedStatus: 400 });
    observations.push('known-reset-delivered-unknown-neutral');

    const parentUid = roleUids.parent;
    await auth.deleteUser(sessionUid);
    await auth.createUser({ uid: parentUid, email: approvedRecipient, password, displayName: 'Certification parent', emailVerified: true });
    const parentToken = await signIn(sdk.apiKey, approvedRecipient, password);
    await Promise.all([
      db.doc(`players/${childId}`).set({ id: childId, firstName: 'Certification', lastName: 'Athlete', parentId: parentUid, hasLogin: false, fixtureRunId: runId }),
      db.doc(`teams/${teamId}`).set({ id: teamId, name: runId, ownerUserId: roleUids.coach, planId: 'team', isPro: true, fixtureRunId: runId }),
      db.doc(`teams/${teamId}/members/${childId}`).set({ id: childId, playerId: childId, parentId: parentUid, teamId, role: 'Player', status: 'active', fixtureRunId: runId }),
    ]);
    const youthMailStartedAt = Date.now() - 1_000;
    const invite = await request('/api/invites/youth', {
      method: 'POST', token: parentToken,
      body: { action: 'create', childId, email: deliveryRecipientForRole(approvedRecipient, 'youth_player') },
    });
    userRatePaths.add(userRateLimitPath('youth-invite-manage', parentUid));
    if (!/^[a-f0-9]{48}$/.test(invite.payload.token || '')) throw new Error('Youth invitation token was not returned');
    dynamicPaths.add(`invites/${invite.payload.token}`);
    let youthEmail;
    await waitFor('youth invitation email', async () => {
      youthEmail = await findLatestEmailTo(resend, approvedRecipient, youthMailStartedAt);
      return Boolean(youthEmail);
    });
    await waitForEmailDelivery(resend, youthEmail.id);
    await request(`/api/invites/youth?token=${invite.payload.token}`);
    publicRatePaths.add(publicRateLimitPath('youth-invite-lookup', invite.payload.token));
    await auth.deleteUser(parentUid);
    const redemption = await request('/api/invites/youth', { method: 'PUT', body: { token: invite.payload.token, password } });
    if (!redemption.payload.ok) throw new Error('Youth invitation was not redeemed');
    const redeemedYouthUid = await resolveRedeemedYouthUid(redemption.payload, auth, approvedRecipient);
    if (redeemedYouthUid !== youthUid) {
      dynamicPaths.add(`users/${redeemedYouthUid}`);
      graph.userIds[5] = redeemedYouthUid;
    }
    publicRatePaths.add(publicRateLimitPath('youth-invite-redeem', invite.payload.token));
    await request(`/api/invites/youth?token=${invite.payload.token}`, { expectedStatus: 404 });
    if ((await db.doc(`users/${redeemedYouthUid}`).get()).data()?.role !== 'youth_player') throw new Error('Redeemed youth role was not persisted');
    observations.push('youth-invitation-delivered-and-consumed-once');

    await Promise.all([
      db.doc(targetSubscriberPath).set({ email: approvedRecipient, isActive: true, fixtureRunId: runId }),
      db.doc(unrelatedSubscriberPath).set({ email: unrelatedEmail, isActive: true, fixtureRunId: runId }),
    ]);
    const createdAt = new Date().toISOString();
    const webhookBody = JSON.stringify({
      type: 'email.bounced', created_at: createdAt,
      data: { email_id: syntheticEmailId, created_at: createdAt, from: 'The Squad QA <noreply@thesquad.pro>', to: [approvedRecipient], subject: runId },
    });
    const timestamp = new Date();
    const signature = new Webhook(resendWebhookSecret).sign(syntheticDeliveryId, timestamp, webhookBody);
    const webhookHeaders = {
      'content-type': 'application/json', 'svix-id': syntheticDeliveryId,
      'svix-timestamp': String(Math.floor(timestamp.getTime() / 1000)), 'svix-signature': signature,
    };
    const firstWebhook = await fetch(`${STAGING_ORIGIN}/api/webhooks/resend`, { method: 'POST', headers: webhookHeaders, body: webhookBody });
    const replayWebhook = await fetch(`${STAGING_ORIGIN}/api/webhooks/resend`, { method: 'POST', headers: webhookHeaders, body: webhookBody });
    const replayPayload = await replayWebhook.json();
    if (firstWebhook.status !== 200 || replayWebhook.status !== 200 || replayPayload.duplicate !== true) throw new Error('Resend unknown-message replay was not idempotent');
    const [targetSubscriber, unrelatedSubscriber] = await Promise.all([db.doc(targetSubscriberPath).get(), db.doc(unrelatedSubscriberPath).get()]);
    if (targetSubscriber.data()?.isActive !== false || unrelatedSubscriber.data()?.isActive !== true) throw new Error('Resend unknown-message isolation failed');
    observations.push('resend-unknown-message-isolated-and-replay-safe');

    if (!requiredEmailIdentityObservations().every(item => observations.includes(item))) throw new Error('Email identity evidence is incomplete');
    evidence = { runId, projectId, origin, providerMode: 'test', roleCount: roles.length, deliveryStates, observations };
  } finally {
    const cleanupPaths = [...new Set([...graph.firestorePaths, ...dynamicPaths, ...syntheticPaths, ...publicRatePaths, ...userRatePaths])];
    await Promise.all(cleanupPaths.map(path => db.recursiveDelete(db.doc(path)).catch(() => {})));
    await Promise.all([...new Set(graph.userIds)].map(async uid => {
      try { await auth.deleteUser(uid); } catch (error) { if (error?.code !== 'auth/user-not-found') throw error; }
    }));
    const firestoreResiduals = (await Promise.all(cleanupPaths.map(path => db.doc(path).get()))).filter(snapshot => snapshot.exists).length;
    const authResiduals = (await Promise.all([...new Set(graph.userIds)].map(async uid => {
      try { await auth.getUser(uid); return true; } catch (error) { if (error?.code === 'auth/user-not-found') return false; throw error; }
    }))).filter(Boolean).length;
    const syntheticLedgerResiduals = (await Promise.all(syntheticPaths.slice(0, 2).map(path => db.doc(path).get()))).filter(snapshot => snapshot.exists).length;
    const cleanup = assertEmailIdentityCleanup({ firestore: firestoreResiduals, auth: authResiduals, syntheticLedgers: syntheticLedgerResiduals });
    if (evidence) evidence.cleanup = { ...cleanup, checkedFirestorePaths: cleanupPaths.length };
  }
  return evidence;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(result => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)).catch(error => {
    process.stderr.write(`Email identity certification failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
