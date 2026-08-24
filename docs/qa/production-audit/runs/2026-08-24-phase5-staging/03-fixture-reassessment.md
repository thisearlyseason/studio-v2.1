# Phase 5 Fixture Reassessment

**Tester alias:** `phase5-task3-reconciler`\
**Assessment date:** `2026-08-24`\
**Evidence boundary:** committed Phase 4 inventory plus committed Phase 5 staging, deployment, health, and browser records only

## Assessment rule

`AVAILABLE` means an authorized, non-secret reference and the evidence needed for its stated scope are already present in the committed Phase 5 record. `NOT AUTHORIZED` means the fixture may exist, but this task received no authorization or opaque fixture reference for using it. `UNAVAILABLE` means the only reference is historical or the required tool/device/fixture is not present.

No credential discovery was performed. Historical labels, repository configuration, provider claims, secret names, and a successful deployment do not establish authorization to use an account, tenant, provider object, device, or destructive lifecycle.

## Hosted staging and operational references

| Reference | Status | Authorized scope and limitation |
|---|---|---|
| Hosted staging origin | AVAILABLE | The isolated staging origin is named in `00-environment.md` and was exercised in `01-deployment.md` and `02-public-smoke.md`; this does not authorize registered identities or provider actions. |
| Staging Firebase project and App Hosting backend | AVAILABLE | Project `the-squad-v2-staging` and backend `studio` ownership were validated by the protected workflow; production remains out of scope. |
| GitHub staging deployment identity | AVAILABLE | The protected staging workflow authenticated and passed the target-ownership check for this exact rollout; no credential value was inspected or retained. |
| Exact deployed application revision | AVAILABLE | SHA `658d3ca89f3cabf6c55800400aa17bc72229c1af` is tied to passing release-gate run `32721982132` and staging run `32722312601`. |
| Staging health and anonymous route boundary | AVAILABLE | `/api/health` passed and anonymous `/dashboard` and `/admin` reached the same-origin sign-in boundary. |
| Rules-drift comparison | UNAVAILABLE | The deployment succeeded, but no independent desired-versus-deployed rules-drift comparison is retained. |
| Backup/restore record | UNAVAILABLE | No authorized backup/restore execution or retained restoration evidence was supplied. |
| Rollback drill | UNAVAILABLE | No approved rollback target, authorization, execution, or evidence was supplied. |
| Least-privilege proof | UNAVAILABLE | Successful workflow authentication and target ownership do not prove the complete least-privilege contract. |

## Required identities

Every required durable identity remains outside the anonymous/public staging scope.

