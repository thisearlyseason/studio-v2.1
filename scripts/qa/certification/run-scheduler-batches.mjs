import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const STAGING_PROJECT_ID = 'the-squad-v2-staging';
const RUN_ID_PATTERN = /^sched-cert-[a-z0-9-]{3,64}$/;
const REGION = 'us-central1';

function refuse(reason) {
  throw new Error(`Refusing scheduler certification: ${reason}`);
}

export function assertSchedulerTargetSafety({ projectId, runId }) {
  if (projectId !== STAGING_PROJECT_ID) refuse('project is not the isolated staging project');
  if (!RUN_ID_PATTERN.test(String(runId))) refuse('run identifier is not a staging-owned run identifier');
  if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    refuse('emulator targets cannot prove deployed schedulers');
  }
}

function zonedDateAndMinutes(now, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const value = type => parts.find(part => part.type === type)?.value || '';
  const hour = Number(value('hour')) === 24 ? 0 : Number(value('hour'));
  return {
    date: `${value('year')}-${value('month')}-${value('day')}`,
    minutes: (hour * 60) + Number(value('minute')),
  };
}

export function buildSchedulerFixtureGraph({ runId, now = new Date() }) {
  assertSchedulerTargetSafety({ projectId: STAGING_PROJECT_ID, runId });
  const local = zonedDateAndMinutes(now, 'America/Edmonton');
  if (local.minutes >= (23 * 60) + 59) refuse('no future same-day reminder window remains');
  const purgeUid = `${runId}-purge`;
  const ownerUid = `${runId}-owner`;
  const anonymousUid = `${runId}-anonymous`;
  const liveUid = `${runId}-live`;
  const reminderUid = `${runId}-reminder`;
  const ownerTeamId = `${runId}-owner-team`;
  const anonymousTeamId = `${runId}-anonymous-team`;
  const liveTeamId = `${runId}-live-team`;
  const reminderTeamId = `${runId}-reminder-team`;
  const reminderEventId = `${runId}-event`;
  const reminderLedgerId = `${reminderTeamId}_${reminderEventId}_${reminderUid}`;
  return {
    runId,
    purgeUid,
    ownerUid,
    anonymousUid,
    liveUid,
    reminderUid,
    ownerTeamId,
    anonymousTeamId,
    liveTeamId,
    reminderTeamId,
    reminderEventId,
    reminderLedgerId,
    purgeOwnerRequestExpectedStatus: 'blocked',
    team: { timeZone: 'America/Edmonton' },
    event: {
      date: local.date,
      startTime: '23:59',
      eventType: 'game',
      title: `Scheduler certification ${runId}`,
      location: 'Staging QA',
      status: 'scheduled',
    },
    reminderUser: {
      role: 'adult_player',
      notificationsEnabled: true,
      upcomingEventNotificationsEnabled: true,
      fcmTokens: [`invalid-${runId}`],
    },
    anonymousUser: { isAnonymousFixture: true, isDemo: true },
    liveUser: { isAnonymousFixture: false, isDemo: false },
    schedulerJobs: [
      'firebase-schedule-purgeExpiredDeletionRequests-us-central1',
      'firebase-schedule-sendUpcomingEventReminders-us-central1',
      'firebase-schedule-cleanupAnonymousUsers-us-central1',
    ],
    cleanupPaths: [
      `certificationSchedulerRuns/${runId}`,
      `accountDeletionRequests/${purgeUid}`,
      `accountDeletionRequests/${ownerUid}`,
      `users/${purgeUid}`,
      `users/${ownerUid}`,
      `users/${anonymousUid}`,
      `users/${liveUid}`,
      `users/${reminderUid}`,
      `teams/${ownerTeamId}`,
      `teams/${anonymousTeamId}`,
      `teams/${liveTeamId}`,
      `teams/${reminderTeamId}`,
      `teams/${reminderTeamId}/events/${reminderEventId}`,
      `teams/${reminderTeamId}/members/${reminderUid}`,
      `eventReminderDeliveries/${reminderLedgerId}`,
    ],
  };
}

function services(projectId) {
  assertSchedulerTargetSafety({ projectId, runId: process.env.CERTIFICATION_RUN_ID || 'sched-cert-bootstrap' });
  if (getApps().length === 0) initializeApp({ projectId, credential: applicationDefault() });
  return { auth: getAuth(), db: getFirestore() };
}

async function ensureUser(auth, uid, registered) {
  try { await auth.getUser(uid); return; } catch (error) {
    if (error?.code !== 'auth/user-not-found') throw error;
  }
  await auth.createUser(registered
    ? { uid, email: `${uid}@example.invalid`, password: 'Staging-QA-Only!4096', emailVerified: true }
    : { uid });
}

