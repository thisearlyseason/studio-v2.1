import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { hasUnresolvedSubscription } from '../src/lib/checkout-policy.ts';
import { getPlanTeamLimit } from '../src/lib/plan-catalog.ts';
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
  assert.match(spectatorLayout, /collection\('publicLeagueViews'\)/);
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
  assert.match(deploy, /check-firestore-rules-drift\.mjs/);
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

test('anonymous demos survive reloads and clean up abandoned sessions with the scheduler as fallback', async () => {
  const [layout, provider, endpoint, cleanup, functions] = await Promise.all([
    source('../src/app/(dashboard)/layout.tsx'),
    source('../src/firebase/provider.tsx'),
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
  assert.match(endpoint, /getTrustedAppOrigin/);
  assert.match(endpoint, /origin !== getTrustedAppOrigin\(request\)/);
  assert.doesNotMatch(endpoint, /origin !== request\.nextUrl\.origin/);
  assert.match(endpoint, /verifySessionCookie\(sessionCookie, true\)/);
  assert.match(endpoint, /sign_in_provider !== 'anonymous'/);
  assert.match(provider, /firebaseUser\?\.isAnonymous && localStorage\.getItem\(DEMO_EXIT_PENDING_KEY\) === 'true'/);
  assert.match(provider, /sessionStorage\.getItem\(DEMO_START_KEY\)/);
  assert.match(provider, /fetch\('\/api\/demo\/exit', \{ method: 'POST', keepalive: true \}\)/);
  assert.match(provider, /await signOut\(auth\)/);
  assert.match(cleanup, /user\.providerData\.length > 0/);
  assert.match(cleanup, /collection\('publicLeagueViews'\)\.doc\(league\.id\)\.delete\(\)/);
  assert.ok(cleanup.indexOf("recursiveDelete(adminDb.collection('users').doc(uid))") < cleanup.indexOf('auth.deleteUser(uid)'));
  assert.match(functions, /cleanupAnonymousUsers = onSchedule\(\{[\s\S]*schedule: 'every 15 minutes'/);
});

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
  assert.match(login, /if \(isDemoLoading\) return;/);
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

  assert.match(shell, /const roleNavigationOrder = isParent/);
  assert.match(shell, /const primaryCoordTabs = filteredCoordTabs\.slice\(0, 5\)/);
  assert.match(shell, /Your Main Tools/);
  assert.match(shell, /More Tools/);
  assert.match(shell, /Join & Invite/);
  assert.doesNotMatch(shell, /Team Join Code/);
  assert.match(shell, /\{ name: 'Family', href: '\/family'/);
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
