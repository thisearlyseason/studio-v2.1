# Phase 7 Hosted Fixture Environment

- Current status: `HOSTED RUN COMPLETE WITH PRODUCT FINDINGS; MANIFEST RESOURCES AND CREDENTIALS REMOVED`
- Operator alias: `phase7-task4-hosted`
- Original attempt window (UTC): `2026-08-24T15:00:30Z`–`2026-08-24T15:02:16Z`
- First resumed attempt window (UTC): `2026-08-24T15:11:54Z`–`2026-08-24T15:13:20Z`
- Authorized hosted attempt start (UTC): `2026-08-24T15:43:10Z`
- Authorized hosted attempt end (UTC): `2026-08-24T16:50:09Z`
- Release status: `NOT READY`

## Immutable scope

| Check | Sanitized result |
| --- | --- |
| Original Task 4 starting SHA | `d84efc61dec9fd10d954b7c9376bdc2e2d65d55f` |
| Adapter repair | `75be64e49930359b8c29ff988ab614f3c9f6b090` (`fix: normalize fixture admin namespace`) |
| Fixture correction under review | `e216cf91d5817c61f1c617e2e75491208877bcf4` (`fix: align fixture assistant and roster fields`) |
| Authorized hosted-attempt starting SHA | `ed8728b76dea28af19b418317c8bf25f17f12ae0` |
| Historical evidence commits | `7f7335ddb1bff01082772bd86872b72368f8b390`, `ed8728b76dea28af19b418317c8bf25f17f12ae0` |
| Branch | `agent/phase7-staging-fixture-foundation` |
| Workspace | Linked worktree `.worktrees/phase3-root-cause-repair`; clean at authorized-attempt start |
| Firebase project | `the-squad-v2-staging`, independently resolved by Firebase Admin before any client or write |
| App Hosting backend | `studio` |
| Canonical origin | `https://studio--the-squad-v2-staging.us-east4.hosted.app` |
| Last independently proven deployed SHA | `658d3ca89f3cabf6c55800400aa17bc72229c1af`, carried from the Phase 5 protected-deployment record; Task 4 did not infer a newer deployed SHA |
| Playwright prerequisite | `npx` available; bundled Playwright CLI `0.1.18`; system Chrome used with new named contexts |

Production, provider sandboxes, real users, deployment state, and customer records remained out of scope and untouched. No credential, token, cookie, private key, or secret environment value was inspected or printed.

## Historical guard evidence

The first attempt failed before project resolution because the installed CommonJS-shaped `firebase-admin` namespace was not normalized. Repair `75be64e49930359b8c29ff988ab614f3c9f6b090` corrected that QA adapter integration. The historical `BUG-005` draft is therefore retired as a resolved QA-harness defect and is not a product-ledger candidate.

The first resumed attempt then proved the later safety gate: the available Application Default Credentials resolved a non-staging identity, so the command stopped before clients, writes, credentials, or browser contexts. The non-staging ID was not disclosed or overridden. Both historical external temporary workspaces were removed by their handlers.

## Authorized hosted preflight

The authorized attempt began in another brand-new `mktemp -d` workspace outside the repository. The workspace and raw directory were both mode `0700`; the lifecycle handler was armed before the read-only command. The exact command and confirmations were unchanged:

```text
ALLOW_STAGING_QA_FIXTURES=true npm run qa:fixtures:preflight -- \
  --project the-squad-v2-staging \
  --confirm-project the-squad-v2-staging \
  --origin https://studio--the-squad-v2-staging.us-east4.hosted.app
```

Sanitized exit-0 result:

```json
{"command":"preflight","projectId":"the-squad-v2-staging","origin":"https://studio--the-squad-v2-staging.us-east4.hosted.app","plannedAliases":9,"plannedTeams":2,"safe":true}
```

This was an independent exact-project resolution, not an environment override. Only after that result did Task 4 construct hosted Auth/Firestore clients and seed the isolated fixture.

## Local and browser prerequisites

The adapter repair was independently reviewed before resumption and the fixture-safety, production-environment, and repository-hygiene set passed `52/52`. The repository-supported runner is `node --import tsx --test`; a literal bare-Node attempt had previously demonstrated only the known TypeScript-alias loader difference. Task 4 made no product, fixture, dependency, configuration, deployment, or provider patch.

The browser run used system Chrome through the bundled CLI, fresh contexts, snapshots before reference-based interaction, event-based waits, and `390×844` plus `1440×900` viewports. Thirty-eight named contexts were opened: 32 produced final scenario evidence, two were prerequisite/workflow probes, and four were discarded while correcting temporary evidence-helper assumptions. Every named context was closed before lifecycle cleanup.

## Artifact boundary

The external credential file was created mode `0600`. Its values were read only inside redirected browser-fill helpers and never emitted. Raw snapshots, CLI logs, storage state, console/network transcripts, and credential-bearing state stayed in the mode-`0700` external workspace. Only the sanitized counts, paths, booleans, statuses, aliases, and defect reproductions in this run directory are eligible for commit. The validated credential helper returned `removed=true`; exact manifest absence was `authPresent=0`, `firestorePresent=0`. The finally handler completed and the exact private workspace path, including all raw artifacts, is absent.

## Fix round 1 environment addendum

The fixture-correction review at `e216cf91d5817c61f1c617e2e75491208877bcf4` triggered a complete fresh hosted lifecycle. Its exact staging preflight independently resolved `the-squad-v2-staging`, seed/inspect proved `9` Auth users and `40` Firestore paths, and the canonical browser ledger contains `32` unique contexts with exact group arithmetic `2,6,4,6,2,2,2,2,6`. Every context armed page-error, application-console, request-failure, and response listeners before its first staging navigation. Page-error state is known for every row; `NOT CAPTURED=0`.

One temporary fix-round attempt stopped after eight passing pre-transition contexts because its external harness invoked a nonexistent npm script for the supported transition command. Staging remained at the active baseline and that attempt was exactly cleaned (`9` Auth, `40` Firestore, retained `0`, independent absence `0/0`, credential removed). The complete retry used the supported direct CLI transition interface. A later self-review caught that the first desktop multi-org row had not actually invoked the desktop switcher; after the complete retry was already clean, an authorized targeted lifecycle calibrated the fresh desktop control and replaced only that row with passing evidence. The targeted lifecycle was independently preflighted, seeded/inspected, browser-verified, and exactly cleaned.

The complete retry cleanup deleted `9` Auth plus the `39` Firestore documents remaining after the removed-member transition; the targeted cleanup deleted `9` Auth plus `40` Firestore documents. Both retained `0`, both independently proved `authPresent=0` and `firestorePresent=0`, and both credential files were removed by the validated helper. All raw/private workspace paths are absent. No product, fixture, dependency, deployment, provider, or production change was made by Task 4.
