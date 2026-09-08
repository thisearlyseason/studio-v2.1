# Physical-device acceptance checklist

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
- [ ] Sign out account A and sign in account B on the same installation. Confirm no
  account A notification or cached private content appears afterward.
- [ ] Remove/reinstall the home-screen app and confirm stale subscription cleanup,
  correct icon/name/start route, and successful opt-in from the clean installation.
- [ ] Update across a service-worker release and test offline launch. Confirm only
  the public offline shell is available and no prior private data is rendered.
- [ ] After logout/removal, confirm no stale notifications remain and later sends do
  not reach the retired installation.

## Acceptance boundary

The Push and PWA/offline matrix rows remain physical-device pending until every
applicable item above has recorded evidence. WebKit emulation, Android viewport
emulation, an HTTP 201 from a push provider, or a synthetic service-worker `push`
event must not be recorded as physical-device acceptance.
