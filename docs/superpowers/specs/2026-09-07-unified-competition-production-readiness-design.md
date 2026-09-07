# Unified Competition Production-Readiness Design

**Date:** 2026-09-07  
**Status:** Approved in chat; awaiting written-spec review  
**Scope:** The seven unresolved launch-critical League and Tournament certification rows. Existing accepted Registration evidence remains authoritative unless an implementation change touches one of its seams.

## Goal

Make League and Tournament lifecycle, scheduling, assignment, officiating, scoring, disputes, and public standings safe and certifiable without redesigning their working UI. The result must preserve tenant isolation, enforce subscription and role boundaries on the server, make retries safe, prevent partial competition state, and expose only the data each public surface needs.

## Scope and Non-Goals

This design covers:

- League create, edit, clone, archive, and delete.
- League schedule generation/deployment and registration assignment.
- League scorekeeper and spectator flows.
- Tournament create, configure, replicate, archive, pools, brackets, referees, scoring, disputes, resolution, and public standings.
- Shared authorization, mutation locking, idempotency, audit records, and public projections used by those workflows.

This design does not introduce a new competition UI, change pricing, add a new payment processor, retest accepted features without an affected seam, or fix cosmetic issues. The accepted Registration waiver flow remains unchanged unless a required competition fix directly touches its event, registration-code, archive, bracket-lock, or public-projection boundary.

## Architecture

### 1. Server-owned competition lifecycle

League and Tournament lifecycle mutations move behind authenticated server routes. Each route must:

- Resolve the current actor, tenant membership, staff role, and plan entitlement.
- Revalidate those facts inside the committing transaction.
- Require a bounded request ID and canonical payload hash.
- Replay an identical request without duplicating records, and reject request-ID collisions.
- Validate topology, dates, format, division, quota, name uniqueness, and dependency rules.
- Commit lifecycle state and its immutable audit receipt atomically.
- Deny direct client creation, sensitive-field updates, and root deletion in Firestore rules.

Multi-division creation and replication use a server-owned operation record. Either every requested division/replica is committed, or the operation remains explicitly recoverable; it must never report complete while only part of the group exists.

Archive and delete are distinct. Archive revokes public and mutation access while retaining required audit/history. Delete is permitted only when dependency policy allows it and must reconcile projections, bookings, team events, registration state, agreements, and retained audit records transactionally or through an explicit recoverable operation.

### 2. Shared schedule mutation boundary

All schedule-affecting operations use the existing schedule service through one lock/version boundary:

- Configure and edit schedule-defining fields.
- Generate, deploy, append, clear, archive, and purge schedules.
- Accept or change league assignments.
- Seed pools and brackets.
- Add, remove, and assign referees.
- Record scores, corrections, disputes, and resolutions.

Every mutation rechecks current role, entitlement, event state, schedule version, and dependency state inside the transaction. A stale request returns a bounded conflict and does not partially clear or rewrite the schedule. Retry uses the same request identity and produces one canonical result.

Conflict validation uses actual game intervals and relevant cross-event obligations. Downstream bracket results lock incompatible upstream mutations. Assignment acceptance and schedule invalidation are one recoverable operation rather than a committed assignment followed by a best-effort clear.

### 3. Scoring, code, and dispute integrity

Scoring credentials are stored separately from member-readable League or Tournament documents. Public projections never contain them. Submitted credentials are checked against the current competition, current plan, active state, and current credential version inside the score transaction.

Score, correction, and dispute requests require a stable request ID. The server records canonical actor or code identity and never trusts a caller-supplied reporter name. Replays return the original result; collisions or stale/downstream-conflicting requests fail closed.

Disputes have an explicit state model and an organizer-only resolution route. A resolution records reason, resolver, timestamp, prior score, resulting score, bracket impact, and immutable audit identity. A generic score edit cannot silently erase a dispute.

### 4. Referee and assignment authority

