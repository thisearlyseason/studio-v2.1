# Phase 9 isolated staging deployment

## Deployment linkage

| Field | Value |
| --- | --- |
| Staging project | `the-squad-v2-staging` |
| Canonical staging origin | `https://studio--the-squad-v2-staging.us-east4.hosted.app` |
| Deployed application SHA | `1e16cbfe0d662865805680af2b4bfa4740982653` |
| GitHub Actions run | [32848286368](https://github.com/thisearlyseason/studio-v2.1/actions/runs/32848286368) |
| Result | `success` |

## Successful staging gates

- Repository checkout and Node/Java setup
- Application and Functions dependency installation
- Full `npm run verify`
- Staging configuration validation
- Workload authentication
- App Hosting target-ownership validation
- Firestore index deployment
- Functions deployment
- Firestore and Storage rules deployment
- Exact-commit App Hosting rollout
- Staging health verification

The protected staging workflow completed successfully for the deployed application SHA above. Production was not accessed, changed, or deployed. This evidence records the deployed application commit; the documentation-only evidence commit that follows is not deployed.
