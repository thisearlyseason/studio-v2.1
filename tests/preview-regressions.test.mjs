import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readSource = path => readFile(new URL(path, import.meta.url), 'utf8');

test('facility rename scans owner-scoped schedules without collection-group indexes', async () => {
  const source = await readSource('../src/app/api/facilities/update/route.ts');
  assert.match(source, /where\('ownerUserId', '==', facilityOwnerId\)/);
  assert.match(source, /teamDoc\.ref\.collection\('events'\)\.get\(\)/);
  assert.match(source, /auth\.role === 'superadmin'/);
  assert.doesNotMatch(source, /requesterSnap\.data\(\)\?\.role/);
  assert.doesNotMatch(source, /collectionGroup\('events'\)/);
});

test('facility management remains owner-scoped for super admins', async () => {
  const source = await readSource('../src/app/(dashboard)/facilities/page.tsx');

  assert.match(
    source,
    /collection\(db, 'facilities'\), where\('clubId', '==', firebaseUser\.uid\)/
  );
  assert.doesNotMatch(
    source,
    /if \(isSuperAdmin\) \{\s*return query\(collection\(db, 'facilities'\)/
  );
});

test('unused facility deletion scans owner schedules without collection-group indexes', async () => {
  const source = await readSource('../src/app/api/facilities/delete/route.ts');

  assert.match(source, /where\('ownerUserId', '==', facilityOwnerId\)/);
  assert.match(source, /teamDoc\.ref\.collection\('events'\)\.get\(\)/);
  assert.match(source, /const batch = adminDb\.batch\(\)/);
  assert.doesNotMatch(source, /collectionGroup\('events'\)/);
});

test('squad recruitment links never redirect into league registration', async () => {
  const roster = await readSource('../src/app/(dashboard)/roster/page.tsx');
  const team = await readSource('../src/app/(dashboard)/team/page.tsx');
  for (const source of [roster, team]) {
    assert.match(source, /\/teams\/join\?code=/);
    assert.doesNotMatch(source, /registrationProtocolId[\s\S]{0,180}register\/league/);
  }
});

test('recruitment page resolves the linked squad and requires confirmation', async () => {
  const page = await readSource('../src/app/(dashboard)/teams/join/page.tsx');
  const rapidJoinPage = await readSource('../src/app/register/squad/[teamId]/page.tsx');
  const route = await readSource('../src/app/api/teams/join/route.ts');
  assert.match(route, /export async function GET/);
  assert.match(route, /enforceUserRateLimit/);
  assert.match(route, /readJsonBodyWithLimit/);
  assert.match(page, /Join \{invitePreview\?\.teamName/);
  assert.match(page, /'Join Squad As Player'/);
  assert.match(page, /<AlertDialog/);
  assert.match(page, /Every signed-in account may enroll itself as an ordinary player/);
  assert.doesNotMatch(page, /\{isAthlete && \(/);
  assert.match(route, /enrollmentIntent === 'player'/);
  assert.match(route, /STAFF_MEMBERSHIP_EXISTS/);
  assert.match(route, /Shared rapid-join links must resolve before the recipient signs in/);
  assert.match(route, /team_join_sessions/);
  assert.match(route, /sessionToken\.length >= 32/);
  assert.match(route, /data:\s*\{\s*team:/s);
  assert.match(rapidJoinPage, /`p_\$\{firebaseUser\?\.uid\}`/);
  assert.match(rapidJoinPage, /sessionToken: joinData\.sessionToken/);
});

test('tournament enrollment accepts a code, event ID, or registration link', async () => {
  const join = await readSource('../src/app/(dashboard)/teams/join/page.tsx');
  const resolver = await readSource('../src/app/api/tournaments/resolve/route.ts');
  const events = await readSource('../src/app/api/teams/events/action/route.ts');
  const tournamentAdmin = await readSource('../src/app/(dashboard)/manage-tournaments/registration/[teamId]/[eventId]/page.tsx');

  assert.match(join, /Tournament Code, ID, or Registration Link/);
  assert.match(join, /api\/tournaments\/resolve\?code=/);
  assert.match(join, /Found: \{tournamentPreview\.title\}/);
  assert.match(resolver, /collection\('tournamentRegistrationCodes'\)/);
  assert.match(resolver, /directory\.doc\(normalizedCode\)/);
  assert.match(resolver, /DIRECT_ID_PATTERN/);
  assert.match(events, /directory\.doc\(eventId\)/);
  assert.match(events, /That tournament code is already in use/);
  assert.match(events, /REGISTRATION_CODE_PATTERN/);
  assert.match(resolver, /collection\('registration'\)\.doc\('team_config'\)/);
  assert.match(events, /randomBytes\(5\)\.toString\('hex'\)/);
  assert.match(tournamentAdmin, /Tournament Code \/ ID/);
  assert.match(tournamentAdmin, /Generate Code/);
});

test('parent recruitment requires a child and preserves the invitation through family setup', async () => {
  const signup = await readSource('../src/app/signup/page.tsx');
  const join = await readSource('../src/app/(dashboard)/teams/join/page.tsx');
  const family = await readSource('../src/app/(dashboard)/family/page.tsx');

  assert.match(signup, /role === 'parent' && teamJoinPath/);
  assert.match(signup, /family\?addChild=1&returnTo=/);
  assert.match(join, /!isParent && <button/);
  assert.match(join, /disabled=\{isJoining \|\| !effectivePlayerId\}/);
  assert.match(family, /destination\.searchParams\.set\('playerId', cid\)/);
});

test('tournament and event registration responses are visible at their event-scoped organizer paths', async () => {
  const publicAction = await readSource('../src/app/api/public/portals/action/route.ts');
  const provider = await readSource('../src/components/providers/team-provider.tsx');
  const tournament = await readSource('../src/app/(dashboard)/manage-tournaments/registration/[teamId]/[eventId]/page.tsx');
  const publicTournament = await readSource('../src/app/register/tournament/[teamId]/[eventId]/page.tsx');
  const eventDialog = await readSource('../src/app/(dashboard)/events/EventDetailDialog.tsx');

  assert.match(publicAction, /entryParentRef = eventRef/);
  assert.match(publicAction, /entryParentRef\.collection\('registrationEntries'\)/);
  assert.match(provider, /collection\(entryParentRef, 'registrationEntries'\)/);
  assert.match(tournament, /events', eventId as string, 'registrationEntries'/);
  assert.match(tournament, /where\('event_id', '==', eventId as string\)/);
  assert.match(tournament, /else if \(!isConfigLoading\)[\s\S]{0,500}is_active: false/);
  assert.match(tournament, /form_schema: \[DIVISION_FIELD\]/);
  assert.match(tournament, /Required Answer/);
  assert.match(tournament, /Configure a question, answer type, form section/);
  assert.match(tournament, /value=\{editingField\?\.type \|\| ''\}/);
  assert.match(tournament, /BASE_REGISTRATION_ANSWER_LABELS/);
  assert.match(tournament, /schemaField\?\.label/);
  assert.match(tournament, /aria-label=\{`View registration for/);
  assert.match(tournament, /aria-label=\{`Delete registration for/);
  assert.match(tournament, /Delete the registration for \$\{teamName\}\? This cannot be undone\./);
  for (const fieldType of ['long_text', 'dropdown', 'radio', 'checkbox', 'signature', 'information_box']) {
    assert.match(publicTournament, new RegExp(`field\\.type === '${fieldType}'`));
  }
  assert.match(publicTournament, /validateCurrentStep/);
  assert.match(publicAction, /requiredCore = \['teamName', 'name', 'email'\]/);
  assert.match(publicAction, /Array\.isArray\(value\) \? value\.length === 0 : value !== true/);
  assert.match(eventDialog, /value="responses"/);
  assert.match(eventDialog, /'registrations'/);
  assert.match(eventDialog, /<DialogDescription/);
});

test('public league registration uses server-mediated reads, lookups, and submissions', async () => {
  const page = await readSource('../src/app/register/league/[leagueId]/page.tsx');
  const portal = await readSource('../src/app/api/public/portals/route.ts');
  const action = await readSource('../src/app/api/public/portals/action/route.ts');

  assert.match(page, /kind=league-registration/);
  assert.match(page, /kind: 'league',[\s\S]{0,100}action: 'lookup-team'/);
  assert.match(page, /kind: 'league',[\s\S]{0,100}action: 'register'/);
  assert.doesNotMatch(page, /redeemLeagueInvite|submitRegistrationEntry|useDoc</);
  for (const fieldType of ['long_text', 'dropdown', 'radio', 'multi_select', 'checkbox', 'signature', 'information_box']) {
    assert.match(page, new RegExp(`field\\.type === '${fieldType}'`));
  }
  assert.match(page, /Full Name <span/);
  assert.match(page, /Date of Birth <span/);
  assert.match(portal, /if \(!publicLeagueData\.isActive\)/);
  assert.match(action, /where\('inviteCode', '==', teamCode\)/);
  assert.match(action, /guardian_name.*guardian_email.*guardian_phone.*guardian_relationship/);
  assert.match(action, /const requiredCore = registrationType === 'team'/);
});

test('demo batches stay below the rules-engine access-call ceiling', async () => {
  const source = await readSource('../src/lib/db-seeder.ts');
  assert.match(source, /CHUNK_SIZE = 5/);
  assert.match(source, /transientCodes/);
});

test('demo bootstrap creates the protected league before client blueprint enrichment', async () => {
  const route = await readSource('../src/app/api/demo/seed/route.ts');
  const seeder = await readSource('../src/lib/db-seeder.ts');

  assert.match(route, /demo_league_\$\{uid\.slice\(-4\)\}/);
  assert.match(route, /adminDb\.collection\('leagues'\)\.doc\(leagueId\)/);
  assert.match(route, /creatorId: uid/);
  assert.match(route, /memberUserIds: \[uid\]/);
  assert.doesNotMatch(route, /if \(plan\.role !== 'parent'\)/);
  assert.match(seeder, /const activeDemoLeagueId = `demo_league_\$\{userId\.slice\(-4\)\}`/);
  assert.match(seeder, /if \(lDoc\.id !== activeDemoLeagueId\)/);
  assert.match(seeder, /batch\.set\(doc\(db, 'leagues', leagueId\)/);
});

test('demo blueprint merges protected team and league roots created by the server', async () => {
  const seeder = await readSource('../src/lib/db-seeder.ts');

  assert.match(seeder, /const isProtectedDemoRoot = \/\^\(teams\|leagues\)/);
  assert.match(seeder, /else if \(isProtectedDemoRoot\) \{\s*this\.batch\.set\(ref, data, \{ merge: true \}\)/);
});

test('demo chat messages are server-seeded through the protected message boundary', async () => {
  const route = await readSource('../src/app/api/demo/seed/route.ts');
  const seeder = await readSource('../src/lib/db-seeder.ts');

  assert.match(route, /const demoMessages = \[/);
  assert.match(route, /collection\('groupChats'\).*collection\('messages'\)/s);
  assert.match(route, /createdAt: messageTimestamp/);
  assert.doesNotMatch(seeder, /c\.messages\.forEach/);
});

test('demo recruiting profiles stay private except for the public scout fixture', async () => {
  const source = await readSource('../src/lib/db-seeder.ts');

  assert.match(source, /recruitingProfileEnabled: m\.name === 'Alex Rivera'/);
  assert.match(source, /if \(m\.name === 'Alex Rivera'\)[\s\S]{0,700}isPublic: true/);
});

test('local Firebase client and Admin SDK honor the isolated preview project', async () => {
  const nextConfig = await readSource('../next.config.ts');
  const clientConfig = await readSource('../src/firebase/config.ts');
  const adminConfig = await readSource('../src/lib/firebase-admin.ts');

  assert.match(nextConfig, /process\.env\.NEXT_PUBLIC_FIREBASE_WEBAPP_CONFIG/);
  assert.match(clientConfig, /Local Firebase configuration is missing/);
  assert.match(adminConfig, /process\.env\.GOOGLE_CLOUD_PROJECT \|\| process\.env\.GCLOUD_PROJECT/);
  assert.match(adminConfig, /admin\.initializeApp\(projectId \? \{ projectId \} : undefined\)/);
});

test('Google sign-in keeps its provider and popup resolver in the same module boundary', async () => {
  const login = await readSource('../src/app/login/page.tsx');
  const nextConfig = await readSource('../next.config.ts');
  const cspBuilder = await readSource('../src/lib/content-security-policy.ts');

  assert.match(login, /browserPopupRedirectResolver/);
  assert.match(login, /signInWithPopup\(auth, provider, browserPopupRedirectResolver\)/);
  assert.match(nextConfig, /buildContentSecurityPolicy/);
  assert.match(cspBuilder, /script-src[^\n]*https:\/\/apis\.google\.com/);
  assert.match(cspBuilder, /frame-src[^\n]*https:\/\/\*\.firebaseapp\.com/);
});

test('school hub onboarding waits for profile hydration and permits the guarded hub route', async () => {
  const layout = await readSource('../src/app/(dashboard)/layout.tsx');

  assert.match(layout, /!user \|\| !userProfile \|\| isDemoInitializing/);
  assert.match(layout, /pathname === '\/club'/);
});

test('team member hydration does not bulk-read private user profiles', async () => {
  const provider = await readSource('../src/components/providers/team-provider.tsx');

  assert.doesNotMatch(provider, /query\(collection\(db, 'users'\), where\(documentId\(\), 'in'/);
  assert.doesNotMatch(provider, /Hydration partial failure/);
});

test('demo organization hubs do not call Stripe Connect', async () => {
  const settings = await readSource('../src/components/finance/HubStripeSettings.tsx');
  const club = await readSource('../src/app/(dashboard)/club/page.tsx');

  assert.match(settings, /if \(isDemo\)/);
  assert.match(settings, /Online Payments Disabled in Demo/);
  assert.match(club, /isDemo=\{user\.isDemo === true && !isSuperAdmin\}/);
});

test('demo workspaces never dispatch external team notifications', async () => {
  const provider = await readSource('../src/components/providers/team-provider.tsx');

  assert.equal(
    (provider.match(/if \(!activeTeam\.isDemo\) Promise\.resolve\(\)\.then/g) || []).length,
    3
  );
});

test('production feed does not ship the retired Tenor integration', async () => {
  const feed = await readSource('../src/app/(dashboard)/feed/page.tsx');

  assert.doesNotMatch(feed, /api\.tenor\.com|TENOR_KEY|GifPicker|Search GIFs/);
  assert.match(feed, /Poll Incomplete/);
});

test('creation workflows reject incomplete required fields', async () => {
  const [events, practice, leagues, tournaments] = await Promise.all([
    readSource('../src/app/(dashboard)/events/page.tsx'),
    readSource('../src/app/(dashboard)/practice/page.tsx'),
    readSource('../src/app/(dashboard)/leagues/leagues-page-content.tsx'),
    readSource('../src/app/(dashboard)/manage-tournaments/manage-tournaments-page-content.tsx'),
  ]);

  assert.match(events, /Activity Incomplete/);
  assert.match(practice, /Protocol Title Required/);
  assert.match(leagues, /disabled=\{isProcessing \|\| !leagueName\.trim\(\)\}/);
  assert.match(tournaments, /Base Configuration Incomplete/);
  assert.match(tournaments, /form\.endDate < form\.startDate/);
  assert.match(tournaments, /filteredTeams\.length < 2/);
  assert.match(tournaments, /At least two squads are required/);
  assert.match(tournaments, /validateRosterMatrix/);
  assert.match(tournaments, /Squad Matrix Incomplete/);
  assert.match(tournaments, /step === 2 && !validateRosterMatrix\(\)/);
  assert.match(tournaments, /onClick=\{\(\) => handleStepSelection\(s\.num\)\}/);
});

test('fundraising creation requires a valid deadline and positive goal', async () => {
  const fundraising = await readSource('../src/app/(dashboard)/fundraising/page.tsx');
  assert.match(fundraising, /!newFund\.deadline/);
  assert.match(fundraising, /Number\.isNaN\(deadlineDate\.getTime\(\)\)/);
  assert.match(fundraising, /goalAmount <= 0/);
});

test('chat controls have a functional menu trigger and accessible names', async () => {
  const chat = await readSource('../src/app/(dashboard)/chats/[chatId]/page.tsx');

  assert.match(chat, /<TooltipTrigger asChild>\s*<DropdownMenuTrigger asChild>\s*<Button aria-label="Channel parameters"/);
  for (const label of ['Back to chats', 'View channel members', 'Attach image', 'Create poll', 'Send message']) {
    assert.match(chat, new RegExp(`aria-label="${label}"`));
  }
});

test('member-filtered chat lists declare their sorting index', async () => {
  const indexes = JSON.parse(await readSource('../firestore.indexes.json'));
  const chatIndex = indexes.indexes.find(index =>
    index.collectionGroup === 'groupChats' && index.queryScope === 'COLLECTION'
  );

  assert.ok(chatIndex);
  assert.ok(chatIndex.fields.some(field =>
    field.fieldPath === 'memberIds' && field.arrayConfig === 'CONTAINS'
  ));
  assert.ok(chatIndex.fields.some(field =>
    field.fieldPath === 'createdAt' && field.order === 'DESCENDING'
  ));
});

test('family signature lookups declare their collection-group indexes', async () => {
  const indexes = JSON.parse(await readSource('../firestore.indexes.json'));

  for (const fieldPath of ['userId', 'teamId']) {
    assert.ok(indexes.fieldOverrides.some(override =>
      override.collectionGroup === 'signatures' &&
      override.fieldPath === fieldPath &&
      override.indexes?.some(index =>
        index.order === 'ASCENDING' && index.queryScope === 'COLLECTION_GROUP'
      )
    ));
  }
});

test('dashboard queues unsigned-document prompts behind unread broadcasts', async () => {
  const dashboard = await readSource('../src/app/(dashboard)/dashboard/page.tsx');

  assert.match(dashboard, /alerts, seenAlertIds/);
  assert.match(dashboard, /const hasUnreadAlert = alerts\.some\(alert => !seenAlertIds\.includes\(alert\.id\)\)/);
  assert.match(dashboard, /pendingWaiversCount > 0 && !hasUnreadAlert/);
  assert.match(dashboard, /\[pendingWaiversCount, hasUnreadAlert\]/);
});

test('school-wide member lookup declares its collection-group index', async () => {
  const coachesCorner = await readSource('../src/app/(dashboard)/coaches-corner/page.tsx');
  const indexes = JSON.parse(await readSource('../firestore.indexes.json'));

  assert.match(
    coachesCorner,
    /collectionGroup\(db, 'members'\), where\('schoolId', '==', currentSchoolId\)/
  );
  assert.ok(indexes.fieldOverrides.some(override =>
    override.collectionGroup === 'members' &&
    override.fieldPath === 'schoolId' &&
    override.indexes?.some(index =>
      index.order === 'ASCENDING' && index.queryScope === 'COLLECTION_GROUP'
    )
  ));
});

test('event date override preserves collection sorting indexes', async () => {
  const indexes = JSON.parse(await readSource('../firestore.indexes.json'));
  const dateOverride = indexes.fieldOverrides.find(override =>
    override.collectionGroup === 'events' && override.fieldPath === 'date'
  );

  assert.ok(dateOverride);
  assert.ok(dateOverride.indexes.some(index =>
    index.order === 'ASCENDING' && index.queryScope === 'COLLECTION'
  ));
  assert.ok(dateOverride.indexes.some(index =>
    index.order === 'DESCENDING' && index.queryScope === 'COLLECTION'
  ));
  assert.ok(dateOverride.indexes.some(index =>
    index.order === 'ASCENDING' && index.queryScope === 'COLLECTION_GROUP'
  ));
});

test('demo role selector has an accessible description', async () => {
  const landing = await readSource('../src/app/page.tsx');

  assert.match(landing, /Choose a demo role to open an isolated sample workspace/);
});

test('landing navigation sends authenticated users to the dashboard', async () => {
  const landing = await readSource('../src/app/page.tsx');

  assert.match(landing, /const accountHref = user \? '\/dashboard' : '\/login'/);
  assert.match(landing, /const accountLabel = user \? 'Dashboard' : 'Log In'/);
  assert.equal((landing.match(/href=\{accountHref\}/g) || []).length, 3);
});

test('landing reveal curtain never blocks visible hero controls', async () => {
  const landing = await readSource('../src/app/page.tsx');

  assert.match(landing, /pointer-events-none absolute inset-x-0 top-0 h-1\/2 bg-black z-50 origin-top/);
  assert.match(landing, /pointer-events-none absolute inset-x-0 bottom-0 h-1\/2 bg-black z-50 origin-bottom/);
});

test('newsletter subscription and sending are handled by protected server routes', async () => {
  const landing = await readSource('../src/app/page.tsx');
  const adminRoute = await readSource('../src/app/api/admin/newsletter/send/route.ts');
  const renderer = await readSource('../src/lib/newsletter-content.ts');

  assert.match(landing, /fetch\('\/api\/newsletter\/subscribe'/);
  assert.doesNotMatch(landing, /addDoc\(collection\(db, 'newsletter_signups'/);
  assert.match(adminRoute, /auth\.role !== 'superadmin'/);
  assert.match(adminRoute, /syncNewsletterSubscribersToResend/);
  assert.match(adminRoute, /broadcasts\.create/);
  assert.match(renderer, /RESEND_UNSUBSCRIBE_URL/);
});

test('production Firebase config cannot be replaced by preview credentials', async () => {
  const nextConfig = await readSource('../next.config.ts');
  assert.match(nextConfig, /process\.env\.VERCEL_ENV === 'production'/);
  assert.match(nextConfig, /\? ''/);
});

test('newsletter manager refreshes expired tokens and exposes rich text controls', async () => {
  const manager = await readSource('../src/components/admin/newsletter-manager.tsx');
  const editor = await readSource('../src/components/ui/rich-text-editor.tsx');
  const apiAuth = await readSource('../src/lib/api-auth.ts');
  assert.match(manager, /response\.status === 401 \? requestWithToken\(true\)/);
  assert.match(manager, /Sign Out and Reauthenticate/);
  assert.match(editor, /contentEditable/);
  assert.match(editor, /label: 'Bold'/);
  assert.match(editor, /label: 'Italic'/);
  assert.match(editor, /label: 'Inline image'/);
  assert.match(editor, /insertUnorderedList/);
  assert.match(apiAuth, /auth\/project-mismatch/);
  assert.match(apiAuth, /verifyIdToken\(idToken, true\)/);
});

test('new subscribers receive one configurable server-side welcome email', async () => {
  const manager = await readSource('../src/components/admin/welcome-email-manager.tsx');
  const welcomeRoute = await readSource('../src/app/api/admin/newsletter/welcome/route.ts');
  const server = await readSource('../src/lib/server-newsletter.ts');
  const unsubscribe = await readSource('../src/app/api/newsletter/unsubscribe/route.ts');

  assert.match(manager, /Automatic delivery/);
  assert.match(manager, /RichTextEditor/);
  assert.match(manager, /renderNewsletterHtml/);
  assert.match(welcomeRoute, /auth\.role === 'superadmin'/);
  assert.match(welcomeRoute, /parseNewsletterDraft/);
  assert.match(server, /welcomeEmailSentAt/);
  assert.match(server, /welcomeEmailSendingAtMs/);
  assert.match(server, /emails\.send/);
  assert.match(server, /List-Unsubscribe/);
  assert.match(unsubscribe, /validNewsletterUnsubscribeToken/);
  assert.match(unsubscribe, /export async function POST/);
});

test('embed hub exposes frameable public cards without weakening other pages', async () => {
  const nextConfig = await readSource('../next.config.ts');
  const admin = await readSource('../src/components/admin/embed-hub-manager.tsx');
  const embed = await readSource('../src/components/embed/embed-panel.tsx');
  const adminPage = await readSource('../src/app/admin/page.tsx');

  assert.match(nextConfig, /source: '\/embed\/:path\*'/);
  assert.match(nextConfig, /frame-ancestors \*/);
  assert.match(nextConfig, /X-Frame-Options/);
  assert.match(admin, /Responsive iframe code/);
  assert.match(admin, /All-in-One Link Hub/);
  assert.match(embed, /\/api\/newsletter\/subscribe/);
  assert.match(adminPage, /<EmbedHubManager/);
});

test('production responses expose health state without a framework fingerprint', async () => {
  const nextConfig = await readSource('../next.config.ts');
  const health = await readSource('../src/app/api/health/route.ts');

  assert.match(nextConfig, /poweredByHeader: false/);
  assert.match(health, /status: 'ok'/);
  assert.match(health, /service: 'the-squad-web'/);
  assert.match(health, /'Cache-Control': 'no-store, max-age=0'/);
  assert.doesNotMatch(health, /adminDb|firebase-admin|STRIPE|RESEND/);
});

test('Sports Hub admin combines built-in and custom articles without one failed query clearing all data', async () => {
  const admin = await readSource('../src/app/admin/page.tsx');
  const adminRoute = await readSource('../src/app/api/admin/sports-hub/route.ts');
  const publicRoute = await readSource('../src/app/api/sports-hub/articles/route.ts');
  const publicCatalog = await readSource('../src/hooks/use-sports-hub-articles.ts');
  const articlePage = await readSource('../src/app/sports-hub/articles/[slug]/page.tsx');
  const metadata = await import('../src/lib/sports-hub-catalog-metadata.ts');
  const catalog = await import('../src/lib/sports-hub-articles.ts');

  assert.equal(metadata.STATIC_SPORTS_HUB_ARTICLE_COUNT, catalog.ARTICLES_LIST.length);
  assert.match(admin, /fetch\('\/api\/admin\/sports-hub'/);
  assert.match(admin, /STATIC_SPORTS_HUB_ARTICLE_COUNT \+ shArticles\.length/);
  assert.match(adminRoute, /verifyFirebaseToken/);
  assert.match(adminRoute, /auth\.role === 'superadmin'/);
  assert.match(adminRoute, /Promise\.allSettled/);
  assert.match(adminRoute, /collection\('newsletter_subscribers'\)/);
  assert.match(adminRoute, /subscriber\.source === 'sports_hub'/);
  assert.match(admin, /<RichTextEditor/);
  assert.match(admin, /content: shComposeContent/);
  assert.match(publicRoute, /listPublicSportsHubArticles/);
  assert.match(publicCatalog, /fetch\('\/api\/sports-hub\/articles'/);
  assert.match(articlePage, /getPublicSportsHubArticle/);
  assert.match(articlePage, /renderSafeRichTextInline/);
});

test('Sports Hub exposes every category without horizontal scrolling and includes 20 parent articles', async () => {
  const sectionNav = await readSource('../src/components/sports-hub/SectionNav.tsx');
  const news = await readSource('../src/app/sports-hub/news/page.tsx');
  const parentsPage = await readSource('../src/app/sports-hub/parents/page.tsx');
  const catalog = await import('../src/lib/sports-hub-articles.ts');
  const parentArticles = catalog.ARTICLES_LIST.filter(article => article.categories.includes('Parents'));

  assert.equal(parentArticles.length, 40);
  assert.equal(parentArticles.every(article => article.section === 'parents'), true);
  assert.equal(parentArticles.every(article => article.content.includes('## What You Can Do This Week')), true);
  assert.match(sectionNav, /name: 'Parents'/);
  assert.match(sectionNav, /flex flex-wrap/);
  assert.doesNotMatch(sectionNav, /overflow-x-auto/);
  assert.match(news, /label: 'Parents'/);
  assert.match(news, /flex flex-wrap gap-2/);
  assert.doesNotMatch(news, /overflow-x-auto pb-1/);
  assert.match(parentsPage, /parentArticles\.length/);
});

test('topic gap pages publish sport solutions and the recommended articles in the Youth Sports Hub', async () => {
  const [
    sportIndex,
    sportLanding,
    sportCatalog,
    youthPage,
    sectionNav,
    sportsHubLayout,
    articlePage,
    sitemap,
    audienceCatalog,
    audiencePage,
    rootLayout,
  ] = await Promise.all([
    readSource('../src/app/sports/page.tsx'),
    readSource('../src/app/sports/[sport]/page.tsx'),
    readSource('../src/lib/sport-landing.ts'),
    readSource('../src/app/sports-hub/youth/page.tsx'),
    readSource('../src/components/sports-hub/SectionNav.tsx'),
    readSource('../src/components/sports-hub/SportsHubClientLayout.tsx'),
    readSource('../src/app/sports-hub/articles/[slug]/page.tsx'),
    readSource('../src/app/sitemap.ts'),
    readSource('../src/lib/audience-landing.ts'),
    readSource('../src/app/for/[audience]/page.tsx'),
    readSource('../src/app/layout.tsx'),
  ]);
  const catalog = await import('../src/lib/sports-hub-articles.ts');

  for (const slug of [
    'how-to-run-a-youth-sports-camp',
    'how-to-start-a-youth-sports-nonprofit',
    'youth-sports-team-name-ideas',
  ]) {
    assert.equal(catalog.ARTICLES_DB[slug].section, 'youth');
    assert.equal(catalog.ARTICLES_DB[slug].categories.includes('Youth Sports'), true);
  }

  assert.match(sportCatalog, /'baseball', 'rugby', 'football'/);
  assert.match(sportCatalog, /'pickleball', 'tennis', 'golf'/);
  assert.match(sportIndex, /Sports management software by sport/i);
  assert.match(sportLanding, /'@type': 'FAQPage'/);
  assert.match(sportLanding, /'@type': 'SoftwareApplication'/);
  assert.match(sportLanding, /priceCurrency: 'CAD'/);
  assert.match(sportLanding, /href="\/#pricing"/);
  assert.match(youthPage, /article\.section\.toLowerCase\(\) === 'youth'/);
  assert.match(sectionNav, /name: 'Youth Sports', href: '\/sports-hub\/youth'/);
  assert.match(sportsHubLayout, /\['Latest News', '\/sports-hub\/news'\]/);
  assert.match(sportsHubLayout, /\['Youth Sports', '\/sports-hub\/youth'\]/);
  assert.doesNotMatch(sportsHubLayout, /sports-hub\/latest-news/);
  assert.match(articlePage, /youth: '\/sports-hub\/youth'/);
  assert.match(articlePage, /timeZone: 'UTC'/);
  assert.match(sitemap, /SPORT_SLUGS\.map/);
  assert.match(sitemap, /path: '\/sports-hub\/youth'/);
  assert.match(audienceCatalog, /seoTitle: 'Parks and Recreation Sports Management Software'/);
  assert.match(audiencePage, /'@type': 'BreadcrumbList'/);
  assert.match(rootLayout, /canonical: 'https:\/\/www\.thesquad\.pro'/);
  assert.match(rootLayout, /priceCurrency: 'CAD'/);
});

test('the Elfsight chatbot and beta reporter are restricted to the landing page', async () => {
  const landing = await readSource('../src/app/page.tsx');
  const chatbot = await readSource('../src/components/LandingChatbot.tsx');
  const reporter = await readSource('../src/components/BugReporter.tsx');
  const dashboardLayout = await readSource('../src/app/(dashboard)/layout.tsx');

  assert.match(landing, /<LandingChatbot/);
  assert.match(chatbot, /Elfsight mounts parts of the widget directly under <body>/);
  assert.match(chatbot, /iframe\[src\*="elfsight"\]/);
  assert.match(reporter, /pathname !== '\/'/);
  assert.doesNotMatch(dashboardLayout, /LandingChatbot|elfsight/);
});

test('robots and sitemap use the canonical www production host', async () => {
  const robots = await readSource('../src/app/robots.ts');
  const sitemap = await readSource('../src/app/sitemap.ts');

  assert.match(robots, /sitemap: 'https:\/\/www\.thesquad\.pro\/sitemap\.xml'/);
  assert.match(sitemap, /const baseUrl = 'https:\/\/www\.thesquad\.pro'/);
  assert.doesNotMatch(robots, /sitemap: 'https:\/\/thesquad\.pro/);
  assert.doesNotMatch(sitemap, /const baseUrl = 'https:\/\/thesquad\.pro'/);
});

test('Resend webhook verifies raw signed payloads and processes each delivery once', async () => {
  const route = await readSource('../src/app/api/webhooks/resend/route.ts');
  assert.match(route, /const payload = await request\.text\(\)/);
  assert.match(route, /request\.headers\.get\('svix-id'\)/);
  assert.match(route, /request\.headers\.get\('svix-timestamp'\)/);
  assert.match(route, /request\.headers\.get\('svix-signature'\)/);
  assert.match(route, /webhooks\.verify/);
  assert.match(route, /RESEND_WEBHOOK_SECRET/);
  assert.match(route, /runTransaction/);
  assert.match(route, /status: 'processing'/);
  assert.match(route, /status: 'completed'/);
  assert.match(route, /updateSubscriberConsent/);
  const adminRoute = await readSource('../src/app/api/admin/newsletter/route.ts');
  const manager = await readSource('../src/components/admin/newsletter-manager.tsx');
  assert.match(adminRoute, /deliveredCount/);
  assert.match(adminRoute, /bouncedCount/);
  assert.match(manager, /campaign\.openedCount/);
  assert.match(manager, /campaign\.clickedCount/);
});

test('contact inquiries use a protected server delivery route', async () => {
  const landing = await readSource('../src/app/page.tsx');
  const route = await readSource('../src/app/api/contact/route.ts');

  assert.match(landing, /fetch\('\/api\/contact'/);
  assert.doesNotMatch(landing, /addDoc\(collection\(db, 'contact_inquiries'/);
  assert.match(route, /enforcePublicRateLimit/);
  assert.match(route, /CONTACT_RECIPIENT = 'team@thesquad\.pro'/);
  assert.match(route, /replyTo: email/);
  assert.match(route, /escapeHtml\(inquiry\)/);
  assert.match(route, /deliveryStatus: 'accepted'/);
  assert.match(route, /resendEmailId: data\.id/);
  assert.match(route, /deliveryStatus: 'failed'/);
});

test('superadmin account controls link to the admin page without exposing it to other roles', async () => {
  const shell = await readSource('../src/components/layout/Shell.tsx');

  assert.equal((shell.match(/\{isSuperAdmin && \(/g) || []).length >= 2, true);
  assert.equal((shell.match(/Go to Admin Page/g) || []).length, 2);
  assert.match(shell, /href="\/admin"/);
  assert.match(shell, /router\.push\('\/admin'\)/);
});

test('a product transition separates contact from the permanent newsletter signup', async () => {
  const landing = await readSource('../src/app/page.tsx');
  const contactIndex = landing.indexOf('<section id="contact"');
  const transitionIndex = landing.indexOf('<section id="built-for"');
  const newsletterIndex = landing.indexOf('<section id="newsletter"');
  const footerIndex = landing.indexOf('<footer');

  assert.ok(contactIndex >= 0);
  assert.ok(transitionIndex > contactIndex);
  assert.ok(newsletterIndex > transitionIndex);
  assert.ok(footerIndex > newsletterIndex);
  assert.match(landing, /One platform/);
  assert.match(landing, /Leagues & Tournaments/);
  assert.match(landing, /Sign up for our/);
  assert.match(landing, /Unsubscribe anytime/);
});

test('member feed mutations use the validated team feed endpoint', async () => {
  const feed = await readSource('../src/app/(dashboard)/feed/page.tsx');
  const route = await readSource('../src/app/api/teams/feed/action/route.ts');

  assert.match(feed, /fetch\('\/api\/teams\/feed\/action'/);
  assert.doesNotMatch(feed, /addDocumentNonBlocking|deleteDocumentNonBlocking|updateDoc\(ref/);
  for (const action of ['create-post', 'create-comment', 'delete-post', 'delete-comment', 'toggle-like', 'vote']) {
    assert.match(route, new RegExp(`'${action}'`));
  }
  assert.match(route, /getTeamAuthority/);
  assert.match(route, /parentPostingEnabled === true/);
  assert.match(route, /parentCommentsEnabled === true/);
});

test('team waiver signing is server-mediated for members and guardians', async () => {
  const provider = await readSource('../src/components/providers/team-provider.tsx');
  const route = await readSource('../src/app/api/teams/waivers/sign/route.ts');

  assert.match(provider, /fetch\('\/api\/teams\/waivers\/sign'/);
  assert.match(route, /isGuardian = memberData\.parentId === auth\.uid \|\| playerData\.parentId === auth\.uid/);
  assert.match(route, /memberData\.guardianIds/);
  assert.match(route, /playerData\.guardianIds/);
  assert.match(route, /transaction\.set\(signatureRef/);
  assert.match(route, /transaction\.update\(memberRef/);
  assert.match(route, /transaction\.set\(archiveRef/);
  assert.match(route, /transaction\.set\(protocolRef/);
  assert.match(route, /transaction\.update\(documentRef, \{ signatureCount: FieldValue\.increment\(1\) \}\)/);
});

test('league registration, assignment, and clone projections use trusted server routes', async () => {
  const publicAction = await readSource('../src/app/api/public/portals/action/route.ts');
  const provider = await readSource('../src/components/providers/team-provider.tsx');
  const assignments = await readSource('../src/app/api/leagues/assignments/route.ts');
  const registrationAdmin = await readSource('../src/app/(dashboard)/leagues/registration/[leagueId]/page.tsx');
  const team = await readSource('../src/app/(dashboard)/team/page.tsx');
  const leagues = await readSource('../src/app/(dashboard)/leagues/leagues-page-content.tsx');
  const clone = await readSource('../src/app/api/leagues/clone/route.ts');

  assert.match(publicAction, /const batch = adminDb\.batch\(\)/);
  assert.match(publicAction, /\[`teams\.\$\{recruitId\}`\]/);
  assert.match(publicAction, /memberTeamIds: FieldValue\.arrayUnion\(recruitId\)/);
  assert.match(publicAction, /\[`individualRecruits\.\$\{recruitId\}`\]/);
  assert.match(publicAction, /memberIndivIds: FieldValue\.arrayUnion\(recruitId\)/);
  assert.match(provider, /fetch\('\/api\/leagues\/assignments'/);
  assert.match(team, /fetch\(`\/api\/leagues\/assignments\?teamId=/);
  assert.match(assignments, /assigned_team_owner_id: ownerId/);
  assert.match(assignments, /getTeamAuthority\(teamId, auth\.uid, auth\.role\)/);
  assert.match(registrationAdmin, /inspectingEntry\?\.protocol_id === 'player_config'/);
  assert.match(registrationAdmin, /inspectingEntry\?\.protocol_id === 'individual_config'/);
  assert.match(registrationAdmin, /\{inspectingIndividualEntry && \([\s\S]*Assign to Team/);
  assert.match(leagues, /fetch\('\/api\/leagues\/clone'/);
  assert.match(clone, /batch\.create\(destination/);
  assert.match(leagues, /leagueTeams\.length < activeLeague\.requiredSquads/);
  assert.doesNotMatch(leagues, /leagueTeams\.length < leagueTeams\.length/);
});

test('league deletion cannot create replacement leagues or partially delete division workspaces', async () => {
  const leagues = await readSource('../src/app/(dashboard)/leagues/leagues-page-content.tsx');
  const schedule = await readSource('../src/app/api/leagues/schedule/route.ts');

  assert.match(leagues, /where\('creatorId', '==', authUser\.uid\)/);
  assert.match(leagues, /limit\(isSuperAdmin \? 100/);
  assert.doesNotMatch(leagues, /isSuperAdmin\)[\s\S]{0,120}orderBy\('createdAt', 'desc'\), limit\(50\)/);
  assert.match(leagues, /ids: items\.map\(item => item\.id\)/);
  assert.match(leagues, /leagueIds: pendingLeagueDeletion\.ids/);
  assert.match(leagues, /Delete League Permanently\?/);
  assert.match(leagues, /void confirmLeagueDeletion\(\)/);
  assert.doesNotMatch(leagues, /window\.confirm\(`Delete/);
  assert.match(schedule, /const leagues = await adminDb\.getAll\(\.\.\.leagueRefs\)/);
  assert.match(schedule, /Authorize the complete workspace before mutating any division/);
  assert.match(schedule, /collectionGroup\('events'\)\.where\('leagueId', '==', leagueId\)/);
  assert.match(schedule, /Promise\.all\(leagueIds\.map\(purgeLeagueProjectionsForDeletion\)\)/);
  assert.match(schedule, /collection\('publicLeagueViews'\)\.doc\(league\.id\)\.delete\(\)/);
  assert.match(schedule, /recursiveDelete\(league\.ref\)/);
  const indexes = await readSource('../firestore.indexes.json');
  assert.match(indexes, /"fieldPath": "sourceId"[\s\S]*"queryScope": "COLLECTION_GROUP"/);
  assert.doesNotMatch(schedule, /collection\('leagues'\)\.add\(/);
  assert.doesNotMatch(schedule, /collection\('leagues'\)\.doc\(\)\.create\(/);
});

test('School Hub administrators are invited, claimed, and revoked on the server', async () => {
  const club = await readSource('../src/app/(dashboard)/club/page.tsx');
  const provider = await readSource('../src/components/providers/team-provider.tsx');
  const route = await readSource('../src/app/api/schools/admins/route.ts');

  assert.match(club, /fetch\('\/api\/schools\/admins'/);
  assert.doesNotMatch(club, /collection\(db, 'users'\), where\('email'/);
  assert.match(provider, /method: 'PATCH'/);
  assert.match(provider, /fetch\('\/api\/schools\/admins'/);
  assert.match(provider, /firebaseUser\.isAnonymous/);
  assert.match(route, /schoolAdminIds: admin\.firestore\.FieldValue\.arrayUnion\(userId\)/);
  assert.match(route, /collection\('teamMemberships'\)\.doc\(teamRef\.id\)/);
  assert.match(route, /teamRef\.collection\('members'\)\.doc\(userId\)/);
  assert.match(route, /pendingAdminEmails: admin\.firestore\.FieldValue\.arrayRemove\(email\)/);
});

test('role-gated workflows match their secured routes', async () => {
  const provider = await readSource('../src/components/providers/team-provider.tsx');
  const roster = await readSource('../src/app/(dashboard)/roster/page.tsx');
  const chat = await readSource('../src/app/(dashboard)/chats/[chatId]/page.tsx');
  const fundraising = await readSource('../src/app/(dashboard)/fundraising/page.tsx');
  const facilities = await readSource('../src/app/(dashboard)/facilities/page.tsx');
  const signup = await readSource('../src/app/signup/page.tsx');

  assert.match(provider, /action: 'claim-assignment'/);
  assert.match(provider, /fetch\('\/api\/teams\/events\/action'/);
  assert.match(roster, /router\.push\(`\/chats\/\$\{chatId\}`\)/);
  assert.doesNotMatch(roster, /router\.push\(`\/messages/);
  assert.match(chat, /if \(!isStaff \|\| !newName\.trim\(\)/);
  assert.match(fundraising, /if \(!isStaff\)[\s\S]{0,180}<AccessRestricted/);
  assert.match(facilities, /activeTeam\.ownerUserId === firebaseUser\?\.uid/);
  assert.match(signup, /autoComplete="name"/);
  assert.match(signup, /autoComplete="email"/);
  assert.equal((signup.match(/autoComplete="new-password"/g) || []).length, 2);
});

test('staff authority uses the shared complete position vocabulary', async () => {
  const provider = await readSource('../src/components/providers/team-provider.tsx');
  const events = await readSource('../src/app/api/teams/events/action/route.ts');
  const rsvp = await readSource('../src/app/api/teams/rsvp/route.ts');
  const notifications = await readSource('../src/lib/notification-targets.ts');
  const positions = await readSource('../src/lib/staff-position.ts');

  for (const source of [provider, events, rsvp, notifications]) assert.match(source, /hasStaffRole/);
  for (const position of ['head coach', 'director of athletics', 'team representative', 'coach guest', 'team lead', 'platform admin']) {
    assert.match(positions, new RegExp(`'${position}'`));
  }
});

test('mobile Super Admin headers and newsletter sections stay inside the viewport', async () => {
  const [admin, newsletter] = await Promise.all([
    readSource('../src/app/admin/page.tsx'),
    readSource('../src/components/admin/newsletter-manager.tsx'),
  ]);

  assert.match(
    admin,
    /activeTab === 'bugs'[\s\S]*?flex flex-col sm:flex-row sm:items-center justify-between gap-4/,
  );
  assert.match(
    admin,
    /activeTab === 'bugs'[\s\S]*?flex flex-wrap items-center gap-3/,
  );
  assert.match(
    newsletter,
    /grid w-full grid-cols-1 sm:grid-cols-3 lg:w-auto/,
  );
});

test('event deletion requires an explicit event-named confirmation before mutation', async () => {
  const [source, confirmation] = await Promise.all([
    readSource('../src/app/(dashboard)/events/EventDetailDialog.tsx'),
    readSource('../src/components/events/EventDeleteConfirmation.tsx'),
  ]);

  assert.match(source, /<EventDeleteConfirmation event=\{event\} onDelete=\{onDelete\} \/>/);
  assert.match(confirmation, /useState\(false\)/);
  assert.match(confirmation, /Delete Activity\?/);
  assert.match(confirmation, /This will permanently delete \{event\.title\}/);
  assert.match(confirmation, /<AlertDialogCancel[^>]*>Cancel<\/AlertDialogCancel>/);
  assert.match(confirmation, /onDelete\(event\.id\)/);
  assert.doesNotMatch(confirmation, /aria-label=\{`Delete \$\{event\.title\}`\}[\s\S]{0,240}onClick=\{\(\) => onDelete\(event\.id\)\}/);
});