Referee pool changes and game assignments are server-owned, transactional, and idempotent. The server validates current organizer authority, referee eligibility, exact event identity, game interval conflicts, cross-event conflicts, and current assignment version. Client-side stale arrays are projections only.

League registration assignment exposes a minimum staff DTO. Applicant responses and private contact data remain organizer-only except for the exact fields an assigned squad needs. Accept, reject, or revoke operations use canonical entry IDs and reconcile league, squad, team-event, notification, and schedule state together.

### 5. Purpose-specific public projections

Registration, scorekeeper, referee, spectator, and standings consumers receive separate allowlisted DTOs. They do not share a broad public competition object.

- Registration receives only published form, fee, payment instructions, and safe event metadata.
- Scorekeeper receives only the current game, allowed scoring state, and credential challenge metadata.
- Referee receives assigned games and non-sensitive scheduling details.
- Spectator/standings receives public schedule, scores, bracket, and dispute-status fields appropriate for display.

Missing creator, entitlement, active state, or projection version fails closed. Archive or deletion revokes public views. Projection workers use versioned, idempotent writes and record retryable operation state; local certification proves source behavior, while deployed worker delivery remains an explicit staging gate.

## Data and Compatibility

Existing records are handled through bounded server-side compatibility or migration logic. Legacy plaintext PINs are not exposed to members and are replaced by versioned credential records when used or edited. Legacy competition records may be read for migration, but unsafe direct-write paths are not retained.

Accepted Registration records, forms, fees, and waiver receipts keep their current canonical identities. Competition changes must use those existing APIs rather than duplicating registration or waiver logic.

## Error and Recovery Semantics

- `400`: invalid topology, field, date, score, or request shape.
- `401`: missing authentication where authentication is required.
- `403`: insufficient role, tenant, code, entitlement, or public state.
- `404`: competition or dependent object not found or not visible.
- `409`: stale version, duplicate name, request collision, capacity/conflict, downstream lock, or unsafe dependency.
- `5xx`: unexpected server/provider failure only; the operation remains retryable and must not claim success.

No destructive or externally visible operation reports success after a failed required reconciliation step. Recovery records are bounded, auditable, and removable after completion.

## Certification Strategy

Testing uses the existing frozen catalog and Playwright workflow. Add explicit case mappings and evidence handlers for:

1. `leagues-create-edit-clone-delete`
2. `leagues-schedule-generation-deployment`
3. `leagues-registration-assignment`
4. `leagues-scorekeeper-spectator`
5. `tournaments-create-configure-replicate-archive`
6. `tournaments-schedule-pools-brackets-referees`
7. `tournaments-scoring-dispute-public-standings`

For each row, prove the defined happy, negative, permission, persistence, API/network, console, and responsive cases with exact actors and run-owned objects. Concurrency tests cover duplicate lifecycle requests, quota/name races, schedule deploy races, assignment races, conflicting scores, score-versus-dispute, referee conflicts, and downstream locks.

Run isolated rows in dependency order, then one exact seven-row combined local certificate. Rerun only affected Registration, Facilities, Chat/Push, or public-projection seams. Final staging work repeats the seven rows on the exact deployed revision and proves worker/projection convergence; no local result substitutes for that external gate.

## Acceptance Criteria

- All seven frozen rows have exact, case-owned local evidence with no missing dimensions.
- Server authority and entitlement checks pass for correct roles and deny member, removed, foreign-tenant, stale, and forged actors.
- Lifecycle, scheduling, assignment, referee, score, dispute, and resolution operations are atomic or explicitly recoverable and idempotent.
- Sensitive codes, contacts, applicant answers, audit details, and private ledgers are not publicly or broadly member-readable.
- Public projections become unavailable after archive/delete and converge correctly after mutations.
- Desktop and critical mobile workflows pass with zero unexpected console or network errors.
- Cleanup reconciles every run-owned mutation with zero residuals.
- Focused tests, rules tests, type checking, lint, and production build pass before final release certification.
- Exact-revision staging, provider, worker, and physical-device obligations remain clearly blocked until genuinely observed.
