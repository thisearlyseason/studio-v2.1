import { randomBytes } from 'node:crypto';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const EXACT_PROJECT_ID = 'the-squad-v2-staging';
const RUN_ID_PATTERN = /^bg-cert-[a-z0-9-]{3,64}$/;

function refuse(reason) {
  throw new Error(`Refusing background certification: ${reason}`);
}

export function buildProjectionProbeGraph(runId) {
  if (!RUN_ID_PATTERN.test(String(runId))) refuse('run identifier is not staging-owned');
  const ownerId = `${runId}-owner`;
  const teamId = `${runId}-team`;
  const leagueId = `${runId}-league`;
  const marker = `Background certification ${runId}`;
  return {
    ownerId,
    teamId,
    leagueId,
    marker,
    paths: [
      `users/${ownerId}`,
      `teams/${teamId}`,
      `leagues/${leagueId}`,
      `publicLeagueViews/${leagueId}`,
      `leaguePublicProjectionState/${leagueId}`,
    ],
    owner: {
      role: 'league_creator',
      plan_type: 'league',
      subscription_status: 'active',
      status: 'active',
      isDeleted: false,
    },
    team: {
      ownerUserId: ownerId,
      planId: 'league',
      plan_type: 'league',
      status: 'active',
      isDeleted: false,
    },
    league: {
      name: marker,
      sport: 'Basketball',
      creatorId: ownerId,
      billingOwnerUserId: ownerId,
      tenantId: teamId,
      memberTeamIds: [teamId],
      divisions: ['Open'],
      teams: {
        [teamId]: { teamName: `${marker} Team`, status: 'accepted', division: 'Open' },
      },
      schedule: [],
      status: 'active',
      isActive: true,
      isArchived: false,
    },
  };
}

async function waitFor(description, check, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      if (await check()) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 2_000));
  }
  throw new Error(`${description} did not converge${lastError ? `: ${lastError.message}` : ''}`);
}

function stagingDb(projectId) {
  if (projectId !== EXACT_PROJECT_ID) refuse('project is not the isolated staging project');
  if (process.env.FIRESTORE_EMULATOR_HOST) refuse('emulator environment cannot prove deployed triggers');
  if (getApps().length === 0) initializeApp({ projectId, credential: applicationDefault() });
  return getFirestore();
}

export async function main({ projectId = process.env.CERTIFICATION_PROJECT_ID || EXACT_PROJECT_ID } = {}) {
  const runId = `bg-cert-${Date.now()}-${randomBytes(3).toString('hex')}`;
  const graph = buildProjectionProbeGraph(runId);
  const db = stagingDb(projectId);
  const ownerRef = db.doc(`users/${graph.ownerId}`);
  const teamRef = db.doc(`teams/${graph.teamId}`);
  const leagueRef = db.doc(`leagues/${graph.leagueId}`);
  const projectionRef = db.doc(`publicLeagueViews/${graph.leagueId}`);
  const stateRef = db.doc(`leaguePublicProjectionState/${graph.leagueId}`);
  const observations = [];

  try {
    await ownerRef.set(graph.owner);
    await teamRef.set(graph.team);
    await leagueRef.set(graph.league);
    await waitFor('League create projection', async () => {
      const snapshot = await projectionRef.get();
      return snapshot.exists && snapshot.data()?.name === graph.marker;
    });
    observations.push('create-converged');

    const updatedName = `${graph.marker} Updated`;
    await leagueRef.update({ name: updatedName });
    await waitFor('League update projection', async () => {
      const snapshot = await projectionRef.get();
      return snapshot.exists && snapshot.data()?.name === updatedName;
    });
    observations.push('update-converged');

    await ownerRef.update({ subscription_status: 'past_due' });
    await waitFor('League entitlement revocation', async () => {
      const [projection, state] = await Promise.all([projectionRef.get(), stateRef.get()]);
      return !projection.exists && !state.exists;
    });
    observations.push('entitlement-revoked');

    await ownerRef.update({ subscription_status: 'active' });
    await waitFor('League entitlement restoration', async () => {
      const snapshot = await projectionRef.get();
      return snapshot.exists && snapshot.data()?.name === updatedName;
    });
    observations.push('entitlement-restored');

    await leagueRef.delete();
    await waitFor('League delete projection revocation', async () => {
      const [projection, state] = await Promise.all([projectionRef.get(), stateRef.get()]);
      return !projection.exists && !state.exists;
    });
    observations.push('delete-revoked');
  } finally {
    await Promise.all([
      leagueRef.delete(), projectionRef.delete(), stateRef.delete(), teamRef.delete(), ownerRef.delete(),
    ]);
  }

  const residuals = (await Promise.all(graph.paths.map(documentPath => db.doc(documentPath).get())))
    .filter(snapshot => snapshot.exists).length;
  if (residuals !== 0) throw new Error(`Background certification left ${residuals} residual document(s)`);
  const evidence = { runId, projectId, observations, cleanupDeleted: graph.paths.length, residuals };
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
  return evidence;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    process.stderr.write(`Background certification failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