function invokeJob(projectId, job) {
  execFileSync('gcloud', [
    'scheduler', 'jobs', 'run', job,
    `--project=${projectId}`,
    `--location=${REGION}`,
  ], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000 });
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

async function userExists(auth, uid) {
  try { await auth.getUser(uid); return true; } catch (error) {
    if (error?.code === 'auth/user-not-found') return false;
    throw error;
  }
}

export async function prepare({ projectId, runId }) {
  assertSchedulerTargetSafety({ projectId, runId });
  process.env.CERTIFICATION_RUN_ID = runId;
  const graph = buildSchedulerFixtureGraph({ runId });
  const { auth, db } = services(projectId);
  await Promise.all([
    ensureUser(auth, graph.purgeUid, true),
    ensureUser(auth, graph.ownerUid, true),
    ensureUser(auth, graph.anonymousUid, false),
    ensureUser(auth, graph.liveUid, true),
    ensureUser(auth, graph.reminderUid, true),
  ]);
  const preparedAt = Timestamp.now();
  const expired = Timestamp.fromMillis(Date.now() - 60_000);
  await Promise.all([
    db.doc(`certificationSchedulerRuns/${runId}`).set({ runId, preparedAt, projectId }),
    db.doc(`users/${graph.purgeUid}`).set({ role: 'adult_player', status: 'active', fixtureRunId: runId }),
    db.doc(`users/${graph.ownerUid}`).set({ role: 'coach', status: 'active', fixtureRunId: runId }),
    db.doc(`users/${graph.anonymousUid}`).set({ ...graph.anonymousUser, fixtureRunId: runId }),
    db.doc(`users/${graph.liveUid}`).set({ ...graph.liveUser, role: 'adult_player', fixtureRunId: runId }),
    db.doc(`users/${graph.reminderUid}`).set({ ...graph.reminderUser, fixtureRunId: runId }),
    db.doc(`accountDeletionRequests/${graph.purgeUid}`).set({ userId: graph.purgeUid, purgeAt: expired, status: 'pending', fixtureRunId: runId }),
    db.doc(`accountDeletionRequests/${graph.ownerUid}`).set({ userId: graph.ownerUid, purgeAt: expired, status: 'pending', fixtureRunId: runId }),
    db.doc(`teams/${graph.ownerTeamId}`).set({ ownerUserId: graph.ownerUid, name: runId, fixtureRunId: runId }),
    db.doc(`teams/${graph.anonymousTeamId}`).set({ ownerUserId: graph.anonymousUid, demoSessionOwnerId: graph.anonymousUid, isDemo: true, fixtureRunId: runId }),
    db.doc(`teams/${graph.anonymousTeamId}/events/demo`).set({ title: runId, fixtureRunId: runId }),
    db.doc(`teams/${graph.liveTeamId}`).set({ ownerUserId: graph.liveUid, isDemo: false, fixtureRunId: runId }),
    db.doc(`teams/${graph.reminderTeamId}`).set({ ...graph.team, ownerUserId: graph.reminderUid, fixtureRunId: runId }),
    db.doc(`teams/${graph.reminderTeamId}/events/${graph.reminderEventId}`).set({ ...graph.event, fixtureRunId: runId }),
    db.doc(`teams/${graph.reminderTeamId}/members/${graph.reminderUid}`).set({ userId: graph.reminderUid, status: 'active', fixtureRunId: runId }),
  ]);
  return { runId, projectId, preparedAt: preparedAt.toDate().toISOString(), anonymousEligibleAt: new Date(preparedAt.toMillis() + (15 * 60 * 1000) + 1_000).toISOString() };
}

