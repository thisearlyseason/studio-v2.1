# Defect Ledger

**Run:** `2026-08-21T232919Z`  
**Environment:** local development plus isolated Firebase preview  
**Status:** Phase 2 findings followed up through 2026-09-08. BUG-052 is exact-production verified; all implementation defects are resolved and BUG-011 is retired by product decision. BUG-005 has physical Android closed-app push, tap-through, launcher-dot, and adaptive-icon acceptance; its broader negative-case and iPhone/iPad certification requirements remain blocked in the coverage matrix. Provider evidence and deterministic emulator evidence are recorded separately from the still-incomplete coverage matrix.

## BUG-052 — Logout can retain the prior account's push endpoint

| Field | Evidence |
|---|---|
| Severity | P1 HIGH |
| Feature | Authentication and Push — logout/user switching |
| Reproduction | Code-path review showed the primary Shell logout never removed the current browser subscription. Settings started removal without awaiting it and immediately cleared the authenticated session. |
| Root cause | Push deletion requires the still-authenticated Firebase user, but the two visible logout surfaces either skipped it or raced it against session clearing. The shared deletion helper also ignored legacy-token cleanup failure. A later account on the same installed PWA could therefore retain an endpoint owned by the prior account. |
| Repair | Registered-account logout surfaces now await complete legacy and Web Push teardown before clearing the browser session or signing out. Anonymous demos skip the registered-only device endpoint and proceed directly through authoritative demo cleanup. Any registered teardown failure leaves the user authenticated so the endpoint cannot silently outlive its authority. |
| Verification | Test-first regressions failed on the missing Shell import, Settings fire-and-forget behavior, ignored legacy cleanup, and the anonymous-demo 403 discovered on the first exact deployment. The affected pack passes 21/21, typecheck passes, and scoped lint reports zero errors. Release gate `34192250393` passed and production deployment `dpl_4KWviEUxxuYtFtDSWXe1v7w9t6pM` serves merge `c5d1a97f`. Fresh production Playwright launched a Starter demo, returned HTTP 204 from `/api/demo/exit`, reached `/login`, made no rejected notification-device request, and recorded zero console errors. Physical registered-account A-to-B endpoint isolation remains a coverage requirement, not an open implementation defect. |
| Status | RESOLVED AND EXACT-PRODUCTION VERIFIED |

## BUG-051 — Demo logout emits permission errors while revoking an anonymous workspace

| Field | Evidence |
|---|---|
| Severity | P2 MEDIUM |
| Feature | Demo lifecycle — logout and cleanup |
| Reproduction | Production Player and Parent demo logout reached `/login`, but household event/game listeners logged `Missing or insufficient permissions` after server cleanup revoked the anonymous identity and before client sign-out completed. |
| Root cause | The destructive cleanup request ran before client sign-out without marking the expected listener-teardown interval. The listeners therefore treated the deliberate permission loss as an application fault. |
| Repair | Demo logout now sets the existing teardown marker before cleanup, retains it through awaited client sign-out, removes it in `finally`, and suppresses only anonymous household-listener permission callbacks during that marked interval. |
| Verification | Regression tests first failed on the missing marker/guards. The focused tests, 1,306-test application suite, typecheck, lint with zero errors, production build, Functions build, release gate `34188664839`, and independent code review passed. On exact production merge `d9ca82cf`, fresh Playwright launched the Player demo, rendered `Strikers • adult player`, returned HTTP 204 from `/api/demo/exit`, reached `/login`, and recorded zero console errors after the cleanup/sign-out transition. |
| Status | RESOLVED AND EXACT-PRODUCTION VERIFIED |

## BUG-050 — Youth invitation reports success without delivering the activation email

| Field | Evidence |
|---|---|
| Severity | P1 HIGH |
| Feature | Family — enable youth login |
| Reproduction | The authenticated create route persisted a token and the Family UI displayed a success state, but no outbound provider call existed. The athlete therefore had no activation link. |
| Root cause | `POST /api/invites/youth` implemented invitation storage only; the success copy incorrectly implied that copying the token manually was the complete workflow. |
| Repair | The route now sends a branded single-use activation link through Resend using a transactional pending/delivered state machine. Exact retries resume the same pending token, explicit provider rejection restores the predecessor, ambiguous transport failure remains safely resumable, expired pending state rotates cleanly, and redemption accepts only the exact current usable token. Subject data is CR/LF-sanitized. |
| Verification | Focused invitation regressions and independent review passed. Exact staging run `email-cert-1788840993477` observed delivered verification mail for five account roles, a delivered youth invitation, one successful redemption, reuse denial, session revocation, reset neutrality, signed Resend replay isolation, and zero residue across 25 checked paths. |
| Status | RESOLVED AND EXACT-STAGING VERIFIED |

## BUG-049 — Checkout idempotency aliases different billing resources

| Field | Evidence |
|---|---|
| Severity | P1 HIGH |
| Feature | Billing — checkout, upgrade, add-ons and subscription recovery |
| Reproduction | Concurrent checkout retries for different customer/subscription resources could reuse the same idempotency identity because resource identity was omitted from the policy key. |
| Root cause | The checkout idempotency contract scoped plan/cycle/team operations but not the Stripe customer/subscription identity that made the mutation unique. |
| Repair | Checkout policy and every caller now include the authoritative billing resource identity; exact retries remain idempotent while competing resources return the intended conflict. |
| Verification | Focused policy regressions passed. Exact staging run `commerce-cert-1788840993485` covered all eight plan/cycle checkouts, negative and cross-user cases, strict same-session 200/409 concurrency, trial, upgrade/add-ons, cancel/reactivate, portal, cancellation revoke, deleted-customer recovery and zero residue. Test-clock run `commerce-cert-clock-1788835545218` proved trialing to past-due to active recovery plus downgrade, interval change and add-on removal. |
| Status | RESOLVED AND EXACT-STAGING VERIFIED |

## BUG-048 — Scheduled account purge cannot execute its production queries

| Field | Evidence |
|---|---|
| Severity | P1 HIGH |
| Feature | Background jobs — account purge and reminder retry |
| Reproduction | The deployed purge encountered missing collection-group indexes for access redemptions, messages and team memberships, then reached an unexecutable dynamic-UID map query. |
| Root cause | Local emulator coverage did not require the deployed composite indexes, and purge enumeration modeled arbitrary map keys as a Firestore queryable field. |
| Repair | Required collection-group indexes were added and each scheduled batch now paginates shared collection-group scans in 500-document pages, retains only documents containing a pending UID key, and fails an affected request before deletion if its scan target fails. |
| Verification | Focused scheduler tests and Functions build passed; indexes and Functions deployed. Exact run `sched-cert-20260908-0416` proved successful purge, owner protection, reminder failure/retry with attempt count two, anonymous expiry, registered-live exclusion, and zero owned residue across 15 cleanup paths. |
| Status | RESOLVED AND EXACT-STAGING VERIFIED |

## BUG-047 — Client demo seed writes server-protected tournament events

| Field | Evidence |
|---|---|
| Severity | P1 HIGH |
| Feature | Demo — protected tournament bootstrap |
| Reproduction | After BUG-046 allowed both children to persist on staging revision `studio-build-2026-09-08-003`, the Parent Family page rendered but Playwright captured three deterministic Firestore permission errors and two retries. Each first failure began with the client-created `tourn_{teamId}_demo` event; retries then also encountered time-varying existing event updates. |
| Root cause | The legacy client seeder still attempted to create tournament lifecycle records even though production rules correctly reserve those records for authenticated server actions. The server bootstrap seeded tournaments only for Elite plans, leaving Parent and other demo shells on the forbidden path. |
| Repair | The authenticated `/api/demo/seed` bootstrap now creates the protected tournament blueprint for every non-institution demo squad. The client-side tournament generator/write was removed; ordinary league games and practices remain client-seeded under the isolated demo-owner rule. |
| Verification | A red test proved Parent server bootstrap had no tournament, then 9/9 focused demo-route tests passed with a server-owned tournament for both Parent squads and a source boundary excluding the forbidden client write. Type checking passed and scoped lint reported zero errors. On exact SHA `fb0f0ca6bdb1c4307bb58538a3dfcd824aec8558`, staging revision `studio-build-2026-09-08-004`, fresh Parent, Starter, Elite, and School Playwright sessions all completed bootstrap, reached their expected dashboards at 390 or 1440 CSS pixels, showed no Sync Failed/loading state, and reported zero console errors or warnings. |
| Status | RESOLVED AND EXACT-STAGING VERIFIED |

## BUG-046 — Parent demo youth records use rule-invalid null login identities

| Field | Evidence |
|---|---|
| Severity | P1 HIGH |
| Feature | Demo — Parent workspace seed and Family landing |
| Reproduction | On exact staging revision `studio-build-2026-09-08-002` for application SHA `8b6a3e9237267bbfcc7ad235a0dbed50e29f10c4`, a fresh 390x844 Playwright Parent Demo session reached `/family` but remained on “Building Demo Environment”. The final five-write chunk failed twice with Firestore permission errors for both player records, both team-member projections, and the first household payment. |
| Root cause | Accountless youth records explicitly stored `userId: null`. Firestore player-create policy intentionally accepts only the authenticated player's UID or an absent/empty `userId`; `null` is neither, so the atomic chunk failed before the family data could exist. |
| Repair | The shared accountless-youth helper now omits `userId` entirely and includes `pendingInviteEmail` only for an actual pending invitation. Both Junior and Alex use the same safe shape. |
| Verification | The regression first failed against the null-valued helper, then passed 8/8 focused demo seed tests after the repair; type checking passed. On exact SHA `fb0f0ca6bdb1c4307bb58538a3dfcd824aec8558`, staging revision `studio-build-2026-09-08-004`, a fresh 390x844 Parent session reached `/family`, rendered Junior Guest and Alex Guest with their distinct squads, schedules, waivers, and payment summary, had no loading/Sync Failed state, and produced zero console errors or warnings; the demo seed POST/PUT and all observed application requests returned HTTP 200. |
| Status | RESOLVED AND EXACT-STAGING VERIFIED |

