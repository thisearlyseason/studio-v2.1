import { after, before, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
const enabled = process.env.NATIVE_AUTH_EMULATOR_TEST === '1';
if (enabled && !/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) throw new Error('Requires isolated native-auth emulator');
let env;
before(async () => {
  if (!enabled) return;
  env = await initializeTestEnvironment({ projectId: 'demo-native-auth-test', firestore: { host: (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8187').split(':')[0], port: Number((process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8187').split(':')[1]), rules: readFileSync('firestore.rules', 'utf8') } });
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'nativeAuthAttempts/fixture'), { state: 'pending', uid: 'owner' });
    await setDoc(doc(db, 'nativeAuthAttempts/delete_fixture'), { purpose: 'apple-deletion', status: 'ready', uid: 'owner', appleSubject: 'owner-apple' });
    await setDoc(doc(db, 'users/owner'), { role: 'coach' });
  });
});
after(async () => { if (env) await env.cleanup(); });
for (const role of ['anonymous', 'owner', 'foreign', 'superadmin']) {
  test(`native auth attempts deny every direct operation to ${role}`, { skip: !enabled }, async () => {
    const db = role === 'anonymous' ? env.unauthenticatedContext().firestore() : env.authenticatedContext(role, { email_verified: true, ...(role === 'superadmin' ? { role: 'superadmin' } : {}) }).firestore();
    const ref = doc(db, 'nativeAuthAttempts/fixture');
    await assertFails(getDoc(ref));
    await assertFails(getDocs(collection(db, 'nativeAuthAttempts')));
    await assertFails(setDoc(doc(db, 'nativeAuthAttempts/forged'), { state: 'ready' }));
    await assertFails(updateDoc(ref, { state: 'ready' }));
    await assertFails(deleteDoc(ref));
    const deletion = doc(db, 'nativeAuthAttempts/delete_fixture');
    await assertFails(getDoc(deletion));
    await assertFails(updateDoc(deletion, { status: 'completed' }));
    await assertFails(deleteDoc(deletion));
  });
}