export async function runCore({ projectId, runId }) {
  assertSchedulerTargetSafety({ projectId, runId });
  process.env.CERTIFICATION_RUN_ID = runId;
  const graph = buildSchedulerFixtureGraph({ runId });
  const { auth, db } = services(projectId);
  invokeJob(projectId, graph.schedulerJobs[0]);
  await waitFor('account purge and owner block', async () => {
    const [purgeRequest, purgeUser, ownerRequest, ownerUser, ownerTeam] = await Promise.all([
      db.doc(`accountDeletionRequests/${graph.purgeUid}`).get(),
      db.doc(`users/${graph.purgeUid}`).get(),
      db.doc(`accountDeletionRequests/${graph.ownerUid}`).get(),
      db.doc(`users/${graph.ownerUid}`).get(),
      db.doc(`teams/${graph.ownerTeamId}`).get(),
    ]);
    return !purgeRequest.exists && !purgeUser.exists && !(await userExists(auth, graph.purgeUid)) &&
      ownerRequest.data()?.status === 'blocked' && ownerUser.data()?.deletionStatus === 'blocked' && ownerTeam.exists;
  });

  invokeJob(projectId, graph.schedulerJobs[1]);
  await waitFor('first reminder failure', async () => {
    const snapshot = await db.doc(`eventReminderDeliveries/${graph.reminderLedgerId}`).get();
    return snapshot.data()?.status === 'failed' && Number(snapshot.data()?.attempts) >= 1;
  });
  invokeJob(projectId, graph.schedulerJobs[1]);
  await waitFor('reminder retry', async () => {
    const snapshot = await db.doc(`eventReminderDeliveries/${graph.reminderLedgerId}`).get();
    return snapshot.data()?.status === 'failed' && Number(snapshot.data()?.attempts) >= 2;
  });
  const ledger = (await db.doc(`eventReminderDeliveries/${graph.reminderLedgerId}`).get()).data();
  return {
    runId,
    projectId,
    purgeDeleted: true,
    ownerBlocked: true,
    reminderStatus: ledger?.status,
    reminderAttempts: Number(ledger?.attempts || 0),
    reminderDiagnostic: typeof ledger?.error === 'string' ? ledger.error.slice(0, 120) : '',
  };
}

export async function runAnonymous({ projectId, runId }) {
  assertSchedulerTargetSafety({ projectId, runId });
  process.env.CERTIFICATION_RUN_ID = runId;
  const graph = buildSchedulerFixtureGraph({ runId });
  const { auth, db } = services(projectId);
  const run = await db.doc(`certificationSchedulerRuns/${runId}`).get();
  const preparedAt = run.data()?.preparedAt?.toMillis?.();
  if (!preparedAt || Date.now() - preparedAt <= 15 * 60 * 1000) refuse('anonymous fixture is not older than fifteen minutes');
  invokeJob(projectId, graph.schedulerJobs[2]);
  await waitFor('anonymous cleanup and live exclusion', async () => {
    const [anonymousUser, anonymousTeam, liveUser, liveTeam] = await Promise.all([
      db.doc(`users/${graph.anonymousUid}`).get(),
      db.doc(`teams/${graph.anonymousTeamId}`).get(),
      db.doc(`users/${graph.liveUid}`).get(),
      db.doc(`teams/${graph.liveTeamId}`).get(),
    ]);
    return !(await userExists(auth, graph.anonymousUid)) && !anonymousUser.exists && !anonymousTeam.exists &&
      (await userExists(auth, graph.liveUid)) && liveUser.exists && liveTeam.exists;
  });
  return { runId, projectId, anonymousDeleted: true, liveExcluded: true };
}

export async function cleanup({ projectId, runId }) {
  assertSchedulerTargetSafety({ projectId, runId });
  process.env.CERTIFICATION_RUN_ID = runId;
  const graph = buildSchedulerFixtureGraph({ runId });
  const { auth, db } = services(projectId);
  const topLevelPaths = graph.cleanupPaths.filter(path => path.split('/').length === 2);
  await Promise.all(topLevelPaths.map(path => db.recursiveDelete(db.doc(path))));
  await Promise.all([graph.purgeUid, graph.ownerUid, graph.anonymousUid, graph.liveUid, graph.reminderUid].map(async uid => {
    try { await auth.deleteUser(uid); } catch (error) { if (error?.code !== 'auth/user-not-found') throw error; }
  }));
  const residuals = (await Promise.all(graph.cleanupPaths.map(path => db.doc(path).get()))).filter(item => item.exists).length;
  const authResiduals = (await Promise.all([graph.purgeUid, graph.ownerUid, graph.anonymousUid, graph.liveUid, graph.reminderUid].map(uid => userExists(auth, uid)))).filter(Boolean).length;
  if (residuals || authResiduals) throw new Error(`Scheduler cleanup left ${residuals + authResiduals} residual resource(s)`);
  return { runId, projectId, cleanupPaths: graph.cleanupPaths.length, residuals: 0 };
}

export async function main(argv = process.argv.slice(2)) {
  const mode = argv[0];
  const runId = argv[1];
  const projectId = process.env.CERTIFICATION_PROJECT_ID || STAGING_PROJECT_ID;
  if (!['prepare', 'core', 'anonymous', 'cleanup'].includes(mode)) refuse('mode must be prepare, core, anonymous, or cleanup');
  const result = mode === 'prepare' ? await prepare({ projectId, runId })
    : mode === 'core' ? await runCore({ projectId, runId })
      : mode === 'anonymous' ? await runAnonymous({ projectId, runId })
        : await cleanup({ projectId, runId });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    process.stderr.write(`Scheduler certification failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