## BUG-045 — Media MIME, byte limits and legacy token URLs bypass private delivery (local P1 repair)

| Field | Evidence |
|---|---|
| Severity | P1 HIGH |
| Feature | Avatar, recruiting image/video, team branding |
| Reproduction | Actual authenticated Storage emulator writes accepted text-as-JPEG and 5 MiB+1 avatar bytes; an already-issued player token URL stayed anonymous-readable after opt-out. RED logs: `/tmp/task5-media-boundaries-red.log`, `/tmp/task5-media-sdk-emulator2.log`. |
| Root cause | Direct client writes trusted MIME metadata and a looser image cap; UI stored bearer download URLs; recruiting opt-out did not revoke them. The emulator additionally retains tokens separately from cleared metadata. |
| Local repair | Server-authorized private media POST/GET/DELETE, real raster decode and 5 MiB limit, bounded 500 MiB streaming with owned pending objects/generation-checked promotion, protected range reads, affected UI integrations and exact legacy-token revocation with stale-URL verification. Direct final-object writes and client flag bypass are blocked. Emulator compatibility is strict loopback/demo-only. |
| Verification | Policy/authority/route/client/harness tests and 49 Rules tests pass. Real SDK stale-URL regression passes with owned fixture cleanup. Exact browser run `final-cert-t5-260908-002336-78b3` observed every avatar, recruiting-media, privacy, stale-token, byte-limit, responsive, console, network, delete, and cleanup case; it deleted 315 owned records, restored 3 baseline records, and retained zero residue. Exact staging run `storage-cert-1788837335531` then proved private owner CRUD/range bytes, anonymous and cross-tenant denial, signature rejection, public recruiting opt-in, private revocation, tokenless metadata, and zero Auth/Firestore/object residue. |
| Status | RESOLVED AND EXACT-STAGING VERIFIED |

## BUG-044 — Library upload stores a data URL without a Storage lifecycle (local repair pending browser verification)

| Field | Evidence |
|---|---|
| Severity | P1 HIGH |
| Feature | Files — Library upload/download/delete |
| Role | Staff and eligible squad members |
| Page or route | `/files`, TeamProvider `addFile`/`deleteFile` |
| Reproduction | `final-cert-t5-260906-144545-842f` at `de68261701005ec2b87bfaf7e78926f63c44bfbe`: a real visible PDF upload survived reload as one metadata document, but stored a data URL, had no object path, and had no durable Storage object. The strict run failed and cleanup reconciled 300 deletions with no residuals. |
| Expected behavior | One private object and one metadata document; authorized attachment download with exact bytes; deletion revokes both layers. |
| Root cause | The UI used FileReader data URLs and direct Firestore writes/deletes, with no private object/upload/download service. Direct staff metadata writes also bypassed object ownership and quota enforcement. |
| Local repair | Authenticated Library API validates MIME/signature and 10 MiB file limit, transactionally enforces 500 MiB Starter aggregate, owns private objects/metadata and protected no-store attachment downloads, and performs dual-layer deletion. Legacy reads and existing Film/link paths are preserved. |
| Verification | Focused lifecycle/permission/quota/spoof tests and all 46 Firestore/Storage rules tests pass. Exact browser run `final-cert-t5-260908-002012-5b99` observed upload, private-object persistence, exact download bytes/hash/name, member read-only access, size/signature/tenant/anonymous denial, stale-URL revocation, responsive bounds, console/network health, delete, and zero-residue cleanup. Exact staging run `storage-cert-1788837335531` repeated owner upload/delete, member exact-byte download, member write denial, outsider denial, MIME/signature rejection, dual-layer deletion and zero Auth/Firestore/object residue. |
| Status | RESOLVED AND EXACT-STAGING VERIFIED |

## BUG-043 — Legacy module flags diverge from canonical tenant controls (resolved)

| Field | Evidence |
|---|---|
| Severity | P1 HIGH |
| Feature | Teams — module visibility |
| Role | Squad owner and members |
| Page or route | Settings; `/roster`, `/drills`, `/chats`, `/volunteers`, `/files` |
| Description | Canonical eight-key controls did not consistently honor legacy `roster`, `playbook`, `tacticalChat`, `volunteer`, and `library` settings, allowing migrated squads to see routes their persisted policy disabled. |
| Expected behavior | Canonical and legacy flags enforce the same fail-closed routes, canonical values win mixed records, and settings writes migrate aliases atomically. |
| Root cause | Navigation/direct-route policy and settings persistence used different incomplete key catalogs. |
| Fix | One shared module policy now covers canonical and legacy routes, defines mixed-record precedence, and dual-writes overlapping aliases during migration. |
| Verification | Behavioral tests cover every legacy key, nested routes, canonical precedence, and migration-safe writes. The immutable Task 4 browser batch exercises the complete denial matrix and rapid cross-tab re-enable flow at both viewports. Exact-revision staging remains blocked. |
| Status | RESOLVED LOCALLY — MODULE ROW REMAINS BLOCKED |

## BUG-042 — Adult self-enrollment invents a second player identity (resolved)

| Field | Evidence |
|---|---|
| Severity | P0 CRITICAL |
| Feature | Teams — join by code |
| Role | Adult player |
| Page or route | `POST /api/teams/join` |
| Description | Self-enrollment assumed the player document was `p_<uid>` and could create a second identity when the authenticated adult already had a different persisted player ID. |
| Expected behavior | The server resolves exactly one player bound to the authenticated UID and never trusts a client identity hint for self-enrollment. |
| Root cause | The route derived player identity from a naming convention instead of the authoritative `players.userId` binding. |
| Fix | Self-enrollment queries the authenticated UID's persisted player; ambiguous bindings fail with 409, while guardian child enrollment remains a separate server-validated path. |
| Verification | A bundled route regression proves the existing adult player is reused and forged identity fields are ignored. The Task 4 batch performs the adult join route and reconciles the exact player/member/user projections. Exact-revision staging remains blocked. |
| Status | RESOLVED LOCALLY — JOIN ROW REMAINS BLOCKED |

## BUG-041 — Organization overview omits or misnames server-authorized squads (resolved)

| Field | Evidence |
|---|---|
| Severity | P1 HIGH |
| Feature | Organization — club/school overview |
| Role | Organization owner/administrator |
| Page or route | `/club`; `GET /api/organizations/squads` |
| Description | The overview used only direct user membership projections; constituent organization squads could be omitted, and a membership person's `name` could replace the squad's `teamName`. |
| Expected behavior | The server-authorized organization aggregate supplies every constituent squad with its exact squad name, without widening client authority. |
| Root cause | The UI treated the selected user's memberships as the organization catalog and projected the ambiguous legacy `name` field first. |
| Fix | `/club` merges the server-scoped organization squad projection, and membership normalization gives `teamName` precedence over the member identity name. Capacity loading no longer waits on an unrelated client hydration state. |
| Verification | Route/source regressions prove server ownership boundaries, aggregate merging, and name precedence. Focused and immutable Chrome runs render all three exact school squads at both viewports with zero console/5xx findings. Exact-revision staging remains blocked. |
| Status | RESOLVED LOCALLY — ORGANIZATION ROW REMAINS BLOCKED |

## BUG-040 — Family cards lose child squads outside the guardian membership list (resolved)

| Field | Evidence |
|---|---|
| Severity | P1 HIGH |
| Feature | Family — children/invites/team cards |
| Role | Guardian |
| Page or route | `/family`; `GET /api/family/teams` |
| Description | Family cards and aggregate labels resolved squad metadata only from the guardian's direct memberships, so a linked child in Team C could display no real squad name. |
| Expected behavior | A guardian sees safe metadata for every squad joined by their server-linked children, without using caller-supplied guardian or child identifiers. |
| Root cause | The family UI had child IDs but no server-authorized metadata reader for child-only squad relationships. |
| Fix | A verified guardian endpoint derives children from `parentId == auth.uid`, returns only allowlisted squad metadata, and the family UI merges it into cards, schedule, waivers, and budget consumers. |
| Verification | Bundled route tests prove server-derived guardian scope, safe projection, forged-hint rejection, and non-guardian denial. Focused and immutable Chrome runs render exact Team A and Team C names at both viewports. Exact-revision staging remains blocked. |
| Status | RESOLVED LOCALLY — FAMILY ROW REMAINS BLOCKED |

## BUG-039 — Released organization squad cannot be legitimately reallocated (resolved)

| Field | Evidence |
|---|---|
| Severity | P1 HIGH |
| Feature | Organization — create/allocate/remove squads |
| Role | Organization owner/administrator |
| Page or route | `DELETE` and `POST /api/organizations/squads` |
| Description | Releasing a squad seat deleted the squad's organization association. A later reallocation by the same legitimate organization owner then failed authorization because the POST route could no longer prove the squad belonged to that organization. |
| Expected behavior | Releasing capacity clears the paid seat/allocation state while preserving the server-owned organization relationship required to authorize a later reallocation. |
| Root cause | The delete path treated organization membership and seat allocation as the same lifecycle field set. |
| Fix | Seat release now applies a shared server-side association projection that retains the exact organization identifiers while removing only allocation state. POST continues to derive authority from stored server fields rather than request fields. |
| Verification | Behavioral route-policy tests cover retained organization association and reallocation. Immutable Task 4 run `final-cert-t4-260905-195812-03c6` performs the real release/reallocate sequence, observes the owner boundary and seat state, denies the outsider, reloads through independent readers, and completes exact restoration. Exact-revision staging remains blocked. |
| Status | RESOLVED LOCALLY — ORGANIZATION ROW REMAINS BLOCKED |

