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
