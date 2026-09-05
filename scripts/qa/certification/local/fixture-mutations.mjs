import { createResourceRegistry } from './resource-registry.mjs';

function assertSafeBoundary(projectId, runId) {
  if (!String(projectId).startsWith('demo-')) throw new Error('Fixture mutation registry requires a demo-* project.');
  if (!/^final-cert-[a-z0-9-]+$/.test(String(runId))) throw new Error('Fixture mutation registry requires a run-owned certification ID.');
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
  const registry = createResourceRegistry({ maxAttempts });
  const registeredDocuments = new Set();
  let overlayCounter = 0;
  const isBaseline = path => baselineRoots.some(root => path === root || path.startsWith(`${root}/`));

  function registerDynamicDocument(alias, path) {
    if (!alias || !path) throw new Error('Dynamic Firestore registration requires alias and path.');
    if (isBaseline(path)) throw new Error('Dynamic destructive registration cannot target a baseline root.');
    registeredDocuments.add(path);
    registry.register({
      id: `firestore:${alias}`,
      kind: 'deleted',
      async cleanup() { const existing = await firestore.read(path); if (existing === null) return false; await firestore.remove(path); return true; },
      async verify() { return await firestore.read(path) === null; },
    });
  }

  async function writeDynamicDocument(path, value) {
    if (!registeredDocuments.has(path)) throw new Error('Dynamic Firestore resource must be registered before write.');
    await firestore.write(path, value);
  }

  async function withFirestoreOverlay(paths, callback) {
    const snapshots = [];
    for (const path of paths) snapshots.push([path, await firestore.read(path)]);
    try {
      return await callback();
    } finally {
      for (const [path, before] of snapshots.reverse()) {
        if (before === null) await firestore.remove(path);
        else await firestore.write(path, before);
      }
      overlayCounter += snapshots.length;
    }
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
      return Object.freeze({ ...result, overlaysRestored: overlayCounter });
    },
  });
}