## BUG-038 — Guardian signature could satisfy the privileged coach-waiver contract (resolved)

| Field | Evidence |
|---|---|
| Severity | P0 CRITICAL |
| Feature | Organization/Family — global waivers and participant signatures |
| Role | Guardian; squad staff/owner |
| Page or route | Firestore `coachWaiverSignatures`; `POST /api/teams/waivers/sign` |
| Description | An active non-staff member could write a document shaped like a coach signature, and the compliance consumer accepted matching team/document identifiers without proving staff authority. This allowed a guardian path to satisfy a privileged signature contract. |
| Expected behavior | Coach signatures require an active exact-team staff/owner and exact document binding. Guardians sign only for a legitimate linked child through the participant-signature route, with signer and participant identities kept separate. |
| Root cause | Firestore rules and the completion policy validated membership and caller identity but not the privileged staff role or the full exact signature schema. |
| Fix | Rules and the completion consumer now require active nonremoved staff/owner authority, exact team/document/signer bindings, and a strict schema for coach signatures. Guardian signing uses the server-authorized participant route and records the child participant separately from the guardian signer. |
| Verification | Rules and consumer regressions cover staff positives plus guardian/member/removed/wrong-team denials and the legitimate guardian participant path. Immutable Task 4 run `final-cert-t4-260905-195812-03c6` deploys consumer-valid master/copies, denies the other guardian, signs through the real participant route, and verifies the signature/archive/protocol/certificate graph with distinct signer and child identities. Exact-revision staging remains blocked. |
| Status | RESOLVED LOCALLY — ORGANIZATION/FAMILY ROWS REMAIN BLOCKED |

## BUG-037 — Public recruiting video segments exposed arbitrary nested fields (resolved)

| Field | Evidence |
|---|---|
| Severity | P1 HIGH |
| Feature | Recruiting — public scout projection |
| Role | Anonymous visitor |
| Page or route | `GET /api/public/recruiting/{playerId}` |
| Description | The top-level public DTO was allowlisted, but each video `segments` entry was copied wholesale. A private nested field supplied beside a valid clip range survived into the anonymous response. |
| Expected behavior | Every public response level uses an explicit runtime allowlist; a segment exposes only validated `start`, `end`, and optional `title` fields. |
| Root cause | TypeScript described the intended segment shape, but the runtime projector trusted arbitrary input objects. |
| Fix | Each segment is now projected field-by-field, bounded to 25 entries, and discarded unless it has finite nonnegative times with `end > start`; titles are bounded strings. |
| Verification | A behavioral regression injects private nested data, invalid ranges, and an overlong title and proves only the valid allowlisted projection remains. Immutable Task 4 run `final-cert-t4-260905-195812-03c6` also exercises the public route, private Firestore denial, canonical editor transitions, same-URL no-store behavior, and both viewports. Exact-revision staging remains blocked. |
| Status | RESOLVED LOCALLY — TENANT ROW REMAINS BLOCKED |

## BUG-036 — Guardian child enrollment assigned the guardian login to the child (resolved)

| Field | Evidence |
|---|---|
| Severity | P0 CRITICAL |
| Feature | Teams/Family — linked-child enrollment and youth activation |
| Role | Parent/guardian; youth player |
| Page or route | `POST /api/teams/join`; `/api/invites/youth` |
| Description | Enrolling an existing accountless child through a guardian-authenticated join wrote the guardian UID into the child's `userId` and set `hasLogin: true`. The later youth-login flow could no longer preserve a separate child identity. |
| Expected behavior | Guardian authority is derived from the stored child relationship, while the child remains accountless until one youth invite activates one distinct Auth identity. |
| Root cause | The join route used the authenticated caller as the player identity for both self-enrollment and guardian-managed enrollment. |
| Fix | The server now separates self from guardian enrollment, preserves the existing child's identity/login fields, derives the guardian membership projection, and never copies the guardian UID into the child roster record. |
| Verification | Executable route regressions cover a successful linked-child join and wrong-guardian denial. Immutable Task 4 run `final-cert-t4-260905-195812-03c6` issues two concurrent child joins, observes one member, preserves the accountless child, then activates a distinct youth Auth identity with coherent player/member/user projections, opens the youth self view, and denies token reuse. Approved mailbox delivery and exact-revision staging remain blocked. |
| Status | RESOLVED LOCALLY — TENANT/FAMILY ROWS REMAIN BLOCKED |

## BUG-035 — Selected seasonal reset categories erased unrelated squad data (resolved)

| Field | Evidence |
|---|---|
| Severity | P0 CRITICAL |
| Feature | Teams — seasonal reset/delete/quota resolution |
| Role | Squad owner |
| Page or route | Settings seasonal reset; `POST /api/teams/season-reset` |
| Description | Selecting only `games` still queued deletion of games, events, members, incidents, equipment, chats, feed posts, files, and documents. Complete reset also selected user and child records without proving they belonged to the active squad. |
| Expected behavior | Explicit categories delete only mapped descendants of the exact active squad. Complete reset reconciles exact user/player membership projections and owned Storage while preserving the squad root and owner controls. |
| Root cause | The client provider ran a broad deletion loop before checking selected categories and performed cross-account projection cleanup without an authoritative server scope. |
| Fix | Settings now calls an owner-authorized server route backed by a category allowlist, active-team-only Firestore projections, exact Storage prefixes, bounded retries, and structured exhausted-failure reporting. Certification invokes the destructive route only on a fresh sacrificial graph in the loopback demo project; production remains untouched by the audit. |
| Verification | Unit tests prove selected-category controls, durable retry at user-membership/member-descendant/player/Storage boundaries, active-team-only atomic projection changes, primary-team reconciliation, companion-team preservation, owner/unknown-category denial, and exhausted-failure reporting. Immutable Task 4 run `final-cert-t4-260905-195812-03c6` creates a fresh sacrificial graph, executes games-only and repeated complete resets, verifies 400/403 failures and exact root preservation, and finishes the browser row at both viewports. Exact-revision staging remains blocked. |
| Status | RESOLVED LOCALLY — TENANT ROW REMAINS BLOCKED |

## Task 11 audit runner — Demo discovery failure loses Firestore cleanup ownership (resolved)

| Field | Evidence |
|---|---|
| Severity | IMPORTANT (audit evidence integrity; not an application defect ID) |
| Feature | Local certification runner — anonymous demo cleanup registration |
| Description | After a browser fallback recovered an owned demo UID, a failure in the first Firestore graph-discovery read left only Auth registered. A later healthy cleanup could remove Auth and report an observed cleanup without owning the undiscovered Firestore graph. |
| Expected behavior | Before any graph read, the known UID must own an exact user-root cleanup and a retryable discovery obligation. Successful discovery must register every exact user, team, league, public-view, player, facility, and booking root. Exhausted discovery must fail with residual evidence and retain Auth ownership. |
| Root cause | Round 5 moved from a lazy graph callback to exact per-root registrations, but those registrations occurred only after the initial discovery promise resolved. The older regression exercised the retired callback helper instead of the live browser registration path. |
| Fix | The live path now registers `users/{uid}` and an unmeasured UID-scoped discovery obligation before the first read. Cleanup can add newly discovered exact resources while active and gives each its own bounded retries and measured postcondition. Auth deletion is gated on completed discovery and all registered roots verifying absent. |
| Verification | Red/green tests cover identity-only and partial setup, recovered UID with transient discovery, exact root and public-view retries after parent deletion, original-error preservation, exhausted discovery with discovery/Auth residuals, unchanged exact counts, and sequential all-root verification. Exact local Chrome run `final-cert-t3-260905-122645-90d8` on implementation candidate `93b769b7` recorded 5 observed / 2 truthful not-observed / 0 failed demo cases, zero run errors, and cleanup 249 deleted / 0 restored / 0 retained; 39 dynamic selectors reconciled with zero diagnostics. |
| Status | RESOLVED LOCALLY — HOSTED/WORKER ROW REMAINS BLOCKED |

## BUG-034 — Inactive squad invitation codes expose a join preview (resolved)

| Field | Evidence |
|---|---|
| Severity | P1 HIGH |
| Feature | Teams — join by code |
| Role | Anonymous visitor; prospective member |
| Page or route | `GET /api/teams/join`; `/register/squad/{teamId}` |
| Description | A valid invitation code for an inactive, deleted, or otherwise non-registerable squad still returned its squad identifier and name from the public preview endpoint. |
| Expected behavior | Public preview and authenticated consumption enforce the same current registration state and return a nondisclosing not-found response when the squad no longer accepts registrations. |
| Actual behavior | `POST` called `teamAcceptsRegistrations`, while `GET` returned the minimal squad projection immediately after code resolution without applying that guard. |
| Root cause | The preview and consumption branches shared code lookup but not the active-registration predicate. |
| Fix | `GET /api/teams/join` now applies `teamAcceptsRegistrations(team)` before returning any squad projection and uses the same 404 copy as an unknown code. |
| Verification | Executable route regressions prove inactive code-only GET and POST denial without membership writes and guardian/adult identity preservation. Immutable local Task 4 run `final-cert-t4-260905-195812-03c6` observed active/modified preview, two concurrent linked-child POSTs settling to one roster row, server-bound adult self-enrollment, current-state inactive denial without a write, wrong-guardian denial, session persistence, both viewports, and run-bounded preview cleanup. Exact-revision staging remains blocked. |
| Status | RESOLVED LOCALLY — TENANT ROW REMAINS BLOCKED |

