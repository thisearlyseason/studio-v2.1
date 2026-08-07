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
  const route = await readSource('../src/app/api/teams/join/route.ts');
  assert.match(route, /export async function GET/);
  assert.match(route, /enforceUserRateLimit/);
  assert.match(route, /readJsonBodyWithLimit/);
  assert.match(page, /Join \{invitePreview\?\.teamName/);
  assert.match(page, /'Join Squad'/);
  assert.match(page, /<AlertDialog/);
});

test('demo batches stay below the rules-engine access-call ceiling', async () => {
  const source = await readSource('../src/lib/db-seeder.ts');
  assert.match(source, /CHUNK_SIZE = 5/);
  assert.match(source, /transientCodes/);
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

  assert.match(login, /browserPopupRedirectResolver/);
  assert.match(login, /signInWithPopup\(auth, provider, browserPopupRedirectResolver\)/);
  assert.match(nextConfig, /script-src[^\n]*https:\/\/apis\.google\.com/);
  assert.match(nextConfig, /frame-src[^\n]*https:\/\/\*\.firebaseapp\.com/);
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
  assert.match(club, /isDemo=\{user\.isDemo === true\}/);
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

  assert.equal(parentArticles.length, 20);
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
