# Full PWA and Cross-Platform Push Repair

## Goal

Deliver chat notifications to eligible channel members, make the primary Squad
dashboard install consistently as **The Squad** on Android and iPhone, and add
standards-based web push for iPhone/iPad Home Screen apps while retaining the
existing Firebase Cloud Messaging (FCM) delivery path for Chrome/Android.

## Evidence and constraints

- A posted chat message currently reaches `POST /api/teams/chat/message`, is
  written to Firestore, and returns without any notification dispatch. The
  Android test therefore could not produce a push.
- The production manifest contains the correct name and PNG icons, but service
  worker registration happens only on `/schedule-app` or when a user enables
  notifications. `/schedule-app` also supplies the `Squad Schedule` title.
  This can produce a Schedule shortcut rather than an installed Squad app.
- Firebase's JavaScript Cloud Messaging support matrix does not include iOS
  Safari. iOS/iPadOS Home Screen apps support standards-based Web Push, so
  Apple delivery requires a separate Web Push subscription and sending path.
- Notification sending remains server-authoritative. Clients never receive
  another member's FCM token or web-push subscription.

## Design

### 1. Channel-message delivery

After a chat message is successfully persisted, the chat route will build the
recipient set from that channel's active member IDs, exclude the authenticated
sender, and enqueue a best-effort notification. A delivery failure is logged
but does not turn a successfully saved message into a failed chat request.

The delivery implementation will move the user-ID-to-device resolution and
send mechanics out of the HTTP route into a server-only service. The existing
`/api/notify` authorization and team-membership checks remain intact; both
routes will share the same sender service rather than call an internal HTTP
endpoint or expose an internal secret.

### 2. Primary-app installation

The root application will register the existing service worker at scope `/`.
The manifest will identify the primary app as The Squad, give it an explicit
stable ID and scope, and start an installed session at `/dashboard`. Root
metadata will include the equivalent Apple Home Screen name and capability.

The worker will precache only public, non-personalized shell assets, the
manifest, and the icon assets. It will use an offline fallback for navigation
without caching authenticated dashboard HTML or user data. The existing
schedule page remains available, but no longer owns the app's installation
identity.

Existing Android Schedule shortcuts must be removed and The Squad reinstalled
after release so the launcher replaces the stale shortcut name and icon.

### 3. Apple standards Web Push

A client notification-registration layer will choose FCM where the Firebase
web SDK supports it, then fall back to the browser Push API where FCM does not.
For an iPhone/iPad, registration is available only from the installed Home
Screen app and after the user grants notification permission.

The fallback stores a bounded, de-duplicated Web Push subscription for the
signed-in user through the existing authenticated device-registration route.
It stores the endpoint and public subscription keys only; private VAPID
material never reaches the browser or Firestore.

The server notification service will send to both registered FCM tokens and
Web Push subscriptions. Standard Web Push uses a dedicated VAPID key pair held
in the deployment secret manager. Expired or invalid subscriptions are removed
from the corresponding user record. The existing FCM VAPID configuration stays
separate because its private key is not available to this service.

The service worker will retain Firebase background-message handling and add a
clearly marked standards Web Push handler. Only payloads with the Web Push
marker are handled by that new listener, preventing duplicate FCM
notifications. Both transports use the same visible Squad title, icon, badge,
and click-through handling.

## Security and privacy

- Recipient membership and staff authority are checked before any send.
- The chat sender is never notified about their own message.
- Tokens and subscription keys are never returned by notification APIs, logged,
  included in tests, or copied to audit documents.
- Device registration is authenticated and bounded per user to limit stale
  device accumulation.
- The full-dashboard worker never caches personalized responses.

## Verification

1. Add tests showing that a channel message targets active recipients but not
   its author, and that a downstream send error does not lose the message.
2. Add tests for device-subscription validation, deduplication, and removal of
   invalid Web Push subscriptions.
3. Add regression coverage for root worker registration, The Squad manifest
   identity, and absence of `/schedule-app` as the installed-app start URL.
4. Run focused notification/security tests, the repository audit regressions,
   type/lint checks relevant to touched files, and a production build.
5. Deploy to staging with test VAPID credentials. Verify one Android Chrome
   background chat push and one iPhone/iPad Home Screen background chat push.
6. Promote only after those device results pass, then re-run the same bounded
   live checks with a QA-only message.

## Non-goals

- No native App Store or Play Store binary.
- No notification for a channel member who has disabled notifications or has
  no valid registered device.
- No caching of roster, chat, schedule, or other authenticated dashboard data
  for offline use in this repair.