| Fixture | Status | Non-secret reason |
|---|---|---|
| `qa-coach-owner-a` | NOT AUTHORIZED | No authorized opaque registered-account reference was supplied. |
| `qa-coach-owner-b` | NOT AUTHORIZED | No authorized opaque registered-account reference was supplied. |
| `qa-pro-owner` | NOT AUTHORIZED | No authorized account or approved Stripe test fixture was supplied. |
| `qa-elite-owner` | NOT AUTHORIZED | No authorized opaque registered-account reference was supplied. |
| `qa-school-owner` | NOT AUTHORIZED | No authorized opaque registered-account reference was supplied. |
| `qa-school-delegate` | NOT AUTHORIZED | No authorized opaque registered-account reference or invite lifecycle was supplied. |
| `qa-league-owner-a` | NOT AUTHORIZED | No authorized account or approved Stripe test fixture was supplied. |
| `qa-league-owner-b` | NOT AUTHORIZED | No authorized opaque registered-account reference was supplied. |
| `qa-team-assistant` | NOT AUTHORIZED | No authorized opaque registered-account reference was supplied. |
| `qa-team-member` | NOT AUTHORIZED | No authorized opaque registered-account reference was supplied. |
| `qa-parent-a` | NOT AUTHORIZED | No authorized opaque registered-account reference was supplied. |
| `qa-parent-b` | NOT AUTHORIZED | No authorized opaque registered-account reference was supplied. |
| `qa-adult-player-a` | NOT AUTHORIZED | No authorized opaque registered-account reference was supplied. |
| `qa-adult-player-b` | NOT AUTHORIZED | No authorized opaque registered-account reference was supplied. |
| `qa-youth-invite` | NOT AUTHORIZED | No authorized linked guardian/player fixture or approved durable mailbox was supplied. |
| `qa-youth-active` | NOT AUTHORIZED | No authorized opaque registered-account reference was supplied. |
| `qa-superadmin` | NOT AUTHORIZED | No authorized claim-controlled account or disposable claim-management approval was supplied. |
| `qa-fake-superadmin` | NOT AUTHORIZED | No authorized ordinary-account comparison fixture was supplied. |
| `qa-unverified` | NOT AUTHORIZED | No authorized account or approved durable mailbox was supplied. |
| `qa-suspended` | NOT AUTHORIZED | No authorized suspended-account fixture was supplied. |
| `qa-removed-member` | NOT AUTHORIZED | No authorized removed-membership fixture was supplied. |
| `qa-pending-delete` | NOT AUTHORIZED | No authorized disposable identity or destructive lifecycle approval was supplied. |
| `qa-owner-delete-blocked` | NOT AUTHORIZED | No authorized disposable owner or destructive lifecycle approval was supplied. |
| `qa-multi-org` | NOT AUTHORIZED | No authorized account linked to two populated tenant fixtures was supplied. |
| `qa-public-submitter` | NOT AUTHORIZED | No approved synthetic dataset and safe delivery recipient were supplied. |
| `qa-demo-a` | NOT AUTHORIZED | The public selector was observed, but no durable isolated demo-session reference or data lifecycle authorization was supplied. |
| `qa-demo-b` | NOT AUTHORIZED | The public selector was observed, but no second durable isolated demo-session reference was supplied. |

## Subscription and tenant fixtures

| Fixture | Status | Non-secret reason |
|---|---|---|
| `billing-free` | NOT AUTHORIZED | No authorized disposable owner or confirmed billing-state reference was supplied. |
| `billing-trialing` | NOT AUTHORIZED | No authorized owner, Stripe test clock, or confirmed billing-state reference was supplied. |
| `billing-active-monthly` | NOT AUTHORIZED | No authorized owner or confirmed Stripe test subscription was supplied. |
| `billing-active-annual` | NOT AUTHORIZED | No authorized owner or confirmed Stripe test subscription was supplied. |
| `billing-past-due` | NOT AUTHORIZED | No authorized owner, Stripe test clock, or confirmed failed-invoice state was supplied. |
| `billing-canceled` | NOT AUTHORIZED | No authorized owner or confirmed canceled test subscription was supplied. |
| `billing-addon` | NOT AUTHORIZED | No authorized owner or confirmed add-on quantity fixture was supplied. |
| `billing-customer-deleted` | NOT AUTHORIZED | No destructive authorization or approved Stripe customer-deletion fixture was supplied. |
| Team A | NOT AUTHORIZED | No authorized opaque tenant reference or confirmed populated synthetic records were supplied. |
| Team B | NOT AUTHORIZED | No authorized opaque tenant reference or confirmed populated synthetic records were supplied. |
| Team C linked household | NOT AUTHORIZED | No authorized opaque tenant/household reference or confirmed populated synthetic records were supplied. |
| League/tournament cross-tenant records | NOT AUTHORIZED | No approved populated organizer, schedule, scoring, dispute, or permission fixtures were supplied. |
| Controlled unsafe/private Sports Hub asset set | NOT AUTHORIZED | No controlled unsafe URL plus authorized public/private cross-tenant asset-and-identity pair was supplied. |

## Provider and device fixtures

