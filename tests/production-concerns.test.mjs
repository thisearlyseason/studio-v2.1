import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { hasUnresolvedSubscription } from '../src/lib/checkout-policy.ts';
import { getPlanTeamLimit, isStarterExperience } from '../src/lib/plan-catalog.ts';
import { isValidFirestoreDocumentId } from '../src/lib/firestore-document-id.ts';
import { calculateHouseholdPayments } from '../src/lib/household-payments.ts';
import { hasStaffRole } from '../src/lib/staff-position.ts';
import { sportForDemoVariant } from '../src/lib/demo-plan-config.ts';

const source = path => readFile(new URL(path, import.meta.url), 'utf8');

test('every unresolved Stripe lifecycle blocks account deletion', () => {
  for (const status of ['active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused']) {
    assert.equal(hasUnresolvedSubscription({ subscription_status: status }), true, status);
  }
  assert.equal(hasUnresolvedSubscription({ subscription_status: 'canceled', stripe_subscription_id: 'sub_old' }), false);
  assert.equal(hasUnresolvedSubscription({ stripe_subscription_id: 'sub_unknown' }), true);
});

test('canonical plans retain one capacity across every administrative surface', async () => {
  assert.deepEqual(['free', 'team', 'elite', 'league', 'school'].map(getPlanTeamLimit), [1, 1, 8, 18, 15]);
  const [endpoint, admin, provider, homepage] = await Promise.all([
    source('../src/app/api/admin/users/[uid]/entitlement/route.ts'),
    source('../src/app/admin/page.tsx'),
    source('../src/components/providers/team-provider.tsx'),
    source('../src/app/page.tsx'),
  ]);
  assert.match(endpoint, /getPlanTeamLimit\(planId\)/);
  assert.match(endpoint, /adminAuditLogs/);
  assert.match(admin, /provisionEntitlement/);
  assert.doesNotMatch(admin, /newPlan === 'elite' \? 5/);
  assert.match(provider, /\/entitlement/);
  assert.match(homepage, /18 Pro Teams/);
});

test('a paid league creator without an active team keeps league portal access', () => {
  assert.equal(isStarterExperience({
    isPro: false,
    activeTeamPlanId: null,
    accountPlanId: 'league',
    role: 'league_creator',
  }), false);
  assert.equal(isStarterExperience({
    isPro: false,
    activeTeamPlanId: null,
    accountPlanId: 'free',
    role: 'league_creator',
  }), true);
});