## BUG-033 — Public recruiting activation had two conflicting authority sources (resolved)

| Field | Evidence |
|---|---|
| Severity | P1 HIGH |
| Feature | Recruiting — public scout projection |
| Role | Player/guardian/staff publisher; anonymous visitor |
| Page or route | Recruiting provider; `/recruit/player/{playerId}` metadata; `/api/public/recruiting/{playerId}` |
| Description | The public API used canonical `recruitingProfile/profile.status`, page metadata used the legacy root `recruitingProfileEnabled`, and the visible toggle updated only that legacy root field. A hidden profile could therefore leak player metadata, while an enabled toggle could leave the actual public route unavailable. |
| Expected behavior | One server-consumed canonical state controls API data, route metadata, and publishing transitions; the legacy root flag is only a synchronized compatibility projection. |
| Actual behavior | Three consumers disagreed about whether the profile was active. |
| Root cause | The earlier public-API hardening moved authority to the canonical profile document without migrating the metadata reader and write path. |
| Fix | Metadata reads `recruitingProfile/profile` and calls `isProspectActivated`. The legacy compatibility toggle updates only the root compatibility flag; the canonical profile editor remains the single status writer and cannot have `committed` overwritten by the toggle. |
| Verification | Behavioral regressions prove metadata/API canonical-state agreement and that the compatibility toggle cannot write canonical status. Immutable local Task 4 run `final-cert-t4-260905-195812-03c6` observed canonical hidden-active-committed-hidden transitions on the same URL, preserved `committed`, no-store behavior, recursive allowlisting, private/companion denial, both viewports, and zero console/5xx findings. Exact-revision staging remains blocked. |
| Status | RESOLVED LOCALLY — TENANT ROW REMAINS BLOCKED |

## BUG-032 — Duplicate youth-invite endpoint diverged from the Family contract (resolved)

| Field | Evidence |
|---|---|
| Severity | P1 HIGH |
| Feature | Family — enable youth login |
| Role | Linked guardian; invited youth player |
| Page or route | `/api/invites/youth`; `/api/youth-invites` |
| Description | Two independently implemented public youth-invitation routes used different token formats, response shapes, methods, error semantics, rate-limit boundaries, and redemption authority. Clients could reach different invitation behavior depending on which historical route they called. |
| Expected behavior | The compatibility path and canonical Family Hub path expose one implementation and one authorization/redemption contract. |
| Actual behavior | The legacy route maintained a separate 64-character-token implementation while the canonical route had the current 48-character invitation and activation contract. |
| Root cause | The compatibility endpoint was copied rather than delegated when the canonical Family flow evolved. |
| Fix | `/api/youth-invites` now re-exports canonical `GET`, `POST`, and `PUT` handlers from `/api/invites/youth`; there is no second invitation implementation. |
| Verification | A bundled route regression compares canonical and compatibility behavior and requires all three exports. Immutable local Task 4 run `final-cert-t4-260905-195812-03c6` created a guardian-owned invite, observed cross-guardian/modified-token/direct-Firestore denial, compared both live route responses, activated one distinct youth Auth identity with coherent projections, denied reuse, restored the accountless child, and rendered the youth self view in both viewports without console/5xx findings. Approved mailbox receipt and exact-revision staging remain blocked. |
| Status | RESOLVED LOCALLY — TENANT ROW REMAINS BLOCKED |

## BUG-031 — Linked player identity can inherit unrelated tenant and staff authority (resolved)

| Field | Evidence |
|---|---|
| Severity | P0 CRITICAL |
| Feature | Youth identity — downstream team and tournament authorization |
| Role | Youth player; team staff |
| Page or route | Firestore team resources; tournament schedule deployment helper |
| Description | Downstream authorization trusted an arbitrary `users.linkedPlayerId`. A forged user profile could point at an unrelated active roster member and be treated as a team member; the tournament staff helper could also interpret that linked roster entry's staff-like position as the caller's authority. |
| Expected behavior | Youth access requires a server-authoritative user/player/guardian binding plus an active roster relationship for the exact team. Staff or parent powers require the caller's own direct active membership. Legitimate teamless and legacy activation must remain usable without granting unrelated tenant authority. |
| Actual behavior | `linkedPlayerId` alone was sufficient to enter the linked-player branch. Firestore rules did not bind the player back to the signed-in user and guardian, and the server tournament helper fell back from the caller's direct membership to the linked player's membership. |
| Root cause | A denormalized convenience pointer was consumed as an authorization proof without verifying its server-owned identity chain or separating youth membership from staff authority. |
| Fix | Firestore membership now requires matching `users/{uid}`, `players/{linkedPlayerId}`, and active `teams/{teamId}/members/{linkedPlayerId}` records, including user, guardian, player, and team bindings. Staff/parent rules and tournament deployment use direct active caller membership only. Established player identity bindings cannot be rewritten by clients; an initial self-owned player record is not authoritative without the server-owned user link/guardian relationship and active exact-team roster. Youth member projections carry their authoritative team binding. |
| Verification | Firestore emulator tests prove valid linked-youth access and deny mismatched user/player, parent, team, removed membership, staff inheritance, and player-binding forgery. Tournament helper regressions prove legitimate direct staff access and deny linked, removed, and cross-team records. Focused youth run `final-cert-t3-260905-111011-341f` passed 7/7 local cases, and immutable full run `final-cert-t3-260905-111335-5280` on candidate `5d3c9283` passed all 11 scenarios with zero failed cases or run errors. Approved staging invite/session evidence remains blocked. |
| Status | RESOLVED LOCALLY — STAGING ROW REMAINS BLOCKED |

## BUG-030 — Elite-plan mobile navigation exposes a denied competition route (resolved)

| Field | Evidence |
|---|---|
| Severity | P2 MEDIUM |
| Feature | Dashboard shell — responsive route navigation |
| Role | Elite-plan club owner |
| Page or route | Mobile bottom navigation; `/competition` |
| Description | The mobile shell rendered a Leagues link to `/competition` for an elite-plan club owner even though the authoritative route policy denied that destination and redirected direct access to `/dashboard`. |
| Expected behavior | Every visible sensitive navigation item agrees with the same role, plan, tenant, and trusted-claim policy that guards direct routes. |
| Actual behavior | Mobile navigation advertised a route that the application immediately denied. Backend and direct-route guards still prevented unauthorized access. |
| Root cause | Coordination tabs were filtered through `authorizeDashboardRoute`, but the shared mobile bottom-nav list bypassed the policy filter. |
| Fix | `Shell` now filters mobile bottom-nav items through `authorizeDashboardRoute` using the active identity's authoritative role, plan, ownership, and trusted-claim state. |
| Verification | A regression was red before the fix. Focused dashboard run `final-cert-t3-260905-095628-6857` and final immutable run `final-cert-t3-260905-100743-7ed8` on candidate `320d7f9f` then completed the 20-role, seven-route direct and visible-navigation matrix at desktop and mobile widths with zero policy, console, network, or containment failures. The coverage row remains blocked for exact-revision hosted sessions. |
| Status | RESOLVED LOCALLY — STAGING ROW REMAINS BLOCKED |

## BUG-029 — Admin directory name sorting disagrees with displayed names (resolved)

| Field | Evidence |
|---|---|
| Severity | P2 MEDIUM |
| Feature | Administration — user directory |
| Role | Trusted superadmin |
| Page or route | `/admin` user directory |
| Description | Directory rows without `fullName` displayed their legacy `name`, but the name-sort comparator treated those rows as empty. Clicking ascending or descending therefore did not produce the visible order promised by the table header. |
| Expected behavior | The visible Name column sorts by the same normalized value it renders in both directions. |
| Actual behavior | Fixture users backed by `name` remained out of visible ascending/descending order. |
| Root cause | Rendering used `fullName || name`, while sorting read only the selected `fullName` property. |
| Fix | The comparator now uses `fullName || name || email` for the Name column and retains the existing comparator for other fields. |
| Verification | A focused browser regression waited for and asserted the actual ascending and descending row order; the immutable 11-scenario run `final-cert-t3-260905-100743-7ed8` repeated both assertions with zero console/network findings. The row remains BLOCKED for authorized staging claim revocation on the exact deployed revision. |
| Status | RESOLVED LOCALLY — STAGING ROW REMAINS BLOCKED |

## BUG-028 — Youth activation trusts parent-editable player team fields (resolved)

| Field | Evidence |
|---|---|
| Severity | P1 HIGH |
| Feature | Signup/onboarding — youth invitation activation |
| Role | Youth player |
| Page or route | `/signup/youth`; `/api/invites/youth` |
| Description | The first membership repair derived tenant authority from the player's `primaryTeamId` and `joinedTeamIds`. Those fields are parent-editable profile metadata, so a forged value could mint a youth membership during invitation redemption. |
| Expected behavior | Activation grants tenant authority only for the exact child and team backed by a currently active, server-authorized roster membership. Teamless and legacy players remain teamless. |
| Actual behavior | A valid invite could convert forged player team metadata into `teams/<teamId>/members/<uid>` and `users/<uid>/teamMemberships/<teamId>` projections. |
| Root cause | Redemption treated denormalized player preference/link fields as authorization instead of binding and revalidating an active child roster record. |
| Fix | Invitation creation stores the authoritative active-roster binding. Redemption transactionally revalidates the exact player/team membership before creating projections; missing, removed, or changed bindings fail closed and roll back the new Auth identity. |
| Verification | Behavioral regressions cover forged primary-team and joined-team fields, removed child membership, post-invite team change with HTTP 409 and Auth rollback, legitimate teamless activation, and an authorized active-roster positive. Final immutable run `final-cert-t3-260905-100743-7ed8` repeated linkage, tenant authority, relogin persistence, both viewports, console/network observers, and exact restoration. Approved staging invite delivery remains blocked. |
| Status | RESOLVED LOCALLY — STAGING ROW REMAINS BLOCKED |

