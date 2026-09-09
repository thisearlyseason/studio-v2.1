export async function withAttendanceMemberships(mutations, teamId, memberUids, callback) {
  // Both authorization and team discovery must return to their exact baseline.
  // The registry restores in finally, including partial setup/workflow failure.
  return mutations.withFirestoreOverlay(memberUids.flatMap(uid => [
    `teams/${teamId}/members/${uid}`,
    `users/${uid}/teamMemberships/${teamId}`,
  ]), callback);
}

export async function selectScheduleTeam(page, { teamId, url }) {
  await page.evaluate(team => localStorage.setItem('sf_session_team_id', team), teamId);
  await page.goto(url);
}

export function operationScenarioTimeoutMs(runBrowser, scenarioId) {
  if (!runBrowser) return 60_000;
  if (scenarioId === 'practice-film-upload-coach-marks-watch' ||
      scenarioId === 'files-library-crud-download' ||
      scenarioId === 'files-avatar-branding-player-media-paths') return 120_000;
  // Event combines owner/member CRUD, recurrence, and exact API cases. The
  // recorded successful work exceeded one minute before API reconciliation.
  if (scenarioId === 'chat-channel-message-unread' || scenarioId === 'events-event-crud-recurrence') return 90_000;
  return 60_000;
}

export async function runOperationStage(stage, { signal, checkDeadline = () => signal.throwIfAborted(), execute, onStage }) {
  checkDeadline();
  const startedAt = new Date().toISOString();
  const started = performance.now();
  onStage({ stage, state: 'started', startedAt });
  try {
    const result = await execute();
    checkDeadline();
    onStage({ stage, state: 'completed', startedAt, completedAt: new Date().toISOString(), elapsedMs: Math.round(performance.now() - started) });
    return result;
  } catch (error) {
    onStage({ stage, state: 'failed', startedAt, completedAt: new Date().toISOString(), elapsedMs: Math.round(performance.now() - started) });
    throw error;
  }
}

export async function runOperationScenarioSequence(ids, { execute, finalize, onError, failFast, timeoutMs = 60_000 }) {
  const failures = [];
  for (const id of ids) {
    const scenarioTimeoutMs = typeof timeoutMs === 'function' ? timeoutMs(id) : timeoutMs;
    let failure;
    let timeout;
    const controller = new AbortController();
    const deadlineAt = Date.now() + scenarioTimeoutMs;
    const timeoutError = () => new Error(`Operation scenario ${id} timed out after ${scenarioTimeoutMs}ms.`);
    // The browser CLI uses synchronous child commands. Check the actual clock
    // between commands even when the event loop has not dispatched its timer.
    const checkDeadline = () => {
      if (!controller.signal.aborted && Date.now() >= deadlineAt) controller.abort(timeoutError());
      controller.signal.throwIfAborted();
    };
    const execution = Promise.resolve().then(() => execute(id, { signal: controller.signal, checkDeadline }));
    try {
      await Promise.race([
        execution,
        new Promise((_, reject) => { timeout = setTimeout(() => {
          const error = timeoutError();
          reject(error);
          controller.abort(error);
        }, scenarioTimeoutMs); }),
      ]);
    } catch (error) {
      failure = error;
      if (controller.signal.aborted) {
        let abortTimeout;
        try {
          await Promise.race([
            execution,
            new Promise((_, reject) => { abortTimeout = setTimeout(() => reject(new Error(`Operation scenario ${id} did not terminate after abort.`)), Math.min(2_000, Math.max(100, scenarioTimeoutMs * 4))); }),
          ]);
        } catch (abortError) {
          if (!String(abortError?.message || '').includes('timed out')) failure = new AggregateError([failure, abortError], 'Operation timeout and abort termination failed.');
        } finally { clearTimeout(abortTimeout); }
      }
    }
    finally { clearTimeout(timeout); }
    try { await finalize(id); } catch (error) {
      failure = failure ? new AggregateError([failure, error], 'Operation and scenario cleanup failed.') : error;
    }
    if (failure) {
      onError(id, failure);
      failures.push(failure);
      if (failFast) break;
    }
  }
  if (failures.length) throw new AggregateError(failures, `${failures.length} selected operation scenario(s) failed.`);
}

export function operationSessionName(prefix, scenarioId, label) {
  const exact = `${prefix}-${scenarioId}-${label}`.replace(/[^a-zA-Z0-9_-]/g, '-');
  if (exact.length <= 64) return exact;
  const digest = createHash('sha256').update(exact).digest('hex').slice(0, 16);
  return `${String(prefix).slice(0, 20)}-${String(label).slice(0, 20)}-${digest}`.replace(/[^a-zA-Z0-9_-]/g, '-');
}

