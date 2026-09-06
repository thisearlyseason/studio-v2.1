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

export async function runOperationScenarioSequence(ids, { execute, finalize, onError, failFast }) {
  const failures = [];
  for (const id of ids) {
    let failure;
    try { await execute(id); } catch (error) { failure = error; }
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

export function operationSessionName(prefix, scenarioId, label) { return `${prefix}-${scenarioId}-${label}`; }

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
