# Task 5 operations certification observations

- Local candidate runs: `1c547586`, `c8a71e90`
- Local environment: loopback Firebase emulators and local Next server
- Deployed scheduler run: `sched-cert-20260908-0416` in `the-squad-v2-staging`

| Scenario | Evidence run | Outcome | Observed dimensions | Remaining dimensions |
|---|---|---|---|---|
| `events-event-crud-recurrence` | `final-cert-t5-260906-032838-18f3` | OBSERVED | happyPath, negativePath, permission, persistence, console, network, responsive | exact-staging workflow |
| `events-rsvp-attendance-details` | `final-cert-t5-260906-033006-80fd` | OBSERVED | happyPath, negativePath, permission, persistence, console, network, responsive | exact-staging workflow |
| `attendance-practice-event-member-attendance` | `final-cert-t5-260906-033140-5e32` | OBSERVED | happyPath, negativePath, permission, persistence, console, network, responsive | exact-staging workflow |
| `calendar-team-family-views-and-filters` | `final-cert-t5-260906-033305-a2e0` | OBSERVED | happyPath, negativePath, permission, persistence, console, network, responsive | exact-staging workflow |
| `calendar-ics-create-fetch-revoke` | `final-cert-t5-260906-032126-38b8` + `sched-cert-20260908-0416` | OBSERVED | happyPath, negativePath, permission, persistence, console, network, responsive, deployed scheduler | none |
| `reminders-same-day-fcm-scheduler` | `final-cert-t5-260906-032126-38b8` + `sched-cert-20260908-0416` | PARTIAL | happyPath, negativePath, permission, persistence, console, network, provider failure/retry | physical-device negative lifecycle and iPhone/iPad |
| `tournaments-registration-waiver` | `final-cert-t5-260907-171333-6dc7` | OBSERVED | happyPath, negativePath, permission, persistence, console, network, responsive | exact-staging workflow |
| `public-portals-squad-event-registration` | `final-cert-t5-260907-171333-6dc7` | OBSERVED | happyPath, negativePath, permission, persistence, console, network, responsive | exact-staging workflow |

The scheduler execution proved successful account purge, owner-protected deletion, a reminder provider failure followed by retry with attempt count two, anonymous expiry older than fifteen minutes, registered-live exclusion, and zero owned residue. The local scenario artifacts retain the UI, permission, persistence, responsive, console, network, and cleanup proof; deployed scheduler evidence is additive and does not substitute for physical-device acceptance.

## Cleanup

- `fixture-cleanup-final-cert-t5-260906-032838-18f3`: deleted 305, restored 0, residue 0.
- `fixture-cleanup-final-cert-t5-260906-033006-80fd`: deleted 317, restored 0, residue 0.
- `fixture-cleanup-final-cert-t5-260906-033140-5e32`: deleted 317, restored 0, residue 0.
- `fixture-cleanup-final-cert-t5-260906-033305-a2e0`: deleted 308, restored 0, residue 0.
- `fixture-cleanup-final-cert-t5-260906-032126-38b8`: deleted 312, restored 0, local residue 0.
- `fixture-cleanup-final-cert-t5-260907-171333-6dc7`: deleted 319, restored 0, residue 0.
- `sched-cert-20260908-0416`: Firestore/Auth/provider-owned residue 0.