export async function registerScheduleDiscovery({ registry, scopeId, snapshot, registerRoot }) {
  const baseline = new Set(await snapshot());
  const discovered = new Set();
  registry.register({
    id: `schedule-discovery:${scopeId}`, kind: 'obligation',
    async cleanup() {
      for (const path of await snapshot()) {
        if (baseline.has(path) || discovered.has(path)) continue;
        registerRoot(path);
        discovered.add(path);
      }
      return false;
    },
    // Each discovered root has its own recursive removal and absence proof;
    // the registry processes those children before returning its final result.
    async verify() { return (await snapshot()).every(path => baseline.has(path) || discovered.has(path)); },
  });
}

export async function snapshotScheduleRoots(firestore, teamIds) {
  const paths = [];
  for (const teamId of new Set(teamIds)) {
    const [events, bookings] = await Promise.all([
      firestore.doc(`teams/${teamId}`).collection('events').listDocuments(),
      firestore.collection('scheduleBookings').where('hostTeamId', '==', teamId).get(),
    ]);
    paths.push(...events.map(ref => ref.path), ...bookings.docs.map(doc => doc.ref.path));
  }
  return paths;
}

const COMPETITION_AUXILIARY_COLLECTIONS = Object.freeze([
  'competitionOperations', 'competitionOperationOutbox', 'competitionOperationProgress',
  'publicLeagueViews', 'publicTournamentViews', 'scheduleBookings',
  'tournamentRefereeAssignments', 'tournamentReferees', 'tournamentRegistrationCodes',
  'tournamentLifecycleAudits',
]);

export async function snapshotCompetitionRoots(firestore, { leagueIds, teamIds }) {
  const paths = [];
  const addDocuments = documents => paths.push(...documents.map(document => document.ref?.path || document.path));
  for (const collectionName of COMPETITION_AUXILIARY_COLLECTIONS) addDocuments(await firestore.collection(collectionName).listDocuments());
  const profiles = await firestore.collection('users').listDocuments();
  addDocuments(profiles);
  for (const profile of profiles) {
    for (const collection of await firestore.doc(profile.path).listCollections()) addDocuments(await collection.listDocuments());
  }
  addDocuments(await firestore.collection('leagues').listDocuments());
  for (const leagueId of new Set(leagueIds)) {
    const root = firestore.doc(`leagues/${leagueId}`);
    for (const collection of await root.listCollections()) addDocuments(await collection.listDocuments());
  }
  addDocuments(await firestore.collection('teams').listDocuments());
  for (const teamId of new Set(teamIds)) {
    const team = firestore.doc(`teams/${teamId}`);
    for (const collection of await team.listCollections()) {
      const documents = await collection.listDocuments();
      addDocuments(documents);
      if (collection.id === 'events') {
        for (const event of documents) for (const nested of await event.listCollections()) addDocuments(await nested.listDocuments());
      }
    }
  }
  return [...new Set(paths)].sort();
}

function containsExactReference(value, references) {
  if (typeof value === 'string') return references.has(value);
  if (Array.isArray(value)) return value.some(item => containsExactReference(item, references));
  if (value && typeof value === 'object') return Object.values(value).some(item => containsExactReference(item, references));
  return false;
}

export async function registerCompetitionDiscovery({ registry, scopeId, runId, runOwnedReferences = [], snapshot, inspect, registerRoot }) {
  const baseline = new Set(await snapshot());
  const discovered = new Set();
  const exactRunOwnedReferences = new Set(runOwnedReferences.filter(value => typeof value === 'string' && value));
  registry.register({
    id: `competition-discovery:${scopeId}:${runId}`, kind: 'obligation',
    async cleanup() {
      for (const documentPath of await snapshot()) {
        if (baseline.has(documentPath) || discovered.has(documentPath)) continue;
        const value = await inspect(documentPath);
        let isRunOwned = JSON.stringify(value || {}).includes(runId) || containsExactReference(value, exactRunOwnedReferences);
        const pathOperationId = documentPath.split('/').at(-1);
        const operationId = typeof value?.operationId === 'string' ? value.operationId
          : /^competition_[A-Za-z0-9_-]+$/.test(pathOperationId || '') ? pathOperationId : '';
        if (!isRunOwned && operationId && /^[^/\s]+$/.test(operationId)) {
          const receipt = await inspect(`competitionOperations/${operationId}`);
          isRunOwned = JSON.stringify(receipt || {}).includes(runId);
        }
        if (!isRunOwned) {
          throw new Error(`Competition discovery refused non-run-owned residue ${documentPath}.`);
        }
        registerRoot(documentPath);
        discovered.add(documentPath);
      }
      return false;
    },
    async verify() {
      const remaining = await snapshot();
      return remaining.every(documentPath => baseline.has(documentPath) || discovered.has(documentPath));
    },
  });
}
import { createHash } from 'node:crypto';
