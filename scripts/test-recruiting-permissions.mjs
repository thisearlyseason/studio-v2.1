/**
 * test-recruiting-permissions.mjs
 *
 * Tests every Firestore write path that handleUpdateProfile in coaches-corner
 * uses. Run against the Firebase emulator:
 *
 *   # Terminal 1 — start emulators
 *   npx firebase emulators:start --only firestore,auth
 *
 *   # Terminal 2 — run the test
 *   USE_EMULATOR=true node scripts/test-recruiting-permissions.mjs
 */

import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  connectFirestoreEmulator,
  doc,
  setDoc,
  addDoc,
  deleteDoc,
  collection,
} from 'firebase/firestore';
import {
  getAuth,
  connectAuthEmulator,
  signInAnonymously,
} from 'firebase/auth';

// ── Config ───────────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'demo-api-key',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'demo-project.firebaseapp.com',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'demo-project',
};
const USE_EMULATOR = process.env.USE_EMULATOR !== 'false';

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

if (USE_EMULATOR) {
  connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, 'localhost', 8080);
  console.log('🔌  Connected to local emulators');
}

// ── Harness ──────────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
const failures = [];

async function test(label, fn) {
  try {
    await fn();
    console.log(`  ✅  PASS  ${label}`);
    passed++;
  } catch (e) {
    const msg = e.code || e.message;
    console.error(`  ❌  FAIL  ${label}`);
    console.error(`           → ${msg}`);
    failures.push({ label, msg });
    failed++;
  }
}

async function testDenied(label, fn) {
  try {
    await fn();
    console.warn(`  ⚠️   UNEXPECTED PASS (should be denied): ${label}`);
    failures.push({ label, msg: 'expected permission-denied but write succeeded' });
    failed++;
  } catch (e) {
    if (e.code === 'permission-denied') {
      console.log(`  ✅  CORRECTLY DENIED  ${label}`);
      passed++;
    } else {
      console.error(`  ❌  WRONG ERROR (expected permission-denied): ${label}`);
      console.error(`           → ${e.code || e.message}`);
      failures.push({ label, msg: e.code || e.message });
      failed++;
    }
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🧪  Recruiting Profile Permissions — Full Write-Path Test\n');
  console.log('═'.repeat(65));

  // ── 1. Sign in as coach ───────────────────────────────────────────────────
  console.log('\n▶  Auth: sign in as coach');
  const { user: coach } = await signInAnonymously(auth);
  const coachUid = coach.uid;
  console.log(`   coachUid = ${coachUid}`);

  const teamId   = `test_team_${Date.now()}`;
  const playerId = `test_player_${Date.now()}`;
  const statId   = `test_stat_${Date.now()}`;

  // ── 2. Seed prerequisite documents ───────────────────────────────────────
  console.log('\n▶  Seeding: create team + player docs');

  await test('Seed — coach creates team', () =>
    setDoc(doc(db, 'teams', teamId), {
      id: teamId,
      name: 'Test FC',
      ownerUserId: coachUid,
    })
  );

  // Player has a DIFFERENT userId (not the coach). This is the real-world case.
  const playerUserId = `player_user_other`;
  await test('Seed — coach creates player (isDemo:true for seeder rule)', () =>
    setDoc(doc(db, 'players', playerId), {
      id: playerId,
      name: 'Test Player',
      userId: playerUserId,
      isDemo: true,
      primaryTeamId: teamId,
    })
  );

  // ── 3. handleUpdateProfile writes ─────────────────────────────────────────
  console.log('\n▶  Testing all 7 handleUpdateProfile write paths');
  const tp = { updatedByTeamId: teamId }; // every write includes this

  await test('Write 1 — recruitingProfile/profile (setDoc merge)', () =>
    setDoc(
      doc(db, 'players', playerId, 'recruitingProfile', 'profile'),
      { fullName: 'Test Player', bio: 'Test', ...tp },
      { merge: true }
    )
  );

  await test('Write 2 — recruitingProfile/metrics (setDoc merge)', () =>
    setDoc(
      doc(db, 'players', playerId, 'recruitingProfile', 'metrics'),
      { height: "5'10\"", weight: '165lbs', ...tp },
      { merge: true }
    )
  );

  await test('Write 3 — recruitingContact/contact (setDoc merge)', () =>
    setDoc(
      doc(db, 'players', playerId, 'recruitingContact', 'contact'),
      { email: 'test@example.com', ...tp },
      { merge: true }
    )
  );

  await test('Write 4 — TOP-LEVEL players/{pid} update / toggleRecruitingProfile', () =>
    setDoc(
      doc(db, 'players', playerId),
      { recruitingProfileEnabled: true, ...tp },
      { merge: true }
    )
  );

  await test('Write 5 — stats addDoc (CREATE — request.resource.data is new doc)', () =>
    addDoc(collection(db, 'players', playerId, 'stats'), {
      season: '2024', gamesPlayed: 22, goals: 14, ...tp,
    })
  );

  await test('Write 6 — stats/{id} setDoc merge (UPDATE)', () =>
    setDoc(
      doc(db, 'players', playerId, 'stats', statId),
      { season: '2023', gamesPlayed: 18, ...tp },
      { merge: true }
    )
  );

  // Delete test — request.resource is NULL; rule uses resource.data.updatedByTeamId
  await test('Write 7 — stats/{id} deleteDoc (DELETE — resource.data.updatedByTeamId)', () =>
    deleteDoc(doc(db, 'players', playerId, 'stats', statId))
  );

  await test('Write 8 — videos addDoc (CREATE)', () =>
    addDoc(collection(db, 'players', playerId, 'videos'), {
      title: 'Highlight', url: 'https://example.com/v.mp4', ...tp,
    })
  );

  // ── 4. Security: unauthenticated denials ──────────────────────────────────
  console.log('\n▶  Security: unauthenticated writes (all should be DENIED)');
  await auth.signOut();

  await testDenied('Unauthed — recruitingProfile/profile write', () =>
    setDoc(
      doc(db, 'players', playerId, 'recruitingProfile', 'profile'),
      { bio: 'hacked' }, { merge: true }
    )
  );

  await testDenied('Unauthed — top-level player update', () =>
    setDoc(doc(db, 'players', playerId), { name: 'hacked' }, { merge: true })
  );

  // ── 5. Security: signed-in stranger without the team ─────────────────────
  console.log('\n▶  Security: stranger (signed in, no team ownership) — should be DENIED');
  await signInAnonymously(auth);

  await testDenied('Stranger — recruitingProfile write (no updatedByTeamId)', () =>
    setDoc(
      doc(db, 'players', playerId, 'recruitingProfile', 'profile'),
      { bio: 'hacked by stranger' },
      { merge: true }
    )
  );

  // ── Final report ──────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(65));
  console.log(`\n📊  ${passed} passed  /  ${failed} failed  /  ${passed + failed} total\n`);

  if (failures.length > 0) {
    console.log('❌  Failures:');
    failures.forEach(f => console.log(`   • ${f.label}\n     ${f.msg}`));
    console.log('');
    process.exit(1);
  } else {
    console.log('🎉  All recruiting permission tests passed!\n');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('\n💥  Fatal error:', err);
  process.exit(1);
});
