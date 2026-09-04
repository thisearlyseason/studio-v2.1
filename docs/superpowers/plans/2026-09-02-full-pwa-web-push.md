# Full PWA and Cross-Platform Push Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Make The Squad dashboard install with its Squad name and icon, and deliver channel-message notifications to Android FCM and iPhone/iPad Home Screen web apps.

**Architecture:** Device registration remains authenticated. A server-only service resolves enabled user devices and sends either FCM or standards Web Push. The chat route writes first and then queues delivery for other current channel members. The root app registers one worker that caches only public assets, not personalized dashboard content.

**Tech Stack:** Next.js 15, Firebase Admin/Firestore, Firebase Web Messaging, Push API, \`web-push@3.6.7\`, TypeScript, Node \`node:test\` with \`tsx\`.

**Spec:** \`docs/superpowers/specs/2026-09-02-full-pwa-web-push-design.md\`

## Global Constraints

- Never return, print, log, test-fixture, or document a token, endpoint, subscription key, VAPID private key, or deployment secret.
- Chat senders are never recipients. Every other chat recipient must be an active member.
- A send failure cannot roll back a stored chat message.
- Use separate FCM and standards Web Push VAPID credentials.
- Persist at most ten FCM and ten Web Push devices per account; remove a Web Push subscription only after a 404 or 410 provider response.
- Cache only public manifest/icon/offline resources. Do not cache dashboard HTML, API data, chats, roster, or schedules.
- Device checks happen on staging first, then with QA-only production messages.

---

## File Structure

- Create \`src/lib/web-push-subscription.ts\`: pure subscription normalization and endpoint hashing.
- Create \`src/lib/server-notification-delivery.ts\`: server-only FCM and Web Push fan-out.
- Create \`src/lib/client-push-registration.ts\`: FCM-first, Push API fallback registration.
- Create \`src/components/pwa/AppServiceWorkerRegistration.tsx\`: root worker registration.
- Modify \`src/app/api/notifications/device/route.ts\`: protected FCM and Web Push persistence.
- Modify \`src/app/api/notify/route.ts\` and \`src/app/api/teams/chat/message/route.ts\`: shared authorized delivery.
- Modify \`src/lib/fcm-client.ts\` and \`src/app/(dashboard)/settings/page.tsx\`: transport-neutral opt-in/out.
- Modify \`src/app/layout.tsx\`, \`public/manifest.json\`, and \`public/sw.js\`; create \`public/offline.html\`.
- Modify \`apphosting.yaml\`, \`scripts/check-production-env.mjs\`, and \`tests/production-environment.test.mjs\`.
- Create \`tests/web-push-subscription.test.mjs\`, \`tests/push-delivery.test.mjs\`, and \`tests/pwa-installability.test.mjs\`.

### Task 1: Validate standards Web Push subscriptions

**Files:**
- Create: \`src/lib/web-push-subscription.ts\`
- Create: \`tests/web-push-subscription.test.mjs\`

**Interfaces:**
- Produces \`WebPushSubscriptionRecord\`, \`normalizeWebPushSubscription(value)\`, and \`webPushSubscriptionId(subscription)\`.
- Consumed by the device route and the server sender.

- [ ] **Step 1: Write the failing test**

\`\`\`js
import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeWebPushSubscription, webPushSubscriptionId } from '../src/lib/web-push-subscription.ts';

const valid = {
  endpoint: 'https://push.example.test/subscription/abc',
  keys: { p256dh: 'a'.repeat(87), auth: 'b'.repeat(22) },
};

test('normalizes a bounded HTTPS web push subscription', () => {
  assert.deepEqual(normalizeWebPushSubscription(valid), valid);
  assert.match(webPushSubscriptionId(valid), /^[a-f0-9]{64}$/);
});

test('rejects a non-HTTPS or incomplete web push subscription', () => {
  assert.equal(normalizeWebPushSubscription({ ...valid, endpoint: 'http://push.example.test/x' }), null);
  assert.equal(normalizeWebPushSubscription({ endpoint: valid.endpoint, keys: { auth: valid.keys.auth } }), null);
});
\`\`\`

- [ ] **Step 2: Verify RED**

Run: \`node --import tsx --test tests/web-push-subscription.test.mjs\`

Expected: failure because \`src/lib/web-push-subscription.ts\` does not exist.

- [ ] **Step 3: Implement the minimal production interface**

\`\`\`ts
import { createHash } from 'node:crypto';

export type WebPushSubscriptionRecord = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

export function normalizeWebPushSubscription(value: unknown): WebPushSubscriptionRecord | null {
  // Require an HTTPS endpoint no longer than 4096 chars and non-empty
  // URL-safe p256dh/auth keys no longer than 512 chars.
}

export function webPushSubscriptionId(subscription: WebPushSubscriptionRecord): string {
  return createHash('sha256').update(subscription.endpoint).digest('hex');
}
\`\`\`

The implementation must return a new object containing only \`endpoint\`, \`keys.p256dh\`, and \`keys.auth\`; it must reject all extra transport fields.

- [ ] **Step 4: Verify GREEN**

Run: \`node --import tsx --test tests/web-push-subscription.test.mjs\`

Expected: 2 passing tests.

- [ ] **Step 5: Commit**

\`\`\`bash
git add src/lib/web-push-subscription.ts tests/web-push-subscription.test.mjs
git commit -m "feat: validate web push subscriptions"
\`\`\`

### Task 2: Protect registration and lifecycle of both device types

**Files:**
- Modify: \`src/app/api/notifications/device/route.ts\`
- Modify: \`tests/upcoming-event-reminders.test.mjs\`

**Interfaces:**
- Accepts exactly one of \`{ token: string }\` or \`{ subscription: WebPushSubscriptionRecord }\`.
- FCM remains in \`users/{uid}.fcmTokens\` and \`notificationDeviceTokens\`.
- Web Push uses \`users/{uid}.webPushSubscriptions\` and \`notificationWebPushSubscriptions\`, keyed by a hash of the endpoint.

- [ ] **Step 1: Write the failing regression**

\`\`\`js
test('protected device registration supports FCM and web push subscriptions', () => {
  const route = fs.readFileSync(new URL('../src/app/api/notifications/device/route.ts', import.meta.url), 'utf8');
  assert.match(route, /normalizeWebPushSubscription/);
  assert.match(route, /notificationWebPushSubscriptions/);
  assert.match(route, /webPushSubscriptions/);
  assert.match(route, /assertNonAnonymous/);
  assert.match(route, /MAX_DEVICES_PER_ACCOUNT = 10/);
});
\`\`\`

- [ ] **Step 2: Verify RED**

Run: \`node --import tsx --test tests/upcoming-event-reminders.test.mjs\`

Expected: failure at the missing \`normalizeWebPushSubscription\` assertion.

- [ ] **Step 3: Implement one-of transport registration**

\`\`\`ts
const { token, subscription } = await readJsonBodyWithLimit<{ token?: unknown; subscription?: unknown }>(req, 12_000);
const normalizedSubscription = normalizeWebPushSubscription(subscription);
if (validToken(token) === Boolean(normalizedSubscription)) {
  return NextResponse.json({ error: 'Submit one valid notification device.' }, { status: 400 });
}
\`\`\`

Keep the existing authenticated transaction and FCM ownership transfer. Add a Web Push transaction that replaces an identical endpoint, bounds the array to ten, transfers its endpoint hash from a former owner, and stores only \`{ userId, updatedAt }\` in the endpoint index. DELETE must remove only the specified FCM token or normalized Web Push endpoint.

- [ ] **Step 4: Verify GREEN**

Run: \`node --import tsx --test tests/web-push-subscription.test.mjs tests/upcoming-event-reminders.test.mjs\`

Expected: all tests pass without outputting device data.

- [ ] **Step 5: Commit**

\`\`\`bash
git add src/app/api/notifications/device/route.ts tests/upcoming-event-reminders.test.mjs
git commit -m "feat: register standards web push devices"
\`\`\`

### Task 3: Share notification delivery and notify chat members

**Files:**
- Create: \`src/lib/server-notification-delivery.ts\`
- Modify: \`src/app/api/notify/route.ts\`
- Modify: \`src/app/api/teams/chat/message/route.ts\`
- Create: \`tests/push-delivery.test.mjs\`
- Modify: \`tests/security-regressions.test.mjs\`
- Modify: \`package.json\`
- Modify: \`package-lock.json\`

**Interfaces:**
- Produces \`sendNotificationToUsers({ recipientUserIds, title, body, url, imageUrl })\`.
- The public API route must retain \`verifyFirebaseToken\`, staff authority, rate limiting, and active-membership checks.
- The chat route calls the sender only after the message and chat summary are stored.

- [ ] **Step 1: Write the failing delivery regression**

\`\`\`js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = path => readFile(new URL(path, import.meta.url), 'utf8');

test('team chat sends only to other channel members', async () => {
  const chat = await source('../src/app/api/teams/chat/message/route.ts');
  const sender = await source('../src/lib/server-notification-delivery.ts');
  assert.match(chat, /chatMembers\\.filter\\(memberId => memberId !== auth\\.uid\\)/);
  assert.match(chat, /void sendNotificationToUsers/);
  assert.match(sender, /sendEachForMulticast/);
  assert.match(sender, /webpush\\.sendNotification/);
});

test('notify route keeps authorization before shared delivery', async () => {
  const notify = await source('../src/app/api/notify/route.ts');
  assert.match(notify, /getTeamAuthority/);
  assert.match(notify, /findActiveTeamMember/);
  assert.match(notify, /sendNotificationToUsers/);
});
\`\`\`

- [ ] **Step 2: Verify RED**

Run: \`node --import tsx --test tests/push-delivery.test.mjs\`

Expected: failure because \`server-notification-delivery.ts\` is absent.

- [ ] **Step 3: Add the dependency and minimal shared sender**

Run: \`npm install web-push@3.6.7 && npm install --save-dev @types/web-push@3.6.4\`

The sender must:
1. Deduplicate user IDs and skip user documents with \`notificationsEnabled === false\`.
2. Send valid FCM tokens with \`admin.messaging().sendEachForMulticast\`.
3. Require \`WEB_PUSH_VAPID_SUBJECT\`, \`NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY\`, and \`WEB_PUSH_VAPID_PRIVATE_KEY\` before calling \`webpush.setVapidDetails\`.
4. Send the JSON payload \`{ webPush: { title, body, url, imageUrl } }\` only to normalized subscriptions.
5. Remove an endpoint only when \`webpush.sendNotification\` returns a 404 or 410.
6. Return counts by transport without exposing recipient identifiers.

Refactor \`/api/notify\` to call the sender after its current recipient authorization. In the chat route, after the Firestore writes, use:
\`\`\`ts
const recipients = chatMembers.filter(memberId => memberId !== auth.uid);
void sendNotificationToUsers({
  recipientUserIds: recipients,
  title: 'New message in Team Chat',
  body: content || (type === 'poll' ? 'New poll' : 'Shared an image'),
  url: '/chats/' + chatId,
}).catch(error => console.warn('[Chat Push] Delivery failed:', error instanceof Error ? error.message : 'unknown error'));
\`\`\`
Replace \`Team Chat\` with the channel name after coercing it to a bounded string.

- [ ] **Step 4: Verify GREEN**

Run: \`node --import tsx --test tests/push-delivery.test.mjs tests/security-regressions.test.mjs tests/upcoming-event-reminders.test.mjs\`

Expected: all tests pass; the original notify authorization checks remain present.

- [ ] **Step 5: Commit**

\`\`\`bash
git add package.json package-lock.json src/lib/server-notification-delivery.ts src/app/api/notify/route.ts src/app/api/teams/chat/message/route.ts tests/push-delivery.test.mjs tests/security-regressions.test.mjs
git commit -m "feat: deliver push notifications for team chat"
\`\`\`

### Task 4: Make the main dashboard a safe installable PWA and add Apple fallback registration

**Files:**
- Create: \`src/components/pwa/AppServiceWorkerRegistration.tsx\`
- Create: \`src/lib/client-push-registration.ts\`
- Modify: \`src/app/layout.tsx\`
- Modify: \`src/lib/fcm-client.ts\`
- Modify: \`src/app/(dashboard)/settings/page.tsx\`
- Modify: \`public/manifest.json\`
- Modify: \`public/sw.js\`
- Create: \`public/offline.html\`
- Create: \`tests/pwa-installability.test.mjs\`

**Interfaces:**
- Produces \`registerPrimaryServiceWorker()\` and \`registerPushDevice(userId)\`.
- Settings enables notifications only if that function returns \`'fcm'\` or \`'web-push'\`.
- The worker handles only marked \`webPush\` payloads in its generic push listener, avoiding duplicate FCM notifications.

- [ ] **Step 1: Write failing PWA tests**

\`\`\`js
test('root application registers The Squad service worker', async () => {
  const layout = await source('../src/app/layout.tsx');
  const registration = await source('../src/components/pwa/AppServiceWorkerRegistration.tsx');
  const manifest = JSON.parse(await source('../public/manifest.json'));
  assert.match(layout, /AppServiceWorkerRegistration/);
  assert.match(registration, /navigator\\.serviceWorker\\.register\\('\\/sw\\.js', \\{ scope: '\\/' \\}\\)/);
  assert.equal(manifest.name, 'The Squad');
  assert.equal(manifest.start_url, '/dashboard');
  assert.equal(manifest.id, '/');
  assert.equal(manifest.scope, '/');
});

test('worker never caches authenticated dashboard HTML', async () => {
  const worker = await source('../public/sw.js');
  assert.match(worker, /'\\/offline\\.html'/);
  assert.match(worker, /event\\.request\\.mode === 'navigate'/);
  assert.doesNotMatch(worker, /cache\\.addAll\\(\\[[^\\]]*'\\/dashboard'/);
  assert.match(worker, /payload\\?\\.webPush/);
  assert.match(worker, /messaging\\.onBackgroundMessage/);
});
\`\`\`

- [ ] **Step 2: Verify RED**

Run: \`node --import tsx --test tests/pwa-installability.test.mjs\`

Expected: failure because the component does not exist and the manifest lacks the primary-app fields.

- [ ] **Step 3: Implement root installation and offline behavior**

Create a client component that calls:
\`\`\`ts
void navigator.serviceWorker.register('/sw.js', { scope: '/' });
\`\`\`
once in a root \`useEffect\`, and render it from \`RootLayout\`.

Set manifest fields \`id: '/'\`, \`scope: '/'\`, and \`start_url: '/dashboard'\`; retain \`name: 'The Squad'\`, \`short_name: 'The Squad'\`, standalone display, and the current 192/512 icons. Add root \`appleWebApp\` metadata with \`capable: true\`, \`statusBarStyle: 'black-translucent'\`, and \`title: 'The Squad'\`.

Create a static \`offline.html\` saying “The Squad is offline” with a Retry button. The worker precaches only \`/offline.html\`, \`/manifest.json\`, \`/favicon-192.png\`, and \`/favicon-512.png\`. For navigation, it uses network first and returns the offline file only on failure. It must never add a dashboard/API response to Cache Storage.

Keep Firebase initialization and \`onBackgroundMessage\` in a guarded block. Add a generic \`push\` listener that returns unless parsed payload has \`webPush\`, then calls \`showNotification\` with the existing icon/badge and a relative URL. Keep one common notification-click handler.

- [ ] **Step 4: Implement client transport fallback**

\`\`\`ts
export async function registerPushDevice(userId: string): Promise<'fcm' | 'web-push' | null> {
  const fcmToken = await tryRegisterFcm(userId);
  if (fcmToken) return 'fcm';
  const registration = await registerPrimaryServiceWorker();
  if (!registration || !('PushManager' in window)) return null;
  if (await Notification.requestPermission() !== 'granted') return null;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: decodeVapidPublicKey(process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY),
  });
  await registerWebPushSubscription(userId, subscription.toJSON());
  return 'web-push';
}
\`\`\`

\`tryRegisterFcm\` must first await Firebase Messaging \`isSupported()\`; retain the current active-worker wait and FCM device API call. The fallback must POST only \`subscription.toJSON()\` through the authenticated device route. Settings replaces its direct \`initFCM\` call with \`registerPushDevice\`, and opt-out removes both FCM and Web Push records without logging identifiers.

- [ ] **Step 5: Verify GREEN**

Run: \`node --import tsx --test tests/pwa-installability.test.mjs tests/fcm-service-worker.test.mjs tests/upcoming-event-reminders.test.mjs && npm run typecheck\`

Expected: focused tests pass. Report, but do not suppress, any unrelated existing type errors.

- [ ] **Step 6: Commit**

\`\`\`bash
git add src/components/pwa/AppServiceWorkerRegistration.tsx src/lib/client-push-registration.ts src/app/layout.tsx src/lib/fcm-client.ts 'src/app/(dashboard)/settings/page.tsx' public/manifest.json public/sw.js public/offline.html tests/pwa-installability.test.mjs
git commit -m "feat: install the Squad dashboard as a PWA"
\`\`\`

### Task 5: Require deployment configuration and perform release checks

**Files:**
- Modify: \`apphosting.yaml\`
- Modify: \`scripts/check-production-env.mjs\`
- Modify: \`tests/production-environment.test.mjs\`
- Modify: \`docs/qa/production-audit/05-coverage-matrix.md\`
- Modify: \`docs/qa/production-audit/07-defect-ledger.md\`
- Modify: \`docs/qa/production-audit/08-final-report.md\`

**Interfaces:**
- Requires \`NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY\` at build/runtime.
- Requires \`WEB_PUSH_VAPID_PRIVATE_KEY\` and \`WEB_PUSH_VAPID_SUBJECT\` at runtime.

- [ ] **Step 1: Write the failing environment test**

\`\`\`js
test('production environment requires separate web push VAPID configuration', () => {
  const result = runChecker({
    NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY: '',
    WEB_PUSH_VAPID_PRIVATE_KEY: '',
    WEB_PUSH_VAPID_SUBJECT: '',
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY/);
  assert.match(result.stderr, /WEB_PUSH_VAPID_PRIVATE_KEY/);
  assert.match(result.stderr, /WEB_PUSH_VAPID_SUBJECT/);
});
\`\`\`

- [ ] **Step 2: Verify RED**

Run: \`node --test tests/production-environment.test.mjs\`

Expected: failure because the checker currently accepts a missing Web Push configuration.

- [ ] **Step 3: Implement configuration validation**

Add the three variables to the checker’s \`required\` array and valid local fixture. Declare the public key as an App Hosting secret at BUILD and RUNTIME; declare private key and subject as RUNTIME secrets. Do not add real values to source or test data.

Record the deployment sequence in the audit documents: configure distinct staging and production VAPID pairs through secret manager; test Android Chrome and iPhone/iPad Home Screen delivery using only QA recipients; record deployment IDs, pass/fail, and aggregate transport counts only.

- [ ] **Step 4: Verify all automated work**

Run: \`node --import tsx --test tests/web-push-subscription.test.mjs tests/push-delivery.test.mjs tests/pwa-installability.test.mjs tests/fcm-service-worker.test.mjs tests/upcoming-event-reminders.test.mjs tests/security-regressions.test.mjs tests/production-environment.test.mjs && npm run lint && npm run build && git diff --check\`

Expected: named tests, lint, build, and diff check pass.

- [ ] **Step 5: Verify physical devices**

1. Configure staging secrets through the secret manager without printing values.
2. Confirm staging manifest, worker, offline page, and two PNG icon URLs all return HTTP 200.
3. Remove the old Android Schedule shortcut, install The Squad from the staging dashboard, enable notifications, background the app, and send one QA chat message from another account. Confirm delivery and click-through.
4. Add the staging dashboard to the iPhone/iPad Home Screen, enable notifications from the installed app, background it, and send one QA chat message from another account. Confirm delivery and click-through.
5. Promote only if both staging checks pass. Repeat one QA-only test per transport on production.

- [ ] **Step 6: Commit**

\`\`\`bash
git add apphosting.yaml scripts/check-production-env.mjs tests/production-environment.test.mjs docs/qa/production-audit/05-coverage-matrix.md docs/qa/production-audit/07-defect-ledger.md docs/qa/production-audit/08-final-report.md
git commit -m "chore: require web push deployment configuration"
\`\`\`

## Plan Self-Review

- Task 1 validates untrusted subscriptions; Task 2 protects their persistence; Task 3 supplies unified FCM/Web Push and the missing chat send; Task 4 fixes installation identity and iPhone-compatible registration; Task 5 configures and proves release behavior.
- All interfaces are named before their consumers.
- No plan step stores dashboard data offline or exposes device identifiers.
