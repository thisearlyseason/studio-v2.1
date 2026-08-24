# Phase 5 Isolated Staging Deployment

**Tester alias:** `phase5-task2-deploy-smoke`

**Recorded (UTC):** `2026-08-24T12:00:14Z`

**Source branch:** `agent/phase5-staging-readiness`

**Exact deployed SHA:** `658d3ca89f3cabf6c55800400aa17bc72229c1af`

## Authorized target

| Setting | Exact value |
| --- | --- |
| Firebase project | `the-squad-v2-staging` |
| App Hosting backend | `studio` |
| Staging origin | `https://studio--the-squad-v2-staging.us-east4.hosted.app` |

No production project, backend, origin, data, configuration, or deployment was accessed or changed.

## Exact-SHA release gate

The clean Phase 5 branch was pushed with:

```bash
phase5_sha="$(git rev-parse HEAD)"
test "$phase5_sha" = "658d3ca89f3cabf6c55800400aa17bc72229c1af"
git push -u origin agent/phase5-staging-readiness
gh run watch 32721982132 --repo thisearlyseason/studio-v2.1 --exit-status
```

Release gate: https://github.com/thisearlyseason/studio-v2.1/actions/runs/32721982132

| Field | Result |
| --- | --- |
| Run ID | `32721982132` |
| Created | `2026-08-24T11:27:50Z` |
| Completed | `2026-08-24T11:31:32Z` |
| Head SHA | exact match |
| Dependency audit (`97415138803`) | PASS |
| App checks (`97415139003`) | PASS |
| Firebase rules (`97415139046`) | PASS |
| Functions build (`97415139087`) | PASS |

## Protected staging rollout

The rollout was dispatched with:

```bash
gh workflow run deploy-staging.yml --repo thisearlyseason/studio-v2.1 --ref agent/phase5-staging-readiness
gh run watch 32722312601 --repo thisearlyseason/studio-v2.1 --exit-status
```

GitHub initially placed the `Verify and deploy staging` job in `waiting` for the protected `staging` environment. The tester stopped without approving or bypassing the protection. The user later confirmed the required approval, after which the exact same run completed successfully.

Deployment: https://github.com/thisearlyseason/studio-v2.1/actions/runs/32722312601

| Field | Result |
| --- | --- |
| Run ID | `32722312601` |
| Job ID | `97416145895` |
| Created | `2026-08-24T11:31:47Z` |
| Job started after approval | `2026-08-24T11:35:15Z` |
| Completed | `2026-08-24T11:44:26Z` |
| Head SHA | exact match |
| Complete run conclusion | PASS — `success` |

The workflow's checkout, Node/Java setup, dependency installs, full `npm run verify`, staging configuration validation, Google authentication, App Hosting target-ownership check, Firestore index deployment, Functions deployment, Firestore/Storage rules deployment, exact-commit App Hosting rollout, and staging health verification all completed successfully.

## Independent post-rollout health and protection

Executed at `2026-08-24T11:46:17Z`:

```bash
curl --fail --silent --show-error --max-time 20 \
  https://studio--the-squad-v2-staging.us-east4.hosted.app/api/health
curl --silent --show-error --max-time 20 -o /dev/null \
  -w '%{http_code} %{redirect_url}\n' \
  https://studio--the-squad-v2-staging.us-east4.hosted.app/dashboard
```

- `/api/health`: PASS — sanitized fields were `status=ok` and `service=the-squad-web`.
- Anonymous `/dashboard`: PASS — HTTP `307` to `/login?reason=expired&returnTo=%2Fdashboard` on the same staging origin.
- The browser replay independently confirmed both `/dashboard` and `/admin` ended at `/login` with the `Sign In` heading and no protected dashboard shell.

## Safety and release status

The rollout and verification used only the isolated staging target. There was no email or notification delivery, push registration, payment/Stripe action, provider endpoint mutation, destructive lifecycle action, credential discovery, registered identity, or provider playback attempt.

**Release status remains: NOT READY.** This is isolated staging evidence only and does not clear the previously blocked production-audit contracts.
