# Physical-device acceptance checklist

## Current remaining checks — September 12, 2026

Production revision: `6dd40e8f93ae374cf11be0c4615a79328938fa9d`.
The remaining hosted delegated-account checks have passed. Only the three
physical matrix rows remain open. Older sections below are historical evidence,
not instructions to restart all device testing. Keep every already documented
PASS unless a later relevant change affected it.

For each still-unverified subcheck, record Android/iPhone model, OS, browser,
installed app, PASS/FAIL and a screenshot. Open the installed app online first
so it can receive the deployed update. Do not uninstall or clear data just to
repeat an already verified installation.

1. **Installation, identity and update:** Confirm the primary installed app is
   named **The Squad**, uses the full-frame icon and opens its dashboard.
   If installing the optional Scheduler, confirm it is a separate secondary app
   opening `/schedule-app`; it must not replace or rename the primary app.
   For unverified update/offline cases, confirm the updated installation opens
   safely offline and never reveals the previous account's private content.
2. **Closed-app notifications and badges:** From another eligible team account,
   send one uniquely labelled message while the receiving installed app is
   closed normally (not Android's OS “Force stop”). Record card receipt,
   Android heads-up/dot or iPhone red badge, and correct chat tap-through as
   separate results. Confirm reading the chat clears/updates unread indicators.
   Preserve the prior opt-out, sender, wrong-team and account-switch passes.
3. **Game-Day Reminder:** As an athlete/parent recipient, enable both Tactical
   Alerts and Game-Day Reminders. Create a unique event for today in the team
   timezone, starting at least 30 minutes ahead and after 06:00 local time.
   Close the recipient app and allow a full 15-minute scheduler interval.
   Record the scheduled reminder (not the immediate event-created alert),
   correct event/team and tap destination. Then turn only Game-Day Reminders
   off and create a second eligible event. Confirm no scheduled reminder after
   a full interval; an immediate Tactical Alert is a different notification.

For any remaining multi-device, reinstall, or service-worker update subcheck
below without platform-specific evidence, record it separately. A generic
“worked” does not establish every item. No browser or server test can observe
the phone's launcher, OS notification presentation or physical receipt remotely.

Date prepared: 2026-09-08

This checklist contains only observations that Playwright, desktop browser
emulation, provider acceptance, and service-worker unit tests cannot prove.
Those automated checks remain useful prerequisites, but they are not substitutes
for native launcher, operating-system notification, and installed-PWA behavior on
real hardware.

For every run, record the device model, OS version, browser version, installed
application revision/health value, public alias, expected result, observed result,
and a screenshot or short screen recording. Do not record notification tokens,
private message bodies, passwords, or provider secrets.

## Android Chrome installed PWA

- [ ] Remove the existing installed PWA and clear The Squad site data, then install
  again from the intended production alias.
- [ ] Confirm the launcher label is **The Squad**, the adaptive icon fills the
  launcher mask without a white inset box, launch opens `/dashboard`, and the app
  runs without browser chrome.
- [ ] Deny notification permission once. Confirm no notification subscription is
  registered and the product explains how to enable it without looping prompts.
- [ ] Enable Tactical Alerts and Android notification permission. Confirm the
  registration survives fully closing and reopening the PWA.
- [ ] Send a message from a different eligible squad account while the recipient
  PWA is foregrounded, backgrounded, and force-closed. In each applicable state,
  confirm one card, one audible/vibration event according to device settings, and
  one persisted chat message rather than duplicate delivery.
- [ ] With the PWA closed, confirm the launcher dot/badge appears when supported by
  the installed launcher and notification channel. Record launcher and channel
  settings if it does not.
- [ ] Tap the closed-app notification and confirm it opens the intended squad and
  exact chat, then clears or updates unread state consistently.
- [ ] Turn Tactical Alerts off, close the PWA, send another eligible message, and
  confirm no card, sound, dot, or cross-account delivery occurs.
- [ ] Re-enable alerts and confirm the sender does not receive their own push, a
  removed member receives nothing, and a user from another squad receives nothing.
- [ ] Sign out of account A, sign into account B on the same installed PWA, close
  it, and confirm account A notifications and private cached content never appear.
- [ ] Register the same recipient on two physical devices, then confirm the intended
  multi-device delivery policy and no duplicate notification on either device.
- [ ] Create an eligible same-day event in the account timezone and observe the
  scheduled reminder on the closed device. Confirm exactly one reminder, correct
  event/team text, and correct tap destination. Repeat the scheduler window and
  confirm no duplicate; confirm preference-off, removed-member, invalid-time, and
  no-token recipients receive nothing.
- [ ] Uninstall/reinstall or clear site data after registration, then confirm stale
  subscriptions are retired and the newly enabled subscription alone receives.
- [ ] Install an update over an older service-worker version. Confirm the new worker
  activates, old caches disappear, and offline launch exposes only the public
  offline shell—not a prior user's dashboard, chat, roster, or family data.
- [ ] After logout/uninstall, confirm no stale The Squad notification remains and a
  later test send cannot reach the retired installation.

## iPhone and iPad Safari installed web app

- [ ] On at least one current iPhone and one supported iPad, clear site data and
  use Safari **Add to Home Screen** from the intended production alias.
- [ ] Confirm the home-screen label is **The Squad**, the icon is full-frame, launch
  opens `/dashboard`, and the installed app runs in standalone mode.
- [ ] Deny notifications once, then enable them from the installed web app. Confirm
  permission guidance is correct and registration survives a full app close.
- [ ] Send from a different eligible account while the recipient app is foregrounded,
  backgrounded, and fully closed. Confirm the expected single notification and one
  persisted chat message in each applicable state.
- [ ] Tap a closed-app notification and confirm the intended squad and exact chat
  opens, with correct unread-state reconciliation.
- [ ] Disable Tactical Alerts and confirm no card, sound, badge, or delivery; then
  re-enable and confirm normal delivery resumes.
- [ ] Confirm sender, removed-member, and other-squad exclusions on the device.
- [ ] Create an eligible same-day event in the account timezone and observe the
  scheduled reminder while the installed app is closed. Confirm one reminder and
  correct tap destination; confirm duplicate-run, preference-off, removed-member,
  invalid-time, and no-token exclusions physically suppress delivery.
- [ ] Sign out account A and sign in account B on the same installation. Confirm no
  account A notification or cached private content appears afterward.
- [ ] Remove/reinstall the home-screen app and confirm stale subscription cleanup,
  correct icon/name/start route, and successful opt-in from the clean installation.
- [ ] Update across a service-worker release and test offline launch. Confirm only
  the public offline shell is available and no prior private data is rendered.
- [ ] After logout/removal, confirm no stale notifications remain and later sends do
  not reach the retired installation.

## Recorded owner acceptance and remaining retest — 2026-09-08

Device supplied: Pixel 8, Android 16, Chrome version not recorded. The product
owner reported the following completed checks; they do not need to be repeated
unless a later notification-lifecycle change directly affects them:

- Tactical Alerts opt-out: PASS.
- Sender exclusion: PASS.
- Wrong-team exclusion: PASS.
- Same-installation account switch: PASS.
- iPhone notification receipt and presentation for the tested path: PASS.

The Android notification reached the notification drawer but did not show a
heads-up popup or launcher dot. Provider/device delivery therefore succeeded;
heads-up presentation and dots remain dependent on the Android notification
category and Pixel Launcher settings. After production deployment
`dpl_1LAFSxMHPom51NCMuwKX8N7FBeVS`, confirm that the installed site's
notification category is **Alerting**, **Pop on screen** is enabled, and Pixel
Launcher notification dots are enabled before repeating tap-through.

The removed-member entitlement observation exposed an application projection
defect. Candidate `0ed01e5a` now excludes removed/deleted memberships from team
and paid-feature projection, and its regression test passes. One physical/UI
recheck remains: remove a non-paying member, sign in or reload as that member,
and confirm the prior squad and its Pro-only access are absent.

The reported reminder test used a September 10 event on September 8, so it was
not a same-day scheduler test and cannot determine R1 or R2. For the final R1
check, use an active parent, adult-player, or youth-player recipient with Game-Day
Reminders and Tactical Alerts enabled; create a unique event for **today** in the
team timezone, at least 20 minutes in the future and after 06:00 local time; fully
close the PWA and wait up to 15 minutes. For R2, turn only Game-Day Reminders off,
create a second unique eligible same-day event, and wait another scheduler cycle.
The immediate event-created Tactical Alert is separate from the scheduled
Game-Day Reminder and must not be counted as an R2 failure.

All broader iPhone/iPad installation, update, offline-shell, logout/cache, and
multi-state notification checks above remain required if full cross-platform
physical certification is the release standard.

## Acceptance boundary

The Push and PWA/offline matrix rows remain physical-device pending until every
applicable item above has recorded evidence. WebKit emulation, Android viewport
emulation, an HTTP 201 from a push provider, or a synthetic service-worker `push`
event must not be recorded as physical-device acceptance.

## Owner device results and read-only diagnosis — 2026-09-09

This section supersedes earlier pending/pass assumptions only for the dimensions
below. It records owner observations, not automated physical-device execution.
The owner used Safari on iPhone and Chrome on Android; exact models and OS/browser
versions were not supplied for this run. Production health at 18:18:54 UTC served
revision `423e871b40a56fa1bd99a34867bc9408bdea0428`.

| Checklist test | Owner observation | Reconciled status |
| --- | --- | --- |
| 1 installation | iPhone PASS. Android displayed Install, then Installing, possibly Installed, but no app icon appeared after about 15 minutes. | iPhone owner PASS; Android reported FAIL, pending app-drawer versus installation diagnosis. |
| 2 notifications | iPhone popup PASS, home-screen red badge absent despite enabled settings. Android unavailable. | iPhone receipt owner PASS; iPhone app badge FAIL; Android BLOCKED by installation. |
| 3 Android presentation | Could not test because the installation could not be found. | BLOCKED by test 1, not a separate demonstrated push-delivery failure. |
| 4 removal protection | PASS. | Owner PASS for the tested device/path; platform not specified. |
| 5 reminder enabled | No reminder for City Central United, Tigers Game, recipient athlete. | Reported failure under investigation; distinguish an elapsed scheduler cycle from waiting before the first eligible run. |
| 6 reminder disabled | Toggle works, but delivery did not work when enabled. | BLOCKED: this does not establish preference-off suppression. |
| 7 logout/offline privacy | PASS. | Owner PASS for the tested device/path; platform not specified. |
| 8 multiple devices/update/reinstall | PASS. | Retain owner report, but platform and individual subchecks need clarification; cannot certify Android reinstall while test 1 is failing. |

Read-only findings:

- The deployed worker displays a notification and sets the notification's small
  image via `badge`, but neither the worker nor application calls `setAppBadge`
  or `clearAppBadge`. A synthetic push against the current worker recorded one
  `showNotification` call and zero app-badge calls. This reproduces the missing
  application integration, not a physical badge PASS. WebKit requires the Badging
  API for this distinct home-screen indicator:
  https://webkit.org/blog/14112/badging-for-home-screen-web-apps/.
- Production reminder scheduling is ENABLED every 15 minutes. The latest run
  initially inspected was 18:07:21 UTC, with zero reminders sent and zero failures.
  The matching `Tigers game` event was created at 18:09:40 UTC on September 9,
  after that run; its stored date is `2026-09-09` and start time is `15:09`.
  Team timezone is absent, so the implementation uses America/Edmonton. Matching
  active athlete profiles have both preferences enabled and registered Web Push
  subscriptions. Delivery-ledger entries were absent at 18:20 UTC, before the
  next expected scheduler run around 18:22 UTC. No reminder was manually sent or
  scheduler triggered, and no customer account/event data was changed.

Full physical certification remains incomplete. Retain unrelated established
passes; do not ask the owner to repeat the complete audit.

### First eligible scheduler run — confirmed failure

At 18:22:21 UTC the normal production scheduler ran without manual intervention.
Its 18:22:23 summary reported zero sent and six failures. The exact Tigers game
ledger entries for the matching coach and two adult-player profiles each showed
`status: failed`, `attempts: 1`, and `No registered device accepted the reminder.`
Thus test 5 is now a confirmed FAIL, not merely a pending scheduler interval.

Read-only deployed Function inspection found none of
`WEB_PUSH_VAPID_SUBJECT`, `NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY`, or
`WEB_PUSH_VAPID_PRIVATE_KEY` in its environment, and no secret environment
bindings. `reminderWebPushConfiguration()` therefore returns null and
`sendReminderWebPush()` reports every registered subscription as failed before
attempting delivery. No secret values were printed or changed. Repair must bind
the correct existing production push configuration to the scheduled Function;
do not rotate the public/private key pair and invalidate working subscriptions.

The owner clarified that the iPhone symptom is the red home-screen badge. Android
showed Installing and possibly Installed; checking the launcher app drawer for
The Squad or the legacy Schedule label is still needed to isolate native
installation failure from a missing home-screen shortcut.
# Approved repair follow-up — 2026-09-09

- Badge code and race-condition regressions are repaired locally; wait for the
  production release confirmation before repeating the iPhone badge check. Open
  the installed app online to update it, then background it, send from a different
  account, and verify the card, red badge, and chat tap-through. Check that reading
  the matching chat or signing out clears the remaining card/badge.
- Do not repeat the reminder test yet. Production's original private VAPID key
  must be securely restored to the Function environment and provider delivery
  verified first. The repair deliberately preserves existing push registrations.
- Android: search the app drawer for **The Squad** and **Schedule**. Report whether
  either opens the installed app. Manifest/browser checks cannot determine whether
  Android completed installation or merely omitted a home-screen shortcut.

## Production repair deployed — 2026-09-09

- The badge repair is live on both production aliases.
- The original VAPID private key was unavailable, so the owner approved a matched
  production-key rotation. Both providers and ACTIVE reminder Function revision
  `sendupcomingeventreminders-00007-mox` now use the validated pair; deployed
  secret-binding verification passed in workflow `34393784014`.
- Before testing, open each installed app online for at least 15 seconds while
  signed in and notifications enabled. This replaces its old PushSubscription.
- Then repeat only: iPhone notification card + red icon badge + tap-through;
  same-day eligible reminder receipt; reminders-off suppression; and the unresolved
  Android install/presentation path. Do not repeat prior targeting/privacy passes.
- Athlete subscription renewal was observed at 19:36:57 UTC. The normal 19:37
  scheduler recorded one provider success for the exact Tigers game. Record the
  owner's physical card/tap result before closing R1; provider acceptance alone
  is insufficient. Two stale recipient subscriptions remained failed as expected.
