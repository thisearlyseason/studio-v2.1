const PHASES = new Set(['before-transition', 'after-transition']);

export const phase9SessionName = value => `p9-${value}`
  .replace(/[^A-Za-z0-9_-]/g, '-')
  .slice(0, 64);

export const phase9FreshSessionName = value => `${phase9SessionName(value).slice(0, 58)}-fresh`;

export const phase9RowSession = row => row?.scenario === 'stale-session'
  ? phase9SessionName(`pending-deletion-active-baseline-${row.viewportName}`)
  : phase9SessionName(row?.contextId);

export function phase9BrowserSessionsForRow(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)
    || typeof row.contextId !== 'string' || row.contextId.length === 0) {
    throw new Error('phase9-session-lifecycle-invalid');
  }
  const primary = phase9RowSession(row);
  return Object.freeze((row.group === 'logout'
    ? [primary, phase9FreshSessionName(row.contextId)]
    : [primary]).sort());
}

export const phase9RetainsRowAcrossTransition = (phase, row) => (
  phase === 'before-transition'
  && row?.group === 'pending-deletion'
  && row?.scenario === 'active-baseline'
);

export function buildPhase9ProductionSessionLifecyclePlan(rows, phase) {
  if (!PHASES.has(phase) || !Array.isArray(rows)) {
    throw new Error('phase9-session-lifecycle-invalid');
  }
  const active = new Set();
  const released = new Set();
  const history = new Set();
  const normalizedRows = [];
  for (const row of rows) {
    const sessions = phase9BrowserSessionsForRow(row);
    for (const session of sessions) {
      if (history.has(session)) throw new Error('phase9-session-lifecycle-invalid');
      history.add(session);
      active.add(session);
    }
    const retained = phase9RetainsRowAcrossTransition(phase, row);
    if (!retained) for (const session of sessions) {
      active.delete(session);
      released.add(session);
    }
    normalizedRows.push(Object.freeze({
      contextId: row.contextId,
      sessions,
      retained,
    }));
  }
  return Object.freeze({
    rows: Object.freeze(normalizedRows),
    historySessions: Object.freeze([...history].sort()),
    releasedSessions: Object.freeze([...released].sort()),
    boundarySessions: Object.freeze([...active].sort()),
    maxBoundaryInventory: active.size,
  });
}
