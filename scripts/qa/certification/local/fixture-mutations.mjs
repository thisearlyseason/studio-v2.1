import { createResourceRegistry } from './resource-registry.mjs';

function assertSafeBoundary(projectId, runId) {
  if (!String(projectId).startsWith('demo-')) throw new Error('Fixture mutation registry requires a demo-* project.');
  if (!/^final-cert-[a-z0-9-]+$/.test(String(runId))) throw new Error('Fixture mutation registry requires a run-owned certification ID.');
}

function canonicalValue(value) {
  if (value === null || typeof value !== 'object') return value;
  if (typeof value.toMillis === 'function') return { __timestampMillis: value.toMillis() };
  if (value instanceof Date) return { __dateMillis: value.getTime() };
  if (Array.isArray(value)) return value.map(canonicalValue);
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalValue(value[key])]));
}

export function createFixtureMutations({
  projectId,
  runId,
  firestore,
  auth,
  storage,
  baselineRoots = [],
  maxAttempts = 2,
}) {
  assertSafeBoundary(projectId, runId);
  if (!firestore || typeof firestore.read !== 'function' || typeof firestore.remove !== 'function' || typeof firestore.write !== 'function') {
    throw new Error('Fixture mutation registry requires a Firestore adapter.');
  }
  if (typeof firestore.hasDescendants !== 'function') {
    throw new Error('Fixture mutation registry requires recursive descendant proof.');
  }
  const registry = createResourceRegistry({ maxAttempts });
  const registeredDocuments = new Set();
  let overlayCounter = 0;
  const restoredOverlays = new Set();
  const isBaseline = path => baselineRoots.some(root => path === root || path.startsWith(`${root}/`));

  function registerDynamicDocument(alias, path) {
    if (!alias || !path) throw new Error('Dynamic Firestore registration requires alias and path.');
    if (isBaseline(path)) throw new Error('Dynamic destructive registration cannot target a baseline root.');
    registeredDocuments.add(path);
    registry.register({
      id: `firestore:${alias}`,
      kind: 'deleted',
      async cleanup() {
        const rootExists = await firestore.read(path) !== null;
        const descendantsExist = await firestore.hasDescendants(path);
        if (!rootExists && !descendantsExist) return false;
        await firestore.remove(path);
        return true;
      },
      async verify() {
        return await firestore.read(path) === null && !await firestore.hasDescendants(path);
      },
    });
  }

  async function writeDynamicDocument(path, value) {
    if (!registeredDocuments.has(path)) throw new Error('Dynamic Firestore resource must be registered before write.');
    await firestore.write(path, value);
  }

  async function withFirestoreOverlay(paths, callback) {
    const snapshots = [];
    for (const path of paths) {
      const before = await firestore.read(path);
      const overlayId = `overlay:${++overlayCounter}`;
      const expected = JSON.stringify(canonicalValue(before));
      const same = value => JSON.stringify(canonicalValue(value)) === expected;
      const restore = async () => {
        const current = await firestore.read(path);
        if (same(current)) return false;
        if (before === null) await firestore.remove(path);
        else await firestore.write(path, before);
        restoredOverlays.add(overlayId);
        return true;
      };
      registry.register({
        id: overlayId,
        kind: 'obligation',
        cleanup: restore,
        async verify() { return same(await firestore.read(path)); },
      });
      snapshots.push({ path, before, restore });
    }
    let value;
    let operationError;
    try {
      value = await callback();
    } catch (error) {
      operationError = error;
    } finally {
      const restorationErrors = [];
      for (const snapshot of snapshots.reverse()) {
        try {
          await snapshot.restore();
        } catch (error) {
          restorationErrors.push(error);
        }
      }
      if (restorationErrors.length > 0) {
        const errors = operationError ? [operationError, ...restorationErrors] : restorationErrors;
        const detail = restorationErrors.map(error => error instanceof Error ? error.message : String(error)).join(' | ');
        throw new AggregateError(errors, `Overlay restoration failed${operationError ? ' after operation failure' : ''}: ${detail}`, { cause: operationError });
      }
    }
    if (operationError) throw operationError;
    return value;
  }

  function registerDynamicAuthUid(alias, uid) {
    if (!auth?.remove || !auth?.exists) throw new Error('Dynamic Auth registration requires an Auth adapter.');
    registry.register({ id: `auth:${alias}`, kind: 'deleted', async cleanup() { if (!await auth.exists(uid)) return false; await auth.remove(uid); return true; }, async verify() { return !await auth.exists(uid); } });
  }

  function registerDynamicStoragePath(alias, objectPath) {
    if (!storage?.remove || !storage?.exists) throw new Error('Dynamic Storage registration requires a Storage adapter.');
    registry.register({ id: `storage:${alias}`, kind: 'deleted', async cleanup() { if (!await storage.exists(objectPath)) return false; await storage.remove(objectPath); return true; }, async verify() { return !await storage.exists(objectPath); } });
  }

  return Object.freeze({
    registerDynamicDocument,
    registerDynamicAuthUid,
    registerDynamicStoragePath,
    writeDynamicDocument,
    withFirestoreOverlay,
    async cleanup() {
      const result = await registry.cleanup();
      const counts = { ...result.counts, restored: result.counts.restored + restoredOverlays.size };
      const reconciled = { ...result.reconciled, restored: result.reconciled.restored + overlayCounter };
      return Object.freeze({
        ...result,
        counts: Object.freeze(counts),
        reconciled: Object.freeze(reconciled),
        overlaysRestored: restoredOverlays.size,
      });
    },
  });
}