## BUG-027 — Delegated school hub loads organization capacity before hub resolution (resolved)

| Field | Evidence |
|---|---|
| Severity | P2 MEDIUM |
| Feature | School hub — organization capacity |
| Role | Delegated school administrator |
| Page or route | `/club`, `/api/organizations/squads` |
| Description | A delegated school administrator received transient HTTP 403 responses when an incomplete client projection omitted the school hub identifier. |
| Expected behavior | The server derives the caller's authorized organization even while client team hydration is incomplete; authorized delegates see no rejected bootstrap request. |
| Actual behavior | The original capacity effect depended on client membership hydration to identify the hub and could temporarily evaluate the delegate against the wrong organization. |
| Root cause | Authorization context was coupled to an incomplete client-side projection. The interim hydration gate avoided the early request but also suppressed legitimate aggregate loading when hydration did not converge. |
| Fix | The organization endpoint derives authority from verified server state. The UI requests that server-scoped aggregate independently, supplies a hub identifier only when already known, and merges the returned safe squad projection. |
| Verification | Server-authority, aggregate, cancellation, and browser regressions cover owner/delegate boundaries and all exact constituent squads. The immutable Task 4 browser batch renders the complete organization overview at both viewports with zero 403/5xx or console findings. |
| Status | RESOLVED |

## BUG-026 — Visible demo sign-out skips exact demo cleanup (resolved)

| Field | Evidence |
|---|---|
| Severity | P1 HIGH |
| Feature | Anonymous demo — visible exit |
| Role | Anonymous demo visitor |
| Page or route | Shell `Sign Out`, `/api/demo/exit` |
| Description | The visible account-menu sign-out cleared the browser session without first invoking exact server-side demo cleanup. |
| Expected behavior | Visible demo exit removes only that demo's owned roots, invalidates its session, signs out the client, and leaves peer demo contexts intact. |
| Actual behavior | Direct API cleanup could succeed, but the actual visible control bypassed it; deleting server roots underneath an active client also produced a Firestore permission error. |
| Root cause | `Shell.handleLogout` treated anonymous demos like registered accounts and never called the dedicated cleanup endpoint. |
| Fix | Demo sign-out now requires a successful `/api/demo/exit` response before clearing the browser session and signing out. The certification journey uses the visible account-menu control and waits for that response. |
| Verification | The regression was red before the Shell fix. The repaired focused journey passed 24 assertions, returned cleanup HTTP 204, redirected to `/login`, preserved mobile containment, and emitted zero console errors. The exact full local run `final-cert-t3-260905-022702-06e8` repeated it with peer-context isolation and exact cleanup. |
| Status | RESOLVED |

## BUG-025 — Password-reset provider failure reveals known accounts (resolved)

| Field | Evidence |
|---|---|
| Severity | P1 HIGH |
| Feature | Authentication — password reset request |
| Role | Visitor |
| Page or route | `/api/email/reset-password`, login forgot-password dialog |
| Description | Under the enforced no-outbound provider boundary, an unknown email returned neutral HTTP 200 while a known account returned a provider error, revealing account existence. |
| Expected behavior | Known and unknown reset requests return the same neutral response; delivery failures remain server-side diagnostics and never become an enumeration signal. |
| Actual behavior | The known-account path surfaced the blocked delivery exception as an error while the unknown path did not attempt delivery. |
| Root cause | The route coupled reset-code generation/delivery outcome to the public response. |
| Fix | Reset delivery is attempted behind the server boundary, but provider failures now retain generic server-side diagnostics and return the same neutral success as unknown accounts. |
| Verification | The route regression failed before the change and passed after it. Emulator OOB redemption changed the password once, rejected modified/reused and old credentials, restored the original password, and bound the code to the intended recipient. Known and unknown visible requests both showed `A reset link was sent`, returned no failed response, and emitted zero console errors in the final exact run. |
| Status | RESOLVED |

## BUG-024 — Missing-profile onboarding starts protected team listeners (resolved)

| Field | Evidence |
|---|---|
| Severity | P1 HIGH |
| Feature | Signup/onboarding — missing profile |
| Role | Verified registered identity without a profile |
| Page or route | `/onboarding` |
| Description | A verified Auth identity with no `users/{uid}` document reached onboarding, but `TeamProvider` started protected Firestore listeners and the page fell into the global error boundary. |
| Expected behavior | Missing-profile onboarding loads without protected team/profile listeners and grants no default tenant or management authority. |
| Actual behavior | `/onboarding` was absent from the provider's auth-gate route set, so protected hydration began before the profile existed. |
| Root cause | The route-level listener guard covered login/signup/verification but omitted onboarding. |
| Fix | `/onboarding` is now an auth-gate path for `TeamProvider`, preventing protected listener startup until the profile is complete. |
| Verification | A source regression failed before the route was added and passed afterward. The focused and final exact local browser runs signed in a fresh verified missing-profile identity, rendered the visible onboarding form, completed the coach role, reached `/teams/new`, persisted across reload, fit 390x844, and cleaned the Auth/profile/player records. |
| Status | RESOLVED |

## BUG-023 — Identity audit API probes used fixed historical fixture IDs (resolved)

| Field | Evidence |
|---|---|
| Severity | P2 MEDIUM |
| Feature | Local certification runner — identity and tenant-isolation probes |
| Role | Certification operator |
| Page or route | Phase 2 emulator audit API probes |
| Description | The legacy local audit seeded run-unique Team A and Team B documents but probed fixed `qa-team-a` and `qa-team-b` API paths. |
| Expected behavior | Every API probe targets the exact run-scoped fixture identifiers returned by the seeder. |
| Actual behavior | The fixed historical identifiers returned false 404s and prevented the identity certification batch from exercising the seeded tenant boundary. |
| Root cause | The API path strings predated run-scoped fixture IDs and were not derived from the fixture object. |
| Fix | Added a pure target builder that requires the seeded fixture IDs and constructs every Team A/Team B API path from them. |
| Verification | A focused helper regression proves the run-scoped Team A/B IDs resolve from the catalog. A separate request-plan regression proves all five affected tenant requests use those IDs and contain no fixed historical team segment. The exact local identity batch `final-cert-t3-260905-022702-06e8` then passed every scoped tenant API probe. |
| Status | RESOLVED |

## BUG-022 — Firestore timestamps crash the member feed (resolved)

| Field | Evidence |
|---|---|
| Severity | P1 HIGH |
| Feature | Team feed — timestamp rendering |
| Role | Active team member |
| Page or route | `/feed` |
| Description | A member opening the seeded feed reached the route error boundary with `RangeError: Invalid time value`. |
| Expected behavior | Feed posts and comments render valid Firestore, serialized, and ISO timestamps without a route-level exception. |
| Actual behavior | The page passed a live Firestore `Timestamp` object through `new Date(...)`, producing an invalid date that `date-fns` rejected during render. |
| Root cause | The feed assumed all timestamps were JavaScript-date-compatible even though the live collection returns Firestore `Timestamp` values. |
| Fix | Added a shared feed timestamp normalizer for live Firestore timestamps, serialized timestamp shapes, ISO/epoch values, and malformed fallback values; post and comment distance labels now use it. |
| Verification | Focused timestamp regressions passed for every supported shape and malformed fallback. The first exact browser run `final-cert-t3-260904-231719-6cb6` reproduced the crash; the repaired exact run `final-cert-t3-260904-233419-8ece` on implementation commit `a6b8a410100a956333df8c50e9f4ccac54a2e9b9` loaded the member feed and completed the member remainder sweep with zero application errors, zero console errors, zero failed responses, and zero mobile-fit failures. This is local evidence only and does not close the feed coverage row. |
| Status | RESOLVED |

## BUG-021 — Hosted demo cleanup rejects its own public origin (resolved)

| Field | Evidence |
|---|---|
| Severity | P1 HIGH |
| Feature | Anonymous live demo — immediate cleanup |
| Role | Anonymous demo visitor |
| Page or route | `/api/demo/exit` |
| Description | A same-site cleanup request from the hosted App Hosting domain returned HTTP 403 after a demo session. |
| Expected behavior | Same-origin anonymous demos can delete their disposable workspace immediately; foreign origins remain denied. |
| Actual behavior | The route compared the browser `Origin` header with `request.nextUrl.origin`, which reflects the internal proxy origin in App Hosting rather than the configured public origin. |
| Root cause | The CSRF boundary trusted proxy-derived URL state instead of the configured application origin already used by server request guards. |
| Fix | Demo cleanup now uses the shared parsed `isTrustedRequestOrigin(request)` boundary, retaining production configured-origin and local-development loopback restrictions without trusting proxy-derived URL state. |
| Verification | The regression was observed failing before the repair and passing after it. Protected release gate `33911442472` and staging workflow `33911749713` passed for commit `e796fde6aafd478d8f25855ed10f7cdabad79c5d`; App Hosting revision `studio-build-2026-09-04-012` returned HTTP 204 to the same hosted Playwright cleanup request. The deleted Auth identity could no longer be looked up, `/dashboard` redirected to expired login, and direct checks returned HTTP 404 for the user, team, team children, league, facility, and player roots. |
| Status | RESOLVED |

## BUG-020 — Assigned equipment can be deleted (resolved)

