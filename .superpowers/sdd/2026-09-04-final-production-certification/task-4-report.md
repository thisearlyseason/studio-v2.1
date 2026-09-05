# Task 4 Report: Tenant and Family Certification Batch

## Result

Task 4 owns exactly the 16 frozen tenant/family scenarios. The immutable local
Chrome run `final-cert-t4-260905-162439-71a0` executed implementation commit
`f9ebd7e4ef84ea581e6714333616a9a75da66783`: 16 scenarios, 176/176 required
case records observed, zero failed cases, zero run errors, and zero missing
local dimensions. Cleanup was `OBSERVED` with 301 measured deletions, 31
verified restorations, and zero retained audit records.

Every row remains `BLOCKED`, not `PASS`, pending execution on the exact staging
revision. Youth activation additionally needs approved QA mailbox delivery and
receipt. The run used only loopback Firebase emulators and the local Next
server; production remained read-only and no provider call was made.

## Scenario Workflows

- Team creation uses the real route with fresh coach, organization-admin, and
  league-creator identities; validates server-derived ownership/projections,
  capacity and concurrent boundaries, rejects type/owner/plan tampering, and
  verifies persistence and dynamic cleanup.
- Join-by-code uses public preview and authenticated POST flows, a two-party
  linked-child race, inactive-current-state denial, wrong-guardian denial,
  accountless child preservation, digest/session persistence, and exact
  overlay restoration.
- Team settings performs owner edits plus Firebase Storage upload, replace, and
  delete with type/authority denials. Module visibility toggles all eight
  application module keys and checks hidden navigation and direct-route denial
  in both viewports.
- Seasonal reset runs only on a fresh sacrificial team. Selected and complete
  resets prove category isolation, active-team-only removal, durable retry,
  concurrent companion-team preservation, primary-team reconciliation,
  Storage cleanup, and root/owner preservation.
- Organization overview refreshes after a constituent change. Squad allocation
  releases and reallocates a real seat while preserving organization authority.
  Waiver/admin flows use consumer-valid master/copy documents, real APIs,
  exact staff authority, guardian participant signing, and outsider denials.
- Roster workflows cover remove/reinstate projections, accented and removed
  search, actual CSV download, and guardian/player self-view boundaries.
- Recruiting workflows edit profile, metrics, contact, and video data; enforce
  tenant/privacy boundaries; and drive hidden-active-committed-hidden public
  transitions through the canonical editor while recursively allowlisting
  public media.
- Family workflows edit and refresh two child cards, reconcile schedule/waiver/
  payment consumers, bind guardian signatures to the child participant, and
  activate a distinct youth Auth identity. The activated youth opens and
  refreshes its own roster view at 1440x900 and 390x844.

## Product Defects Repaired

- **BUG-032:** the compatibility youth-invite endpoint now delegates all methods
  to the canonical Family contract.
- **BUG-033:** recruiting status has one canonical writer and preserves the
  committed state.
- **BUG-034:** inactive code-only preview and POST paths recheck current squad
  state, including at the transaction boundary.
- **BUG-035:** reset categories are server-scoped; complete reset durably
  reconciles only the active team's members, user/player projections, primary
  team, descendants, and Storage.
- **BUG-036:** guardian-managed child enrollment preserves the child's separate
  identity until youth activation.
- **BUG-037:** public video segments are recursively projected onto a bounded
  field allowlist.
- **BUG-038:** a guardian can no longer write a privileged coach waiver
  signature; staff signatures and guardian participant signatures now use
  separate exact schemas and authority paths.
- **BUG-039:** releasing an organization squad seat retains the organization
  association needed for a legitimate owner to reallocate the squad.

The exact runs also exposed audit defects in fail-fast propagation, combined
batch continuation, duplicate case ownership, Storage upload protocol, global
waiver copy counting, youth route selection, pending-waiver modal settlement,
fixture consumer validity, dynamic-resource cleanup, and race cancellation.
Each was reproduced, covered by a regression, repaired at its root, and
retested through the affected route/helper/browser flow.

## Safety, Evidence, and Cleanup

Preflight validates persisted consumer roots and relationships before mutation.
The mutation layer rejects client identity/authority fields and non-demo
projects. Evidence is bound to the runtime actor, target, operation, request,
batch artifact root, and cleanup reference; prohibited UID/token field variants
are rejected.

Server-created Auth, Firestore, member/user, invitation, Storage, browser
session, process, and artifact resources are registered before mutation or by
run-scoped discovery through ambiguous responses. Cleanup verifies roots and
descendants recursively, preserves original and restoration diagnostics,
retries retained obligations, and reports exact measured results. Two-party
races propagate cancellation and cannot return while an owned callback remains
live.

## Verification

- Focused tenant/regression suite: 272 passed, 0 failed.
- Full application suite: 661 passed, 0 failed.
- Firestore/Storage rules suite: 42 passed, 0 failed.
- `npm run typecheck`: exit 0.
- `npm run build`: exit 0.
- Full 16-row no-browser batch: exit 0.
- Focused youth browser regression after the modal-race repair: exit 0;
  cleanup 299 deleted / 1 restored / 0 retained.
- Immutable Chrome batch: `final-cert-t4-260905-162439-71a0` on
  `f9ebd7e4ef84ea581e6714333616a9a75da66783`; 176/176 cases observed, 0
  failures, 0 run errors, 0 missing local dimensions; cleanup 301 deleted / 31
  restored / 0 retained.
- `git diff --check`: exit 0 before evidence finalization.

## Remaining External Gates

1. Deploy the exact implementation commit to the authorized staging companion
   and repeat the 16 rows with disposable run-prefixed data and exact cleanup.
2. Observe approved mailbox delivery and receipt for the youth invitation.
3. Keep production read-only. Stripe/provider and physical-device work remains
   owned by later certification batches and is not inferred here.
