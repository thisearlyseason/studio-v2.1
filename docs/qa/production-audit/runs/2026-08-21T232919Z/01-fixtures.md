# Phase 2 Fixture Record

Available safe fixtures:

- Anonymous Squad Pro coach demo with synthetic `Apex Demo Squad` data.
- A separate anonymous Player demo with synthetic `Strikers` data.
- Disposable demo event `QA Audit Practice`, created and deleted during the run.
- Firestore and Storage demo-project emulator fixtures used by the 38 rules tests.

Only opaque role/team descriptions are retained here; credentials, tokens, cookies, full UIDs, and action links are excluded.

Unavailable fixtures are the durable identity, tenant, provider, device, and lifecycle set listed in `06-test-account-requirements.md`. The preview environment supports anonymous demo writes, but it does not contain enough authorized account relationships for exhaustive owner/staff/parent/player/superadmin or cross-tenant browser proof.