| Field | Evidence |
|---|---|
| Severity | P1 HIGH |
| Feature | Equipment — inventory integrity |
| Role | Team owner or authorized staff |
| Page or route | `/equipment` |
| Description | The delete action removed an equipment document even when active member assignments still existed. |
| Expected behavior | An assigned asset cannot be deleted until every assignment is returned. |
| Actual behavior | The provider called `deleteDoc` without reading assignment state. |
| Root cause | Equipment deletion had no transactional invariant and the UI had no failure handling. |
| Fix | Deletion now runs in a transaction, rejects any non-empty assignment map, and reports `Asset Still Assigned` in the UI. |
| Verification | The regression test fails without the transaction. Real Chrome created stock, rejected an over-assignment, persisted an assignment, blocked deletion, restored stock on return, and then deleted successfully after reload with zero console errors or 5xx responses. |
| Status | RESOLVED |

## BUG-019 — Facility edit control has no accessible name (resolved)

| Field | Evidence |
|---|---|
| Severity | P2 MEDIUM |
| Feature | Facilities — venue editing |
| Role | Team owner or authorized staff |
| Page or route | `/facilities` |
| Description | The icon-only facility edit button exposed no stable accessible name. |
| Expected behavior | Assistive technology identifies the specific facility edit action. |
| Actual behavior | Only a pencil icon and hover tooltip described the action. |
| Root cause | The trigger omitted `aria-label`. |
| Fix | Added the facility-specific accessible name `Edit {facility name}`. |
| Verification | Source regression and the real Chrome edit/persistence workflow both passed. |
| Status | RESOLVED |

## BUG-018 — Incomplete facility form submits as a silent no-op (resolved)

| Field | Evidence |
|---|---|
| Severity | P2 MEDIUM |
| Feature | Facilities — enrollment validation |
| Role | Team owner or authorized staff |
| Page or route | `/facilities` |
| Description | Entering only a venue name enabled the submit button, but clicking it returned silently because the address was absent. |
| Expected behavior | Both required fields are identified and incomplete enrollment cannot be submitted. |
| Actual behavior | An enabled action performed no work and displayed no validation state. |
| Root cause | The button checked only `newFac.name` while the handler required name and address. |
| Fix | Required markers and trimmed name/address checks now control both the handler and disabled state. |
| Verification | Source regression plus real Chrome proved disabled-empty, disabled-name-only, enabled-complete, and persisted creation. |
| Status | RESOLVED |

## BUG-017 — Legacy chat messages crash the conversation detail (resolved)

| Field | Evidence |
|---|---|
| Severity | P1 HIGH |
| Feature | Team Chat — message rendering |
| Role | Active team member |
| Page or route | `/chats/[chatId]` |
| Description | A valid legacy message using `senderId`, `text`, and a Firestore timestamp reached the renderer without the newer `author`, `content`, and ISO timestamp fields. |
| Expected behavior | Supported historical messages render safely while current messages retain their data. |
| Actual behavior | The detail page read `msg.author[0]` and crashed when `author` was absent. |
| Root cause | The Firestore boundary did not normalize legacy message shapes. |
| Fix | Added a bounded chat-message normalizer for identity, content, type, and timestamp fields before rendering. |
| Verification | Unit regressions cover legacy, current, and missing-field shapes. Real Chrome loaded the seeded legacy conversation and then completed cross-role message persistence with zero console errors or 5xx responses. |
| Status | RESOLVED |

## BUG-016 — Legacy events can crash Calendar (resolved)

| Field | Evidence |
|---|---|
| Severity | P1 HIGH |
| Feature | Calendar — team event discovery |
| Role | Active team user |
| Page or route | `/calendar` |
| Description | Legacy team-subcollection events without an embedded `teamId` reached Calendar discovery, which called `.slice()` on the missing value. |
| Expected behavior | A team-subcollection event inherits its containing team and renders safely. |
| Actual behavior | Calendar entered its error boundary with `Cannot read properties of undefined`. |
| Root cause | Provider hydration trusted duplicated document fields instead of applying collection context. |
| Fix | Event hydration now normalizes the containing team ID, Calendar filters invalid identifiers, and context-free malformed events fail closed. |
| Verification | Unit regressions cover inheritance, explicit IDs, and fail-closed input. The exact owner surface sweep then rendered Calendar with zero console errors and zero 5xx responses. |
| Status | RESOLVED |

## BUG-015 — Pending-deletion login crashes behind the sign-in screen (resolved)

| Field | Evidence |
|---|---|
| Severity | P1 HIGH |
| Feature | Authentication — blocked account admission |
| Role | Deletion-pending account |
| Page or route | `/login` |
| Description | Before the secure session API completed its denial, the root team provider started protected profile, membership, and school-invite Firestore work. Rules rejected those listeners and the login screen crashed. |
| Expected behavior | The account stays on `/login`, receives the generic session-setup failure, and starts no protected team work. |
| Actual behavior | Firestore permission errors reached the application error boundary. |
| Root cause | Root provider effects were not gated on authentication routes and the failed login left the Firebase client signed in. |
| Fix | Authentication-gate routes suppress protected provider effects; failed session establishment clears the browser session and signs out Firebase Auth. |
| Verification | Regression coverage plus the focused real Chrome pending-deletion login test passed without a crash. |
| Status | RESOLVED |

## BUG-014 — Broadcast inbox renders overlapping close controls (resolved)

| Field | Evidence |
|---|---|
| Severity | P2 MEDIUM |
| Feature | Dashboard Shell — alert inbox and history |
| Role | Any alert recipient |
| Page or route | Shared authenticated Shell |
| Description | `Squad Alert Inbox` added a custom top-right close button even though the shared dialog component already renders one in the same position. The built-in control intercepted pointer input intended for the custom control. |
| Expected behavior | The inbox exposes one keyboard- and pointer-operable close action. |
| Actual behavior | Two overlapping controls competed for the same hit area. |
| Root cause | The feature duplicated behavior supplied by `DialogContent`. |
| Fix | Removed the redundant feature-level `DialogClose` and retained the standard dialog close control. |
| Verification | Source regression enforces a single close implementation. A real Chrome session acknowledged the two eligible Team A alerts, verified history and audience/tenant exclusions, reopened on mobile, and operated the standard close path with zero console errors or 5xx responses. |
| Status | RESOLVED |

## BUG-013 — Desktop squad switcher lacks an accessible name (resolved)

| Field | Evidence |
|---|---|
| Severity | P2 MEDIUM |
| Feature | Dashboard Shell — active squad switching |
| Role | Multi-team user |
| Page or route | Shared authenticated Shell |
| Description | The mobile lightning control was named `Switch squad`, but the two desktop selector variants exposed only their changing visual contents. Assistive technology and stable UI automation had no consistent action name. |
| Expected behavior | Every responsive switcher trigger has the same stable, descriptive accessible name while preserving visible team context. |
| Actual behavior | Desktop triggers had no explicit accessible label. |
| Root cause | The desktop `DropdownMenuTrigger` buttons omitted the label already present on the mobile trigger. |
| Fix | Added `aria-label="Switch squad"` to both desktop variants and stable non-secret element identifiers for deterministic tenant-switch regression coverage. |
| Verification | A real Chrome session switched an identity belonging to two isolated teams in both desktop and 390×844 mobile layouts. It proved reciprocal event exclusion, three rapid switch round trips, final selection persistence across reload and Back navigation, mobile containment, zero console errors, and zero 5xx responses. |
| Status | RESOLVED |

## BUG-012 — Schedule companion leaks browser-local data across profiles and does not reliably reload offline (resolved)

| Field | Evidence |
|---|---|
| Severity | P2 MEDIUM |
| Feature | Schedule companion sync, personal todos, and offline shell |
| Role | Any signed-in user sharing a browser or installed PWA |
| Page or route | `/schedule-app`, `/sw.js` |
| Description | Events and todos used global localStorage keys, so a different signed-in profile could inherit the prior profile's cached schedule or tasks. The worker cached only a generic offline page, leaving the client-rendered companion unable to reload reliably offline. The companion also registered a second plain worker despite the root configured registration. |
| Expected behavior | Cached schedules are scoped to user and team, personal todos are scoped to user, selected teams are revalidated against current memberships, malformed storage fails closed, and the public companion shell reloads offline without caching authenticated HTML or API data. |
| Actual behavior | Global cache keys crossed the profile boundary; stale selected-team state was trusted until Firestore denied it; and offline navigation lost the companion UI. |
| Root cause | Browser storage lacked identity namespaces and runtime validation. The service worker had no schedule-shell or static-client-bundle cache path, and duplicate registration could race the configured primary worker. |
| Fix | Added versioned user/team storage keys with runtime shape validation, membership-validated team selection, same-profile offline fallback only, live auth-driven todo swapping, one primary worker registration, a public schedule-shell cache, and same-origin `/_next/static/` caching. Authenticated pages and APIs remain network-only. |
| Verification | Five storage/worker regressions pass. A real Chrome emulator session proved both tenants' correct events, reciprocal event isolation, corrupt/legacy/other-profile todo rejection, CRUD persistence, 390×844 fit, cached-shell offline reload, same-browser Team A to Team B switching, and zero unexpected online or offline console errors. |
| Status | RESOLVED |

## BUG-011 — Time Out game is unreachable and corrupted preferences can crash it (retired)