| Fixture | Status | Non-secret reason |
|---|---|---|
| Hosted Firebase application environment | AVAILABLE | The isolated application deployment and health are proven only for public/anonymous and operational checks already recorded. |
| Firebase Auth registered-account and claim administration | NOT AUTHORIZED | Hosted application availability does not authorize account use, account creation, claim mutation, or lifecycle testing. |
| Stripe test products, customers, cards, clocks, and webhooks | NOT AUTHORIZED | No approved opaque test objects or provider-action authorization was supplied. |
| Stripe Connect disposable account | NOT AUTHORIZED | No approved opaque connected-account reference or provider-action authorization was supplied. |
| Resend QA recipients and webhook | NOT AUTHORIZED | No approved safe recipient, signed-event fixture, or provider-action authorization was supplied. |
| FCM desktop Chrome profile | NOT AUTHORIZED | No approved registered profile, synthetic target identity, or device cleanup authorization was supplied. |
| FCM mobile-capable browser/device | NOT AUTHORIZED | No approved physical/mobile device reference was supplied. |
| RSS controlled feed set | NOT AUTHORIZED | No approved valid, malformed, slow, redirecting, duplicate, and unsafe-host feed fixture was supplied. |
| Calendar disposable client/raw HTTP fixture | NOT AUTHORIZED | No approved opaque client or scoped calendar-feed fixture was supplied. |
| Controlled allowed/wrong embed origins | NOT AUTHORIZED | Hosted staging is available, but no authorized paired origins and embed configuration were supplied. |
| System Chrome used for Phase 5 public replay | AVAILABLE | Authorized only for the retained anonymous/public staging replay; it does not establish a complete cross-browser or physical-device matrix. |
| Playwright Chromium engine | UNAVAILABLE | No compatible local cached engine was established by the committed evidence. |
| Playwright Firefox engine | UNAVAILABLE | No compatible local cached engine was established by the committed evidence. |
| Playwright WebKit engine | UNAVAILABLE | The previously discovered cached build was incompatible with the bundled CLI. |

## Destructive and historical fixtures

| Fixture | Status | Non-secret reason |
|---|---|---|
| Isolated destructive-test authorization | NOT AUTHORIZED | Staging deployment approval did not authorize account, tenant, provider, storage, scheduler, backup/restore, or rollback destruction. |
| `qa-pending-delete` lifecycle | NOT AUTHORIZED | Depends on the missing disposable identity and destructive authorization. |
| `qa-owner-delete-blocked` lifecycle | NOT AUTHORIZED | Depends on the missing disposable owner and destructive authorization. |
| `billing-customer-deleted` lifecycle | NOT AUTHORIZED | Depends on missing Stripe test objects and destructive authorization. |
| Historical label `parent-a` | UNAVAILABLE | Documentation names a historical label, not a confirmed authorized live account. |
| Historical label `adult-player-a` | UNAVAILABLE | Documentation names a historical label, not a confirmed authorized live account. |
| Historical label `coach-owner-a` | UNAVAILABLE | Documentation names a historical label, not a confirmed authorized live account. |
| Historical label `assistant-a` | UNAVAILABLE | Documentation names a historical label, not a confirmed authorized live account. |
| Historical label `school-owner-a` | UNAVAILABLE | Documentation names a historical label, not a confirmed authorized live account. |
| Historical label `league-owner-a` | UNAVAILABLE | Documentation names a historical label, not a confirmed authorized live account. |
| Historical label `superadmin-a` | UNAVAILABLE | Documentation names a historical label, not a confirmed authorized live account. |
| Historical label `outsider-b` | UNAVAILABLE | Documentation names a historical label, not a confirmed authorized live account. |
| Historical anonymous demos | UNAVAILABLE | Historical documentation does not prove a live, isolated, cleanup-owned fixture. |

## Consequence and next safe request

Hosted staging, exact-SHA deployment identity, backend ownership, health, and the anonymous route boundary are now available. They narrow several prior blocker reasons but do not complete any of the 86 fixture-bound row contracts. Operations remains blocked because the successful deployment and health check do not supply rollback, backup/restore, drift, and least-privilege evidence.

The next safe request is for fixture owners to supply authorized opaque references—not credentials—for the durable identity matrix, populated Team A/Team B/Team C datasets, controlled unsafe/private asset pair, provider sandboxes, allowed/wrong embed origins, FCM-capable devices, and disposable destructive/rollback authorization. Until then, no historical account or provider claim should be inferred or exercised.
