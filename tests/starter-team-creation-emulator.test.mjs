import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { NextRequest } from 'next/server.js';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const enabled = process.env.STARTER_TEAM_EMULATOR_TEST === '1';
const projectId = 'demo-native-billing-test';
let app, db, auth, routes, bundleDir;
before(async () => {
  if (!enabled) return;
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8289');
  assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9299');
  process.env.GCLOUD_PROJECT = projectId;
  app = initializeApp({ projectId }); db = getFirestore(app); auth = getAuth(app);
  await mkdir('scratch/starter-team-repair', { recursive: true });
  bundleDir = await mkdtemp(resolve('scratch/starter-team-repair/routes-'));
  await build({ entryPoints: { create: 'src/app/api/teams/create/route.ts', allocate: 'src/app/api/teams/allocate-pro/route.ts' }, bundle: true, platform: 'node', format: 'cjs', packages: 'external', outdir: bundleDir, outExtension: { '.js': '.cjs' }, logLevel: 'silent' });
  const require = createRequire(import.meta.url);
  routes = Object.fromEntries(['create', 'allocate'].map(name => [name, require(bundleDir + '/' + name + '.cjs').POST]));
});
after(async () => {
  if (!enabled) return;
  await deleteApp(app);
  await rm(bundleDir, { recursive: true, force: true });
  // emulators:exec discards this explicitly isolated demo project.
});
async function account(label, profile = {}) {
  const credentials = { email: label + '@starter-teams.test', password: 'Emulator-only!12345', returnSecureToken: true };
  const call = endpoint => fetch('http://127.0.0.1:9299/identitytoolkit.googleapis.com/v1/accounts:' + endpoint + '?key=emulator-key', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials) });
  const signup = await call('signUp'); assert.equal(signup.status, 200);
  const uid = (await signup.json()).localId;
  await auth.updateUser(uid, { emailVerified: true });
  await db.doc('users/' + uid).set({ role: 'coach', plan_type: 'free', team_limit: 0, subscription_status: 'inactive', ...profile });
  const login = await call('signInWithPassword'); assert.equal(login.status, 200);
  return { uid, token: (await login.json()).idToken };
}
function invoke(name, who, input = {}) {
  return routes[name](new NextRequest('https://starter-teams.example.test/api/teams/' + name, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(who ? { Authorization: 'Bearer ' + who.token } : {}) },
    body: JSON.stringify(name === 'create' ? { name: 'Starter test', type: 'adult', position: 'Coach', ...input } : input),
  }));
}
async function create(who) {
  const response = await invoke('create', who, { isPro: true, planId: 'league', team_limit: 1000 });
  assert.equal(response.status, 201, await response.clone().text());
  const { teamId } = await response.json();
  const team = (await db.doc('teams/' + teamId).get()).data();
  assert.equal(team.ownerUserId, who.uid); assert.equal(team.planId, 'free'); assert.equal(team.isPro, false);
  assert.equal((await db.doc(`users/${who.uid}/teamMemberships/${teamId}`).get()).data().isPro, false);
  return teamId;
}

test('real authenticated route creates multiple free teams beside a demo without paid access', { skip: !enabled }, async () => {
  const who = await account('multiple');
  await db.doc('teams/demo-' + who.uid).set({ ownerUserId: who.uid, isDemo: true, isPro: true, planId: 'squad_pro_demo' });
  const teams = [await create(who), await create(who), await create(who)];
  assert.equal((await db.collection('teams').where('ownerUserId', '==', who.uid).get()).size, 4);
  assert.equal((await invoke('allocate', who, { teamId: teams[0] })).status, 403);
  const profile = (await db.doc('users/' + who.uid).get()).data();
  assert.equal(profile.team_limit, 0); assert.equal(profile.plan_type, 'free'); assert.equal(profile.ownershipRevision, 3);
});
test('one paid seat still unlocks only one squad while Starter creation continues', { skip: !enabled }, async () => {
  const who = await account('paid', { plan_type: 'team', subscription_status: 'active', team_limit: 1 });
  const first = await create(who), second = await create(who);
  assert.equal((await invoke('allocate', who, { teamId: first })).status, 200);
  assert.equal((await invoke('allocate', who, { teamId: second })).status, 409);
  await create(who);
  assert.equal((await db.doc('teams/' + second).get()).data().isPro, false);
});
test('real concurrent creations preserve the 100-team resource ceiling atomically', { skip: !enabled }, async () => {
  const who = await account('ceiling');
  const batch = db.batch();
  for (let i = 0; i < 99; i++) batch.set(db.doc(`teams/${who.uid}-${i}`), { ownerUserId: who.uid, isPro: false, planId: 'free' });
  await batch.commit();
  const responses = await Promise.all([invoke('create', who), invoke('create', who)]);
  assert.deepEqual(responses.map(r => r.status).sort(), [201, 409]);
  assert.equal((await db.collection('teams').where('ownerUserId', '==', who.uid).get()).size, 100);
  assert.equal((await db.doc('users/' + who.uid).get()).data().ownershipRevision, 1);
});
test('real authentication and ownership guards still reject unauthorized creation', { skip: !enabled }, async () => {
  assert.equal((await invoke('create', null)).status, 401);
  const anonymous = await fetch('http://127.0.0.1:9299/identitytoolkit.googleapis.com/v1/accounts:signUp?key=emulator-key', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }) });
  assert.equal(anonymous.status, 200);
  assert.equal((await invoke('create', { token: (await anonymous.json()).idToken })).status, 403);
  const who = await account('boundaries');
  assert.equal((await invoke('create', who, { overrideOwnerId: 'foreign' })).status, 403);
  await db.doc('users/' + who.uid).update({ deletionStatus: 'pending' });
  assert.equal((await invoke('create', who)).status, 403);
  assert.equal((await db.collection('teams').where('ownerUserId', '==', who.uid).get()).size, 0);
});