| Field | Evidence |
|---|---|
| Severity | P2 MEDIUM |
| Feature | Time Out local game |
| Role | Authenticated user |
| Page or route | Shared dashboard Shell |
| Description | The complete Time Out launcher/modal implementation was never rendered anywhere, so users could not open it. If exposed, arbitrary stored sport or difficulty strings were cast as valid enum values and could leave the modal without matching sport metadata. |
| Expected behavior | Authenticated users can open the game from the shared header; invalid local preferences fall back safely; documented keyboard/touch controls and persistence work at desktop and mobile sizes. |
| Actual behavior | `TimeOutLauncher` had no consumer, and corrupted local storage was accepted without validation. |
| Root cause | The launcher was orphaned during Shell integration and persisted enum values crossed the storage boundary without runtime normalization. |
| Fix | The product owner explicitly rejected the feature on 2026-09-04. The Shell launcher, production game components, active browser-audit path, and dedicated game tests were removed. |
| Verification | A source regression enforces that the authenticated Shell contains no Time Out launcher or action. |
| Status | RETIRED — NOT APPLICABLE |

## BUG-010 — Profile-only superadmin can receive private applicant notifications (resolved)

| Field | Evidence |
|---|---|
| Severity | P1 HIGH |
| Feature | Public beta/newsletter submissions — admin notification targeting |
| Role | Public applicant and global administrator |
| Page or route | `/api/public/notify-admin` |
| Description | The notification route selected additional email and FCM recipients by querying user profiles whose Firestore `role` value was `superadmin`. A profile-only fake could therefore receive private applicant details despite being denied the admin route and API. |
| Expected behavior | Only identities carrying the verified Firebase custom claim contribute administrator email or push destinations. |
| Actual behavior | Recipient discovery trusted the profile string without checking the Auth claim. |
| Root cause | Notification delivery had an independent profile-based privilege path outside the central request authorization policy. |
| Fix | Candidate profiles are now batched through Firebase Auth and only UIDs with the trusted `superadmin` custom claim contribute normalized email or bounded FCM tokens. The fixed operational inbox remains the fallback. |
| Verification | The regression first failed because no trusted-target filter existed, then passed 2/2 with the fake profile's email/token excluded and malformed target values rejected. Typecheck passed and scoped lint reported zero errors. |
| Status | RESOLVED |

## BUG-009 — Local browser audit cannot connect to enabled Firebase emulators (resolved)

| Field | Evidence |
|---|---|
| Severity | P2 MEDIUM |
| Feature | Audit infrastructure — Firebase emulator browser execution |
| Role | Synthetic Phase 2 identities |
| Page or route | `/login` and protected dashboard routes |
| Description | The application was explicitly configured for local Firebase emulators, but its Content Security Policy rejected the loopback Auth, Firestore, and Storage connections needed by a real browser. |
| Expected behavior | Development builds with emulator mode explicitly enabled can connect only to the known loopback emulator ports; production CSP remains unchanged. |
| Actual behavior | Browser login failed at the CSP boundary before the synthetic identity and route policy could be exercised. |
| Root cause | `connect-src` included hosted Firebase origins but did not conditionally include the loopback emulator origins. |
| Fix | Development CSP now adds the exact localhost and `127.0.0.1` Auth, Firestore, and Storage ports only when `NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true`. |
| Verification | `tests/emulator-csp.test.mjs` covers the environment boundary. The complete emulator audit then authenticated real Chrome sessions and exercised protected routes without relaxing production CSP. |
| Status | RESOLVED |

## BUG-008 — Suspended or deletion-pending accounts can reach Admin SDK APIs (resolved)

| Field | Evidence |
|---|---|
| Severity | P1 HIGH |
| Feature | Account lifecycle — server authorization |
| Role | Suspended, disabled, and deletion-pending registered users |
| Page or route | Authenticated `/api/*` routes and protected dashboard rendering |
| Description | Firestore rules denied inactive account states, but server routes using the Admin SDK validated the token without consistently applying the same account-state restriction. |
| Expected behavior | A suspended, disabled, pending-deletion, or deleted account loses server API and dashboard access even while an otherwise valid credential exists. |
| Actual behavior | The client/rules boundary and Admin SDK boundary used different account-state policies. |
| Root cause | Admin SDK bypasses Firestore rules by design, and the shared server token verifier did not load and evaluate the user's lifecycle state. |
| Fix | Added one shared account-access policy to API authentication, session inspection, and server dashboard authorization. The coarse middleware remains free of a redundant profile read because the dashboard template and admin layout already enforce the server gate. |
| Verification | Policy regressions cover all blocked and allowed lifecycle values. The real emulator audit returned HTTP 403 for a deletion-pending identity, Auth returned `USER_DISABLED` for the disabled identity, and the focused suite passed 18/18. |
| Status | RESOLVED |

## BUG-007 — Profile-only `superadmin` value grants elevated application authority (resolved)

| Field | Evidence |
|---|---|
| Severity | P1 HIGH |
| Feature | Administration — trusted role boundary |
| Role | Ordinary account with a forged or stale profile role |
| Page or route | `/admin`, shared dashboard navigation, and quota logic |
| Description | Some route and client policy paths treated a Firestore profile value of `superadmin` as equivalent to the trusted Firebase custom claim. |
| Expected behavior | Global administration and superadmin quota elevation depend only on the verified custom claim; profile data alone cannot confer that authority. |
| Actual behavior | The profile role could feed the route policy and client quota calculation as elevated authority. |
| Root cause | Trusted claim state and editable/stale profile state were combined into one normalized role input. |
| Fix | The dashboard policy recognizes superadmin only from the decoded claim. Navigation and quota elevation consume the trusted `isSuperAdmin` state rather than a profile string. |
| Verification | Regression tests cover forged-profile denial and trusted-claim allowance. In real local Chrome sessions, the claim-controlled identity landed on and retained `/admin`; the profile-only fake landed on `/dashboard` and a direct `/admin` request redirected to `/dashboard`. The admin API returned 200 for the trusted claim and 403 for the fake profile. |
| Status | RESOLVED |

## BUG-006 — Landing support widget emits repeat console errors in Chromium and WebKit (resolved)

| Field | Evidence |
|---|---|
| Severity | P2 MEDIUM |
| Feature | Marketing landing page — visitor support |
| Role | Visitor |
| Page or route | `/` |
| Description | A clean landing-page load emitted five styled-components error 17 messages from the Elfsight AI Chatbot bundle in both Chromium and WebKit. The widget still opened in Chromium, but the repeated errors violated the audit's console-clean requirement and the same vendor path was unreliable in Safari/WebKit. |
| Expected behavior | Every supported browser exposes a usable support path without application console errors. |
| Actual behavior | Lazy Elfsight initialization repeatedly lost an injected stylesheet in Chromium. Eager initialization removed that failure there, but the vendor Safari/WebKit path continued to emit the same errors. |
| Exact reproduction steps | 1. Open a clean visitor session. 2. Navigate to staging `/`. 3. Wait for the Elfsight launcher. 4. Inspect the console and open the support control. |
| Reproduction consistency | Five errors per clean Chromium and WebKit load before repair; zero errors in final hosted Chromium, Firefox, and WebKit checks. |
| Root cause | `data-elfsight-app-lazy` exposed a vendor stylesheet teardown race. Elfsight AI Chatbot v1.31.1 also retained an incompatible Safari/WebKit rendering path after eager initialization. |
| Fix | Chromium and Firefox now initialize the full Elfsight assistant eagerly. Safari and iOS WebKit receive an accessible native support mail link instead of loading the incompatible vendor bundle. |
| Automated verification | `tests/landing-chat-support.test.mjs` covers browser selection and `tests/preview-regressions.test.mjs` prevents restoration of lazy initialization. Staging workflow `33789859140` passed the authoritative 397 application tests, 38 rules tests, typechecks, lint with zero errors, production builds, deployment, and health checks for commit `febfbf2002b294d1edb4dbd40deaa44ae821cb00`. |
| Hosted verification | Clean staging sessions exposed the full `Squad Assistant` dialog and `Write your message...` textbox in Chrome and Firefox. WebKit exposed one `Contact The Squad support` mail link and loaded zero Elfsight scripts. All three reported zero console errors; desktop and 390x844 checks had no horizontal overflow. |
| Status | RESOLVED |

## BUG-001 — Event deletion has no confirmation (resolved)

| Field | Evidence |
|---|---|
| Severity | P2 MEDIUM |
| Feature | Events — Event CRUD |
| Role | Anonymous Squad Pro demo coach/staff |
| Page or route | `/events` |
| Description | The destructive event delete control executes immediately and offers no confirmation or cancel opportunity. |
| Expected behavior | Clicking delete opens a confirmation dialog that identifies the event; only explicit confirmation deletes it. Cancel leaves it unchanged. |
| Actual behavior | One click on `Delete QA Audit Practice` removed the event immediately. |
| Exact reproduction steps | 1. Launch Squad Pro demo. 2. Open `/events`. 3. Create `QA Audit Practice` with a valid future date/time. 4. Reload and open the event. 5. Click `Delete QA Audit Practice` once. |
| Reproduction consistency | 1/1; deterministic code path confirmed |
| Browser | Chromium, desktop |
| Console evidence | No application error; deletion silently succeeds |
| Network evidence | Create action returned HTTP 200; delete completed without an intervening confirmation state |
| Likely code area | `src/app/(dashboard)/events/EventDetailDialog.tsx:306` directly calls `onDelete(event.id)` from the button |
| Related features | Schedule, attendance, RSVP, reminders, calendar views |
| Artifacts | `output/playwright/2026-08-21T232919Z/root-demo/event-before-delete.yml`, `event-after-delete.yml`, `pro-demo.trace` |
| Fix | The delete control now opens an `AlertDialog`; only its explicit `Delete Activity` action invokes deletion. |
| Verification | 2026-09-02 Chromium demo: opening Delete displayed the event-specific confirmation; Cancel left the event detail and event record visible. `tests/audit-regressions.test.mjs` covers the confirmation boundary. |
| Status | RESOLVED |

