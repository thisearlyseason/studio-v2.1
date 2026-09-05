# Task 4 Report: Tenant and Family Certification Batch

## Result

Task 4 owns exactly the 16 frozen tenant/family scenarios and now executes the
complete machine-enforced local case contract: two happy-path, two negative,
two permission, two persistence, one console, one network, and one responsive
case per scenario. The shared runner supports tenant-only and ordered combined
identity-plus-tenant execution, batch-contained artifacts, structured nonzero
summaries, fail-fast propagation, and continuation when fail-fast is disabled.

The immutable Chrome run `final-cert-t4-260905-145016-d6da` executed candidate
`d191d1116df1052ad17bd5ce59ab66521710c508`: 16 scenarios, 176/176 required
case records, zero failed cases, zero run errors, and zero missing local
dimensions. Cleanup was `OBSERVED` with 304 measured deletions, 17 verified
restorations, and zero retained audit records.

The coverage rows remain `BLOCKED`, not
`PASS`, because the exact candidate still requires the authorized staging
companion. Youth login additionally requires approved mailbox receipt. No
production data was read or mutated, and no outbound provider call occurred.

## Product and Journey Work

- Team creation uses the real server route and a fresh identity. It verifies
  server-derived ownership plus team/member/user projections, invalid-type and
  owner-field tampering denial, persistence, and exact dynamic cleanup.
- Team join exercises public resolution, concurrent guardian-managed child
  POSTs, one resulting roster row, preserved accountless child identity,
  guardian projection, inactive-current-state denial without a write, wrong
  guardian denial, digest-bound session persistence, and overlay restoration.
- Public recruiting exercises hidden-active-committed-hidden transitions on the
  same URL, no-store behavior, private Firestore denial, companion-tenant
  contrast, recursive public allowlisting, and the real public page.
- Youth login creates a guardian-owned invite, compares canonical and
  compatibility routes, denies the wrong guardian and modified token, redeems
  into a distinct youth Auth identity, verifies player/member/user projections,
  denies reuse, and restores the accountless baseline.
- Seasonal reset creates a fresh sacrificial graph and Storage object. A
  games-only reset preserves events, roster, files, Storage, squad root, and
  owner controls; invalid scope and outsider calls return 400/403; complete
  reset removes exact descendants and membership projections while preserving
  root/owner state. Cleanup is retryable and exact.
- The remaining eleven rows use their real application consumer roots and
  named personas through Firestore rules, perform an authorized lifecycle
  mutation with Admin reconciliation, deny anonymous/malformed and named
  companion-tenant access, prove reload stability, and restore every before
  image through registered overlays. Their exact product routes render at
  1440x900 and 390x844 with case-owned console/response capture.

## Defects

- **BUG-032:** the duplicate youth-invite implementation now delegates GET,
  POST, and PUT to the canonical Family contract. Live local route equivalence,
  create/redeem/reuse, and identity projection checks pass.
- **BUG-033:** canonical recruiting status has one writer; the compatibility
  flag no longer overwrites `committed`. Exact public transitions and reloads
  pass.
- **BUG-034:** inactive code-only GET and POST paths both recheck current squad
  state, including the transaction boundary. The denied POST creates no member.
- **BUG-035:** category-scoped reset no longer runs broad client deletion. The
  owner-authorized server boundary maps explicit categories and reconciles only
  the active squad's descendants, projections, and Storage.
- **BUG-036:** guardian child enrollment no longer assigns the parent's UID or
  login state to the child. A later youth invitation creates a distinct Auth
  identity.
- **BUG-037:** public recruiting video segments are recursively projected onto
  bounded, validated `start`, `end`, and `title` fields.

During implementation, exact local runs also exposed and repaired three audit
defects: Firestore before-image comparisons depended on object key order,
browser failures could collide with an existing network case ID, and a reset
route initialized Admin Storage without the configured emulator bucket. Each
was reproduced, root-fixed, regression-tested, and exactly rerun before the
candidate was frozen.

## Safety, Evidence, and Cleanup

Fixture capability checks run before mutation and validate referential consumer
paths, unique route-valid invitation codes, materialized destructive/storage
graphs, coherent organization/roster/family projections, and cleanup ownership.
The mutation helper rejects production/non-demo projects and refuses client
identity, ownership, entitlement, or demo-scope fields.

Every case artifact is run- and batch-contained and validated against its exact
actor, target, operation, dimension, cleanup reference, and sensitive-data
contract. Race helpers abort and settle both participants before returning.
Overlay restoration attempts and verifies every registered before-image and
retains failed obligations for final bounded retry. Dynamic Auth, Firestore,
Storage, process-group, browser-session, and artifact ownership remains exact.

## Verification

- Focused Task 4/regression suite: 90 passed, 0 failed.
- Full application suite: 644 passed, 0 failed.
- Firestore/Storage rules suite: 41 passed, 0 failed.
- `npm run typecheck`: exit 0.
- `npm run build`: exit 0 with existing repository warnings.
- Full 16-row no-browser batch: 144/144 server cases passed, followed by a
  focused successful retest after one fixture-name correction.
- Exact immutable Chrome batch: `final-cert-t4-260905-145016-d6da` on
  `d191d1116df1052ad17bd5ce59ab66521710c508`; 176/176 cases, 0 failures,
  0 run errors, 0 missing local dimensions, cleanup 304 deleted / 17 restored /
  0 retained.
- `git diff --check`: exit 0.

The tracked tenant run summary records the same immutable candidate and run.
Matrix rows stay blocked only for exact-revision staging, and the youth-mailbox
receipt dimension is separately identified rather than inferred from local
delivery.

## Remaining External Gates

1. Deploy the exact implementation candidate to the authorized staging
   companion and repeat all 16 rows with disposable, run-prefixed data and
   exact cleanup evidence.
2. Observe approved mailbox delivery and receipt for the youth invitation.
3. Leave production read-only. Stripe/provider lifecycle evidence remains owned
   by its later certification batch and is not inferred here.
