# Phase 8 Staging Deployment

- Environment: isolated Firebase project `the-squad-v2-staging`
- Canonical origin: `https://studio--the-squad-v2-staging.us-east4.hosted.app`
- Application revision: `b495b4eafe5fd9caf6e04c4cf5500a2b6d0baf97`
- GitHub Actions run: [`32806782497`](https://github.com/thisearlyseason/studio-v2.1/actions/runs/32806782497)
- Result: `PASS`

The protected staging workflow ran against the exact reviewed Phase 8 revision. Its repository verification, staging-configuration validation, App Hosting ownership check, Firestore index deployment, Functions deployment, Firestore/Storage rules deployment, App Hosting rollout, and staging health check all completed successfully. The deployment record identifies the `staging` environment and is explicitly non-production.

No production project, backend, data, credential, deployment, or customer resource was read or changed.
