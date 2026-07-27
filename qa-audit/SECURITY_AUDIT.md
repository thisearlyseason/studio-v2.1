# Security Audit

## SEC-001 — Public recruiting records expose private player data

- Severity: **Critical**
- Affected files: `firestore.rules:273-339`, `src/app/recruit/player/[playerId]/page.tsx`, `src/components/providers/team-provider.tsx` player/recruiting types.
- Attack path: enable `recruitingProfileEnabled` on any player, then anonymously read `players/{playerId}` and enumerate/read documents below `players/{playerId}/{subCollection}`. Firestore rules permit both. The public page directly queries player, recruiting profile, contact, metrics, stats, evaluations, and videos.
- Impact: disclosure of player/guardian identifiers, date of birth, invite metadata, recruiting contact details, evaluations, and any future player subcollection. This is especially serious for minors.
- Required fix: server-generate a dedicated public projection containing only reviewed recruiting fields; consume it through a public API or public projection collection; revoke anonymous reads from player records/subcollections; migrate and test before deployment.
- Regression test: emulator test as anonymous user is denied `players/*` and the private child contact document while the separate public API uses only whitelisted projection fields.
- Current status: **fixed and emulator-verified on the audit branch.** Public page reads were replaced with `/api/public/recruiting/[playerId]`, which builds a field-whitelisted payload; Firestore anonymous reads of player documents/subcollections are denied. Preview verification remains required.

## AUTH-001 — Guardian update authorization is inconsistent

- Severity: Medium
- Affected files: `firestore.rules:283-339`, child-management methods in `team-provider.tsx`.
- Attack path: a guardian creates a child using `parentId`, then attempts subsequent player/subcollection updates. Read/create/delete recognize the parent in places, but update uses player user ID/self/coach pathways and omits `resource.data.parentId == request.auth.uid`.
- Impact: legitimate guardian profile maintenance can fail; ad-hoc client fallbacks risk future insecure workarounds.
- Fix: add a minimally scoped parent update condition, preserve immutable ownership fields, and add emulator coverage.
- Status: fixed on the audit branch by allowing the existing `parentId` to authorize child updates and subcollection maintenance. Rules suite passes in the emulator; Preview verification remains required.

## DEP-001 — Vulnerable package versions

- Severity: Medium (fixed high findings; remaining moderate chain)
- Affected files: `package.json`, `package-lock.json`.
- Fix applied: Next.js 15.5.22, sharp 0.35.3, overrides for sharp 0.35.3 and fast-uri 4.1.1.
- Regression evidence: production audit now has 0 critical and 0 high findings; typecheck/tests/build pass.
- Remaining: npm reports moderate advisories through `@google/genai`/MCP/Hono; npm's offered fix is a breaking downgrade. Upgrade/vendor review is required before a future release.

## Observed controls

- Firebase ID tokens are cryptographically verified by Admin SDK for authenticated API routes.
- Stripe and Resend webhook routes verify signatures and use delivery/idempotency handling.
- Subscription seats are server reconciled; rules deny browser paid-plan field changes.
- JSON body size guards, validation, and rate limits protect most public/authenticated APIs.
- Storage is default-deny and restricts MIME/size for declared media paths.
- CSP, HSTS, frame, MIME-sniffing, referrer, and permissions headers are configured.

## Review limitations

No production account, database, deployment, browser farm, email inbox, Stripe test fixture, or FCM device was available. The Firebase Firestore/Storage rules emulator was run locally. Absence of findings outside this scope is not proof of absence.
