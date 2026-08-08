# QA Test Results

Audit date: 2026-08-08
Release candidate: `agent/fix-login-spinner` working tree
Test environment: local Next.js server backed by isolated Firebase project `the-squad-audit-preview`

No payment was finalized. Production infrastructure and the web release were deployed after certification; no production customer data was mutated.

## Automated release gates

| Test / check | Actual | Result |
|---|---|---|
| `npm run typecheck` | No TypeScript errors | PASS |
| `npm test` | 233/233 tests passed | PASS |
| `npm run test:rules` | 29/29 Firestore and Storage emulator tests passed | PASS |
| `npm run lint` | Exit 0; warning debt remains | PASS WITH DEBT |
| `npm run build` | Next.js production build passed; 308 routes | PASS |
| `npm --prefix functions run build` | Cloud Functions TypeScript build passed | PASS |
| Root production dependency audit | 0 vulnerabilities | PASS |
| Functions production dependency audit | 0 vulnerabilities | PASS |
| Workflow YAML parsing | All three workflows parsed | PASS |
| `git diff --check` | No whitespace errors | PASS |

## Browser and API certification

| Area | Coverage | Result |
|---|---|---|
| Demo personas | Starter, Squad Pro, Elite Org, School, Player, Parent, and Free League Creator | PASS |
| Authenticated modules | Dashboards, organization hubs, role guards, feed CRUD/polls, events, drills, practice templates, chats, waivers, leagues, tournaments, volunteer tools, settings, billing, and pricing | PASS |
| Public routes | 35 signup, legal, audience, Sports Hub, and embed routes returned HTTP 200 | PASS |
| Dynamic public data | League, tournament/spectator, fundraiser, recruiting profile, and volunteer portal | PASS |
| Protected APIs | Unauthenticated requests uniformly returned HTTP 401 | PASS |
| Invalid public requests | Controlled HTTP 400/404; oversized request returned HTTP 413 | PASS |
| Payment boundary | Pricing and checkout preflight exercised; preflight rejected before session creation and no payment state was created | PASS |
| Responsive UI | Signup, Squad Pro dashboard, Parent Family Hub, and Player dashboard at 390x844 with no horizontal overflow | PASS |
| Idempotency | Repeated volunteer signup returned the same signup ID | PASS |

Screenshots and Playwright artifacts are stored under `output/playwright/` and are intentionally not part of the release commit.

## Defects found and repaired

- Removed the broken Tenor GIF integration and hardcoded API key.
- Added visible validation for event, poll, practice-template, league, and tournament forms.
- Prevented demo workspaces from sending external event, document, and drill notifications.
- Resolved notification and email recipients by member document ID or canonical `userId`.
- Repaired chat parameters access and added accessible names to chat and drill icon controls.
- Added collection-group indexes for `signatures.userId` and `signatures.teamId`.
- Repaired the public volunteer portal request race and seeded a valid shareable fixture.
- Removed Google AI/Gemini, Straico, highlight-generation, and Google Calendar OAuth code. Calendar integration now uses a server-issued ICS feed and requires no `GOOGLE_REDIRECT_URI`.

## Post-deployment verification

- The guarded production workflow `31265002674` passed its release gate, authenticated through production GitHub OIDC, deployed indexes, Functions, and rules, and verified the calendar endpoint.
- Production Firebase now exposes exactly the expected ten Functions; retired Google Calendar/event-sync Functions are absent.
- Production Firestore now matches `firestore.indexes.json` with no missing composite indexes or field overrides.
- Vercel production deployment `dpl_F1fhzsL5nC4KVUKvxgfAeutFkU34` is Ready and serves revision `eb06d75957ffae9324de737f36e684262c5f0dcb`.
- Vercel contains every required production variable name. Sensitive values remain intentionally undisclosed; the successful protected build and live smoke checks confirm the deployed runtime is serving the release.
- Stripe signed-webhook lifecycle tests, real Resend delivery, FCM device delivery, and cross-browser/device testing require provider-controlled test credentials and devices. Payment completion remains explicitly excluded from this certification.
