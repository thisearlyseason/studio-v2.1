function diagnosticFor(id, attempt, error) {
  const message = error instanceof Error ? error.message : String(error);
  return { id, attempt, diagnostic: message.replace(/[^\x20-\x7e]/g, '').slice(0, 240) };
}

export function mergeResourceCleanupResults(results) {
  const counts = { deleted: 0, restored: 0, retainedAuditRecords: 0 };
  const reconciled = { deleted: 0, restored: 0, retainedAuditRecords: 0 };
  const selectors = [];
  const selectorSet = new Set();
  const residuals = [];
  const diagnostics = [];
  let state = 'OBSERVED';
  for (const result of results) {
    if (!result) continue;
    if (result.state !== 'OBSERVED') state = 'FAIL';
    for (const key of Object.keys(counts)) {
      counts[key] += result.counts?.[key] || 0;
      reconciled[key] += result.reconciled?.[key] || 0;
    }
    for (const selector of result.selectors || []) {
      if (!selectorSet.has(selector)) {
        selectorSet.add(selector);
        selectors.push(selector);
      }
    }
    residuals.push(...(result.residuals || []));
    diagnostics.push(...(result.diagnostics || []));
  }
  return Object.freeze({
    state,
    counts: Object.freeze(counts),
    reconciled: Object.freeze(reconciled),
    selectors: Object.freeze(selectors),
    residuals: Object.freeze(residuals),
    diagnostics: Object.freeze(diagnostics),
  });
}

export function createResourceRegistry({ maxAttempts = 2 } = {}) {
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 5) {
    throw new Error('Resource cleanup maxAttempts must be between 1 and 5.');
  }
  const resources = new Map();
  let completed = null;

  return Object.freeze({
    register(resource) {
      if (completed) throw new Error('Cannot register a resource after cleanup.');
      if (!resource || typeof resource.id !== 'string' || !resource.id || resources.has(resource.id)) {
        throw new Error('Dynamic cleanup resources require a unique ID.');
      }
      if (!['deleted', 'restored', 'retainedAuditRecord', 'obligation'].includes(resource.kind)) {
        throw new Error(`Unsupported cleanup resource kind ${resource.kind}.`);
      }
      if (typeof resource.cleanup !== 'function' || typeof resource.verify !== 'function') {
        throw new Error(`${resource.id} requires cleanup and verify functions.`);
      }
      resources.set(resource.id, Object.freeze({ ...resource }));
    },

    async cleanup() {
      if (completed) return completed;
      const pending = [...resources.values()].reverse();
      const scheduled = new Set(pending.map(resource => resource.id));
      const attempts = new Map();
      const exhausted = [];
      const succeeded = new Map();
      const mutated = new Map();
      const diagnostics = [];
      while (pending.length > 0) {
        const resource = pending.shift();
        const attempt = (attempts.get(resource.id) || 0) + 1;
        attempts.set(resource.id, attempt);
        try {
          const didMutate = await resource.cleanup();
          // Cleanup may have committed even when the following verification read
          // fails transiently. Preserve the measured mutation across retries so an
          // idempotent second cleanup cannot erase what the first attempt changed.
          mutated.set(resource.id, mutated.get(resource.id) === true || didMutate === true);
          const verified = await resource.verify();
          if (verified !== true) throw new Error('cleanup postcondition was not satisfied');
          succeeded.set(resource.id, resource);
        } catch (error) {
          diagnostics.push(diagnosticFor(resource.id, attempt, error));
          if (attempt < maxAttempts) pending.push(resource);
          else exhausted.push(resource);
        }

        // A registered discovery obligation can reveal exact owned roots while
        // cleanup is active. Process those roots before older parent/Auth entries,
        // while giving each newly discovered root its own bounded retry budget.
        const discovered = [...resources.values()].filter(item => !scheduled.has(item.id));
        for (const item of discovered) scheduled.add(item.id);
        pending.unshift(...discovered.reverse());
      }
      const counts = { deleted: 0, restored: 0, retainedAuditRecords: 0 };
      const reconciled = { deleted: 0, restored: 0, retainedAuditRecords: 0 };
      for (const resource of succeeded.values()) {
        if (resource.kind === 'obligation') continue;
        const key = resource.kind === 'retainedAuditRecord' ? 'retainedAuditRecords' : resource.kind;
        reconciled[key] += 1;
        if (resource.kind === 'retainedAuditRecord' || mutated.get(resource.id)) counts[key] += 1;
      }
      completed = Object.freeze({
        state: exhausted.length === 0 ? 'OBSERVED' : 'FAIL',
        counts: Object.freeze(counts),
        reconciled: Object.freeze(reconciled),
        selectors: Object.freeze([...resources.keys()]),
        residuals: Object.freeze(exhausted.map(resource => Object.freeze({ id: resource.id, kind: resource.kind }))),
        diagnostics: Object.freeze(diagnostics.map(item => Object.freeze(item))),
      });
      return completed;
    },
  });
}