test('new identities require onboarding before dashboard access', async () => {
  const [login, serverAuth, onboarding] = await Promise.all([
    source('../src/app/login/page.tsx'),
    source('../src/lib/server-dashboard-auth.ts'),
    source('../src/app/onboarding/page.tsx'),
  ]);
  assert.match(login, /router\.push\('\/onboarding'\)/);
  assert.match(serverAuth, /if \(!profile\) redirect\('\/onboarding'\)/);
  assert.match(onboarding, /batch\.set\(doc\(db, 'users', user\.uid\)/);
  assert.match(onboarding, /role/);
});

test('demo staff channels stay member-filtered and exclude family personas', async () => {
  const [seeder, chats] = await Promise.all([
    source('../src/lib/db-seeder.ts'),
    source('../src/app/(dashboard)/chats/page.tsx'),
  ]);
  assert.match(seeder, /includeCurrentUserInStaffChat/);
  assert.match(seeder, /GET_DEMO_DATA\([^\n]+false\)/);
  assert.doesNotMatch(chats, /activeTeam\.id\.startsWith\('demo_'\)[\s\S]{0,180}orderBy\('createdAt'/);
  assert.match(chats, /where\('memberIds', 'array-contains', user\.id\)/);
});

test('shared normalization covers staff, payment, sport, and document IDs', () => {
  assert.equal(hasStaffRole({ position: 'Head Coach' }), true);
  assert.equal(hasStaffRole({ position: 'Director of Athletics' }), true);
  assert.equal(hasStaffRole({ position: 'Player' }), false);
  assert.deepEqual(calculateHouseholdPayments([
    { amount: 365, status: 'pending', dueDate: '2026-09-01' },
    { amount: 220, status: 'overdue' },
    { amount: 50, status: 'paid' },
  ]), { paid: 50, outstanding: 585, overdue: 220, nextDue: { amount: 365, status: 'pending', dueDate: '2026-09-01' } });
  assert.equal(sportForDemoVariant('Jr Soccer Club'), 'Soccer');
  assert.equal(sportForDemoVariant('Sr Volleyball Club'), 'Volleyball');
  assert.equal(sportForDemoVariant('Badminton Club'), 'Badminton');
  assert.equal(isValidFirestoreDocumentId('team_123'), true);
  assert.equal(isValidFirestoreDocumentId('__name__'), false);
  assert.equal(isValidFirestoreDocumentId('__reserved__'), false);
});

test('route-aware authorization, private recruiting, and alert dismissal fail closed', async () => {
  const [middleware, roster, alerts, recruitingLayout, spectatorLayout, registrationLayout] = await Promise.all([
    source('../src/middleware.ts'),
    source('../src/app/(dashboard)/roster/page.tsx'),
    source('../src/components/layout/AlertOverlay.tsx'),
    source('../src/app/recruit/player/[playerId]/layout.tsx'),
    source('../src/app/leagues/spectator/[leagueId]/layout.tsx'),
    source('../src/app/register/league/[leagueId]/layout.tsx'),
  ]);
  assert.match(middleware, /requestHeaders\.set\('x-squad-pathname', pathname\)/);
  assert.match(roster, /recruitingProfileEnabled === true/);
  assert.match(alerts, /if \(!open\) handleDismiss\(\)/);
  assert.doesNotMatch(alerts.match(/const handleDismiss[\s\S]*?\n  };/)?.[0] || '', /markAlertAsSeen/);
  assert.equal((recruitingLayout.match(/notFound\(\)/g) || []).length, 2);
  assert.match(middleware, /publicProjectionExists\(request\)/);
  assert.match(middleware, /NextResponse\.rewrite\(new URL\('\/__not-found'/);
  assert.match(middleware, /X-Robots-Tag', 'noindex, nofollow'/);
  assert.match(spectatorLayout, /readActiveScoringLeague\(transaction, snapshot.id\)/);
  assert.match(spectatorLayout, /collection\('leagues'\)/);
  assert.equal((spectatorLayout.match(/notFound\(\)/g) || []).length, 2);
  assert.match(registrationLayout, /collection\('leagues'\)/);
  assert.match(registrationLayout, /where\('slug', '==', identifier\)/);
  assert.equal((registrationLayout.match(/notFound\(\)/g) || []).length, 2);
});

test('production automation checks billing-backed invocation and deployed rules drift', async () => {
  const [health, deploy, recovery, orphanCleanup, backfill] = await Promise.all([
    source('../.github/workflows/production-health.yml'),
    source('../.github/workflows/deploy-production-infrastructure.yml'),
    source('../docs/PRODUCTION_FUNCTION_RECOVERY.md'),
    source('../scripts/cleanup-orphan-demo-data.mjs'),
    source('../scripts/backfill-league-member-users.mjs'),
  ]);
  assert.match(health, /Function invocation failed[\s\S]*Firebase billing/);
  assert.match(health, /response\.status !== 404/);
  assert.match(health, /body !== 'Calendar feed not found\.'/);
  assert.match(deploy, /check-firestore-rules-drift\.mjs/);
  assert.match(deploy, /response\.status !== 404/);
  assert.match(deploy, /body !== 'Calendar feed not found\.'/);
  assert.match(recovery, /audit-production-recovery\.mjs/);
  assert.match(recovery, /cleanup-orphan-demo-data\.mjs/);
  assert.match(recovery, /backfill-league-member-users\.mjs --verbose/);
  assert.match(orphanCleanup, /!authUserIds\.has\(ownerId\)/);
  assert.match(backfill, /!hasMembershipCache \|\|/);
});

test('anonymous cleanup retains retry evidence until every demo projection is removed', async () => {
  const functions = await source('../functions/src/index.ts');
  const cleanup = functions.match(/export const cleanupAnonymousUsers[\s\S]*?\/\*\*\n \* Sends one same-day reminder/)?.[0] || '';
  assert.match(cleanup, /timeoutSeconds: 540/);
  assert.match(cleanup, /for \(const uid of usersToDelete\)/);
  assert.match(cleanup, /collection\('leagues'\)\.where\('creatorId', '==', uid\)/);
  assert.match(cleanup, /collection\('players'\)\.where\('demoOwnerUserId', '==', uid\)/);
  assert.match(cleanup, /collection\('facilities'\)\.where\('clubId', '==', uid\)/);
  assert.match(cleanup, /collection\('publicLeagueViews'\)\.doc\(league\.id\)\.delete\(\)/);
  assert.ok(cleanup.indexOf("db.recursiveDelete(db.collection('users').doc(uid))") < cleanup.indexOf('auth.deleteUser(uid)'));
  assert.doesNotMatch(cleanup, /auth\.deleteUsers\(usersToDelete\)/);
});

test('anonymous demos survive reloads and clean up visible exits and abandoned sessions', async () => {
  const [layout, provider, shell, endpoint, cleanup, functions] = await Promise.all([
    source('../src/app/(dashboard)/layout.tsx'),
    source('../src/firebase/provider.tsx'),
    source('../src/components/layout/Shell.tsx'),
    source('../src/app/api/demo/exit/route.ts'),
    source('../src/lib/server-demo-cleanup.ts'),
    source('../functions/src/index.ts'),
  ]);

  assert.match(layout, /DEMO_TIMEOUT_MS = 15 \* 60 \* 1000/);
  assert.match(layout, /fetch\('\/api\/demo\/exit', \{ method: 'POST', keepalive: true \}\)/);
  assert.match(layout, /window\.addEventListener\('pagehide', handlePageHide\)/);
  assert.match(layout, /localStorage\.setItem\(DEMO_EXIT_PENDING_KEY, 'true'\)/);
  assert.doesNotMatch(layout, /navigator\.sendBeacon\('\/api\/demo\/exit'\)/);
  assert.match(layout, /isDemoInitializing \|\|\s+isSeedingDemo \|\|\s+!userProfile\?\.isDemo/);
  assert.match(layout, /user\?\.isAnonymous/);
  assert.match(endpoint, /isTrustedRequestOrigin/);
  assert.match(endpoint, /!isTrustedRequestOrigin\(request\)/);
  assert.doesNotMatch(endpoint, /origin !== request\.nextUrl\.origin/);
  assert.match(endpoint, /verifySessionCookie\(sessionCookie, true\)/);
  assert.match(endpoint, /sign_in_provider !== 'anonymous'/);
  assert.match(provider, /firebaseUser\?\.isAnonymous && localStorage\.getItem\(DEMO_EXIT_PENDING_KEY\) === 'true'/);
  assert.match(provider, /sessionStorage\.getItem\(DEMO_START_KEY\)/);
  assert.match(provider, /fetch\('\/api\/demo\/exit', \{ method: 'POST', keepalive: true \}\)/);
  assert.match(provider, /await signOut\(auth\)/);
  assert.match(shell, /const isDemoLogout = auth\.currentUser\?\.isAnonymous === true/);
  assert.match(shell, /if \(isDemoLogout\) \{\s+markDemoExitPending\(\);\s+requireDemoExitRetry\(\);\s+\}/);
  assert.ok(shell.indexOf('requireDemoExitRetry()') < shell.indexOf("await fetch('/api/demo/exit'"));
  assert.match(shell, /if \(isDemoLogout\) \{\s+const response = await fetch\('\/api\/demo\/exit', \{ method: 'POST' \}\);\s+if \(!response\.ok\) \{\s+demoCleanupRejectedBeforeMutation = response\.status === 403;\s+throw new Error\('Demo cleanup failed'\);\s+\}\s+\}/);
  assert.match(shell, /finally \{\s+if \(isDemoLogout\) \{\s+if \(logoutCompleted\) clearDemoExitPending\(\);\s+else if \(demoCleanupRejectedBeforeMutation\) cancelDemoExitPending\(\);/);
  assert.ok(shell.indexOf("await fetch('/api/demo/exit'") < shell.indexOf('await clearBrowserSession(assertAuthority)'));
  assert.match(cleanup, /user\.providerData\.length > 0/);
  assert.match(cleanup, /collection\('publicLeagueViews'\)\.doc\(league\.id\)\.delete\(\)/);
  assert.ok(cleanup.indexOf("recursiveDelete(adminDb.collection('users').doc(uid))") < cleanup.indexOf('auth.deleteUser(uid)'));
  assert.match(functions, /cleanupAnonymousUsers = onSchedule\(\{[\s\S]*schedule: 'every 15 minutes'/);
});

test('every visible logout unregisters push while the user is still authenticated', async () => {
  const [shell, settings, pushRegistration] = await Promise.all([
    source('../src/components/layout/Shell.tsx'),
    source('../src/app/(dashboard)/settings/page.tsx'),
    source('../src/lib/client-push-registration.ts'),
  ]);

  const settingsLogout = settings.match(/const performLogout = async [\s\S]*?\n  \};/)?.[0] || '';
  assert.match(settings, /import \{ deletePushDevice/);
  assert.match(settingsLogout, /const isDemoLogout = auth\.currentUser\?\.isAnonymous === true;/);
  assert.doesNotMatch(settingsLogout, /user\?\.isDemo/);
  assert.match(settingsLogout, /const authenticatedUserId = auth\.currentUser\?\.uid/);
  assert.match(settingsLogout, /if \(authenticatedUserId && !isDemoLogout\) \{\s+assertAuthority\(\);\s+await deletePushDevice\(authenticatedUserId\)\.catch/);
  assert.match(settingsLogout, /if \(isDemoLogout\) \{\s+const response = await fetch\('\/api\/demo\/exit', \{ method: 'POST' \}\)/);
  assert.ok(settingsLogout.indexOf('await deletePushDevice(authenticatedUserId)') < settingsLogout.indexOf('await clearBrowserSession(assertAuthority)'));
  assert.ok(settingsLogout.indexOf("await fetch('/api/demo/exit'") < settingsLogout.indexOf('await clearBrowserSession(assertAuthority)'));
  // Runtime cases below verify awaited cleanup and either SDK callback path.
  const shellLogout = shell.match(/const performLogout = async [\s\S]*?\n  \};/)?.[0] || '';
  assert.match(shellLogout, /const isDemoLogout = auth\.currentUser\?\.isAnonymous === true;/);
  assert.doesNotMatch(shellLogout, /hasDemoBanner/);
  assert.match(shellLogout, /const authenticatedUserId = auth\.currentUser\?\.uid/);
  assert.match(shellLogout, /if \(authenticatedUserId && !isDemoLogout\) \{\s+assertAuthority\(\);\s+await deletePushDevice\(authenticatedUserId\)\.catch/);
  assert.ok(shellLogout.indexOf('await deletePushDevice(authenticatedUserId)') < shellLogout.indexOf("await fetch('/api/demo/exit'"));
  const deletion = pushRegistration.match(/export async function deletePushDevice[\s\S]*?\n\}/)?.[0] || '';
  assert.match(deletion, /currentUser\.uid !== userId/);
  assert.match(deletion, /await clearLegacyFcmRegistrations\(userId\)\.catch/);
  assert.match(deletion, /await deleteWebPushSubscription\(userId\)\.catch/);
  assert.match(pushRegistration, /try \{\s+await updateWebPushSubscription[\s\S]*?finally \{[\s\S]*?await subscription\.unsubscribe\(\)/);
});

function logoutFunction(text, file, dependencies) {
  const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'performLogout') {
      assert.equal(expression, undefined, 'logout entry point must be unique');
      expression = node.initializer.getText(ast);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(expression, 'actual logout entry point must exist');
  const compiled = ts.transpileModule(`(${expression})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return vm.runInNewContext(compiled, dependencies);
}

function heldCleanup() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function waitForCleanup(promise) {
  let timer;
  try {
    await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(Error('Expected cleanup did not start')), 2000);
    })]);
  } finally { clearTimeout(timer); }
}

for (const file of ['../src/components/layout/Shell.tsx', '../src/app/(dashboard)/settings/page.tsx']) {
  for (const supplied of [false, true]) {
    const label = `${file} (${supplied ? 'guarded' : 'default'} signout)`;
    function fixture(text, { push, session } = {}) {
      const original = { uid: 'logout-owner', isAnonymous: false };
      const auth = { currentUser: original };
      const events = [];
      const assertAuthority = () => assert.equal(auth.currentUser, original, 'captured authority changed');
      const dependencies = {
        auth,
        deletePushDevice: async uid => {
          assertAuthority(); assert.equal(uid, original.uid); events.push('push');
          await push?.();
        },
        clearBrowserSession: async guard => {
          guard(); assertAuthority(); events.push('session'); await session?.();
        },
        signOut: async currentAuth => {
          assert.equal(currentAuth, auth); events.push('default SDK'); auth.currentUser = null;
        },
        router: { push: route => { assert.equal(route, '/login'); events.push('redirect'); } },
        toast: () => events.push('failure'),
        console: { warn: () => events.push('push warning') },
        fetch: () => { throw Error('Registered user must not invoke demo cleanup'); },
        markDemoExitPending: () => { throw Error('Registered user must not enter demo cleanup'); },
        requireDemoExitRetry: () => { throw Error('Registered user must not enter demo cleanup'); },
        clearDemoExitPending: () => { throw Error('Registered user must not enter demo cleanup'); },
        cancelDemoExitPending: () => { throw Error('Registered user must not enter demo cleanup'); },
      };
      const action = logoutFunction(text, file, dependencies);
      const callback = async () => { events.push('guarded SDK'); assertAuthority(); auth.currentUser = null; };
      return { auth, original, events, run: () => action(assertAuthority, ...(supplied ? [callback] : [])) };
    }
    const sdkEvent = supplied ? 'guarded SDK' : 'default SDK';
    test(`${label}: awaits push and session cleanup before SDK signout`, async () => {
      const push = heldCleanup(), session = heldCleanup(), pushEntered = heldCleanup(), sessionEntered = heldCleanup();
      const f = fixture(await source(file), {
        push: () => { pushEntered.resolve(); return push.promise; },
        session: () => { sessionEntered.resolve(); return session.promise; },
      });
      const work = f.run();
      try {
        await waitForCleanup(pushEntered.promise);
        assert.deepEqual(f.events, ['push']); assert.equal(f.auth.currentUser, f.original);
        push.resolve(); await waitForCleanup(sessionEntered.promise);
        assert.deepEqual(f.events, ['push', 'session']); assert.equal(f.auth.currentUser, f.original);
        session.resolve(); await work;
        assert.deepEqual(f.events, ['push', 'session', sdkEvent, 'redirect']);
        assert.equal(f.auth.currentUser, null);
      } finally { push.resolve(); session.resolve(); await work; }
    });
    test(`${label}: rejected push cleanup remains best effort without moving signout earlier`, async () => {
      const f = fixture(await source(file), { push: async () => { throw Error('Synthetic push cleanup failure'); } });
      await f.run();
      assert.deepEqual(f.events, ['push', 'push warning', 'session', sdkEvent, 'redirect']);
    });
    test(`${label}: rejected session cleanup prevents either SDK path and redirect`, async () => {
      const f = fixture(await source(file), { session: async () => { throw Error('Synthetic session cleanup failure'); } });
      await f.run();
      assert.deepEqual(f.events, ['push', 'session', 'failure']); assert.equal(f.auth.currentUser, f.original);
    });
    test(`${label}: initial authority failure causes no cleanup or signout`, async () => {
      const f = fixture(await source(file)); const other = { uid: 'other-account', isAnonymous: false };
      f.auth.currentUser = other;
      await assert.rejects(f.run(), /captured authority changed/);
      assert.deepEqual(f.events, []); assert.equal(f.auth.currentUser, other);
    });
    test(`${label}: account change during awaited cleanup prevents signout of new account`, async () => {
      const session = heldCleanup(), entered = heldCleanup();
      const f = fixture(await source(file), { session: () => { entered.resolve(); return session.promise; } });
      const work = f.run(); const other = { uid: 'other-account', isAnonymous: false };
      try {
        await waitForCleanup(entered.promise); f.auth.currentUser = other; session.resolve(); await work;
        assert.deepEqual(f.events, ['push', 'session', 'failure']); assert.equal(f.auth.currentUser, other);
      } finally { session.resolve(); await work; }
    });
  }
}

test('demo launch creates its protected profile before entering dashboard routes', async () => {
  const [login, landing, clientAuth] = await Promise.all([
    source('../src/app/login/page.tsx'),
    source('../src/app/page.tsx'),
    source('../src/lib/client-auth.ts'),
  ]);

  for (const launcher of [login, landing]) {
    const bootstrap = launcher.indexOf('await bootstrapDemoWorkspace(demoCredential.user, planId)');
    const session = launcher.indexOf('await establishBrowserSession(demoCredential.user)');
    assert.ok(bootstrap >= 0 && bootstrap < session);
  }
  // Auto-navigation must wait for both demo bootstrap and native auth handoff.
  assert.match(login, /React\.useEffect\(\(\) => \{\s*if \(isDemoLoading \|\| nativeBrowserAuthGate\.busy\(\)\) return;/);
  assert.match(clientAuth, /fetch\('\/api\/demo\/seed'/);
  assert.match(clientAuth, /Authorization: `Bearer \$\{token\}`/);
});

test('shared navigation uses plain language and role-specific primary actions', async () => {
  const [shell, dashboard, family, login, alerts, demoLayout] = await Promise.all([
    source('../src/components/layout/Shell.tsx'),
    source('../src/app/(dashboard)/dashboard/page.tsx'),
    source('../src/app/(dashboard)/family/page.tsx'),
    source('../src/app/login/page.tsx'),
    source('../src/components/layout/AlertOverlay.tsx'),
    source('../src/app/(dashboard)/layout.tsx'),
  ]);

  assert.match(await source('../src/components/team-home/use-team-navigation.ts'), /const roleNavigationOrder = isParent/);
  assert.match(shell, /const primaryCoordTabs = filteredCoordTabs\.filter/);
  assert.match(shell, /\['\/leagues', '\/manage-tournaments'\]\.includes\(tab.href\)/);
  assert.match(shell, /Your Main Tools/);
  assert.match(shell, /More Tools/);
  assert.match(shell, /Join & Invite/);
  assert.doesNotMatch(shell, /Team Join Code/);
  assert.match(shell, /name: user\?\.homeScreenLayout === 'modern' \? 'Home' : 'Family'/);
  assert.match(shell, /href: user\?\.homeScreenLayout === 'modern' \? '\/dashboard' : '\/family'/);
  assert.match(shell, /\{ name: 'Profile', href: '\/roster'/);
  assert.match(dashboard, /Next Actions/);
  assert.match(dashboard, /Family Schedule/);
  assert.match(dashboard, /Manage Roster/);
  assert.match(dashboard, /Waivers and Documents/);
  assert.match(family, /Family Overview/);
  assert.match(family, /Review Waivers/);
  assert.match(family, /Family Payments/);
  assert.match(login, /\{forgotMode \? 'Reset Password' : 'Sign In'\}/);
  assert.match(login, /Email Address/);
  assert.match(alerts, /Priority Alert/);
  assert.match(alerts, /Got It/);
  assert.match(demoLayout, /Resets In:/);
  assert.doesNotMatch(shell, /Strategic Command|Tactical Menu|Identity Termination/);
  assert.doesNotMatch(dashboard, /Mission Itinerary|Community Intelligence|Audit Ledger|Tactical Silence/);
  assert.doesNotMatch(family, /Household Command|Operational Pulse|Active Directives|Execute Waivers/);
  assert.doesNotMatch(alerts, /High Priority Squad Alert|Acknowledged Hub Directive/);
});

test('Playbook is contained within the Practice workspace', async () => {
  const [shell, practice, playbook, legacyRoute] = await Promise.all([
    source('../src/components/layout/Shell.tsx'),
    source('../src/app/(dashboard)/practice/page.tsx'),
    source('../src/components/practice/PlaybookPanel.tsx'),
    source('../src/app/(dashboard)/drills/page.tsx'),
  ]);

  assert.match(practice, /Practice Planner/);
  assert.match(practice, /PlaybookPanel embedded/);
  assert.match(practice, /aria-label="Practice workspace views"/);
  assert.doesNotMatch(shell, /name: 'Playbook', href: '\/drills'/);
  assert.match(playbook, /export function PlaybookPanel/);
  assert.match(legacyRoute, /return <PlaybookPanel \/>/);
});