## BUG-003 — Verified zero-team Coach is redirected away from first-team creation (resolved)

| Field | Evidence |
|---|---|
| Severity | P1 HIGH |
| Feature | Signup/onboarding — Coach first-team creation |
| Role | Verified synthetic Coach owner in isolated staging |
| Page or route | `/verify-email`, `/teams/new`, `/teams/join` |
| Description | The server account-admission policy treated every non-independent account with no team as a join-only user. It therefore overrode the Coach signup destination and redirected an already-verified Coach from `/teams/new` to `/teams/join`. |
| Expected behavior | A verified Coach with no squad reaches the first-team creation form; ordinary no-team member accounts continue to land at `/teams/join`. |
| Actual behavior | The stored staging profile had role `coach`, but direct `/teams/new` navigation consistently ended at `/teams/join`. |
| Exact reproduction steps | 1. Create a synthetic Coach account in staging. 2. Complete the branded verification email. 3. Navigate to `/teams/new`. 4. Observe the Join & Invite page instead of the Launch Squad form. |
| Reproduction consistency | 2/2 direct navigations before the fix; fixed route verified after deployment. |
| Browser | Chromium staging session |
| Console evidence | No application errors or warnings. |
| Network/state evidence | Server-side staging profile lookup confirmed role `coach`; the admission policy returned `/teams/join` solely because no active squad existed. |
| Root cause | `src/lib/account-session-policy.ts` only exempted independent authorities before applying the no-squad `/teams/join` fallback; `coach` was omitted. |
| Fix | Coach profiles now receive the trusted `/teams/new` admission destination before the no-squad fallback. The validated browser-session destination allowlist accepts that internal route. |
| Verification | Regression tests first failed with `/teams/join`, then passed with `/teams/new`; targeted policy suite passed 52/52, TypeScript check passed, and lint completed with 0 errors (existing warnings only). Staging build `build-2026-09-03-001` deployed commit `141edfbd88c88dab9a605049c27a0932308de3ff`; the same verified Coach reached the Launch Squad form at `/teams/new` without creating a team. |
| Status | RESOLVED |

## BUG-004 — Staging Connect webhook endpoint cannot deliver required event coverage (resolved)

| Field | Evidence |
|---|---|
| Severity | P1 HIGH |
| Feature | Stripe Connect — payment webhook processing |
| Role | Provider / isolated Stripe test account |
| Page or route | `/api/stripe/connect/webhook` |
| Description | The enabled staging Connect endpoint did not produce a receipt for a real connected-account event and its selected event list omitted the payment-failure case handled by the application. |
| Expected behavior | Stripe test-mode connected-account events reach the staging handler with a valid signature, complete once, and are safe to replay. |
| Actual behavior | The previous endpoint never created a `stripeConnectWebhookEvents` ledger record for a real connected-account `payment_intent.created` event, even though the deployed handler accepted a correctly signed event directly. |
| Exact reproduction steps | 1. Create an isolated Stripe test connected account. 2. Create an unconfirmed CAD PaymentIntent on that account. 3. Wait for delivery. 4. Query the staging Connect ledger using the event ID. 5. Observe no receipt from the prior endpoint. |
| Reproduction consistency | 1/1 connected-account delivery before repair; post-repair `payment_intent.created` and `payment_intent.payment_failed` each completed once. |
| Browser | Stripe test API and staging service verification; no production account, payout, or card used. |
| Console evidence | No application error required to reproduce; invalid-signature negative checks returned the expected HTTP 400. |
| Network/state evidence | Standard and Connect invalid signatures returned HTTP 400. A direct valid signed Connect event completed once and replay returned the duplicate acknowledgment. The replacement endpoint recorded actual connected-account created and failed events as `completed` with one attempt. |
| Root cause | The existing endpoint configuration was not a valid current Connect event destination and did not cover the handler's payment-failure path. Its signing configuration could not be certified from provider delivery evidence. |
| Fix | Created one new Stripe test-mode Connect endpoint subscribed to the supported Connect event set, securely updated `STRIPE_CONNECT_WEBHOOK_SECRET` in staging, deployed App Hosting build `build-2026-09-03-002`, verified signed delivery, then disabled only the superseded Connect endpoint. |
| Verification | Staging revision `studio-build-2026-09-03-002` is ready and returns HTTP 200. Standard endpoint remains enabled. The replacement Connect endpoint is enabled; the old Connect endpoint is disabled. |
| Status | RESOLVED |

## BUG-005 — Chat messages do not notify Android and installed app shows Schedule identity (resolved on Android)

| Field | Evidence |
|---|---|
| Severity | P1 HIGH |
| Feature | Team Chat notifications and PWA installation |
| Role | Active team member on Android; cross-platform Home Screen user |
| Page or route | `/chats/[chatId]`, `/api/teams/chat/message`, `/settings`, `/manifest.json`, `/sw.js` |
| Description | A physical Android test initially received no notification after another member sent a live chat message. After the awaited-delivery repair, the device produced an audible notification and visible notification card while the PWA remained open, but not when it was closed. A later v3 worker/icon retest still produced no closed-app card or dot and still showed inset launcher artwork; the message continued to persist and sync into chat. |
| Expected behavior | Other active channel members receive one background notification; the sender does not. Android and iPhone/iPad install The Squad with the Squad icon and open the dashboard. |
| Actual behavior | Before repair, the original chat write completed without notification fan-out; the first repair could be terminated after its response. After awaited delivery, foreground/open-PWA notification worked but closed-app delivery did not. The earlier launcher declarations also allowed Android to select a legacy `any` icon and place it inside a white adaptive-icon container. After the final repair, a closed Android PWA received the real cross-account chat notification, displayed its launcher dot, and opened the correct chat when tapped; a clean reinstall displayed the full-size adaptive Squad icon. |
| Reproduction consistency | The user reproduced the missing closed-app notification and inset icon across multiple deployed candidates. On final staging, the same Android device received all three requested real-chat signals—notification card, launcher dot, and correct tap-through—and then confirmed the full-size launcher icon after clearing the staging site record and reinstalling through Chrome's app-install flow. |
| Root cause | Sanitized staging inspection found notifications enabled with three FCM records, two expired and one provider-valid, but zero standards Web Push registrations. Browser delivery remained coupled to Firebase even though a standards worker/server path existed, and default Web Push urgency did not reliably wake the closed Android browser. Separately, split `any` and `maskable` manifest entries let this Android/Chrome combination choose the legacy `any` launcher candidate, which Android wrapped in white. |
| Fix | Commits `514f8fa1` and `c7273ba1` make standards Web Push the sole browser/PWA transport, retry incomplete migrations, clear legacy FCM records, replace the prior PushSubscription, and retain one root worker. Commit `9ffefcd2` sends chat alerts with one-hour TTL and high urgency. Commits `0d8884a3` and `0603a110` route opaque full-bleed v5 art through every icon discovery path and expose only 192/512 launcher candidates whose purpose is `any maskable`; worker cache v9 forces refresh. Sender exclusion, active-membership resolution, click-through handling, and the monochrome notification badge remain. |
| Automated verification | Local authoritative `npm run verify` passed 421 application tests, 38 Firestore/Storage rules tests, typecheck, lint with zero errors, the app production build, and the Functions build. Protected staging workflows `33883494833`, `33886109438`, `33895799933`, and `33897636996` passed their exact verification/deployment chains. No-cache health reported final revision `studio-build-2026-09-04-010`; its manifest exposes only two opaque full-bleed `any maskable` icons and its v9 worker uses the v5 notification icon. |
| Remaining acceptance | The observed Android defect is resolved. Strict coverage still requires physical opt-out, denied-permission, stale-subscription cleanup, logout/user-switch privacy, sender-exclusion and broader targeting checks, plus install/update/push/tap acceptance on iPhone/iPad. These remain explicit matrix blockers and do not reopen the Android implementation defect. |
| Status | RESOLVED — PHYSICAL ANDROID CLOSED-APP PUSH, TAP, DOT, AND ADAPTIVE ICON ACCEPTED |

## BUG-002 — Sports Hub header search collapses at tablet width (resolved)

| Field | Evidence |
|---|---|
| Severity | P2 MEDIUM |
| Feature | Sports Hub — browse/search |
| Role | Visitor |
| Page or route | `/sports-hub` |
| Description | At 768×1024, the global Sports Hub header search shrinks to roughly 94 px and clips its placeholder to a single `S`. |
| Expected behavior | The primary search control remains visibly identifiable and usable at the representative tablet viewport. |
| Actual behavior | Fixed adjacent header actions compress the search until its text affordance is materially clipped. |
| Exact reproduction steps | 1. Open a fresh visitor session. 2. Resize to 768×1024. 3. Navigate to `/sports-hub`. 4. Inspect the header search control. |
| Reproduction consistency | 1/1 at 768×1024; wider desktop and mobile layouts did not show the same symptom |
| Browser | Chromium |
| Console evidence | 0 errors, 0 warnings |
| Network evidence | 0 unexpected failures; page and assets loaded successfully |
| Likely code area | `src/components/sports-hub/SportsHubClientLayout.tsx` search container and `SearchBar.tsx` |
| Related features | Sports Hub navigation, article/resource discovery, responsive header |
| Artifacts | `output/playwright/2026-08-21T232919Z/public-content/sports-hub-tablet-768x1024.png` and public-content trace |
| Fix | The persistent input is deferred from `md` to `lg`; a named compact search button is visible from mobile through tablet widths. |
| Verification | 2026-09-02 Chromium at 768×1024: `Search Sports Hub` is a visible named control in the header and no clipped header field is present. `tests/audit-regressions.test.mjs` covers the breakpoint contract. |
| Status | RESOLVED |
