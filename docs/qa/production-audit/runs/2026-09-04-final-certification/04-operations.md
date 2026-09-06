# Task 5 operations local certification observations

- Candidate commit: `1c5475865c0d7ff71e76bb4568751b8d1ee2570b`
- Environment: loopback Firebase emulators and local Next server only
- Result boundary: local observations do not constitute final coverage-matrix PASS

| Scenario | Exact-SHA run | Local outcome | Observed dimensions | Missing dimensions |
|---|---|---|---|
| `events-event-crud-recurrence` | `final-cert-t5-260906-032838-18f3` | OBSERVED | happyPath, negativePath, permission, persistence, console, network, responsive | none |
| `events-rsvp-attendance-details` | `final-cert-t5-260906-033006-80fd` | OBSERVED | happyPath, negativePath, permission, persistence, console, network, responsive | none |
| `attendance-practice-event-member-attendance` | `final-cert-t5-260906-033140-5e32` | OBSERVED | happyPath, negativePath, permission, persistence, console, network, responsive | none |
| `calendar-team-family-views-and-filters` | `final-cert-t5-260906-033305-a2e0` | OBSERVED | happyPath, negativePath, permission, persistence, console, network, responsive | none |
| `calendar-ics-create-fetch-revoke` | `final-cert-t5-260906-032126-38b8` | OBSERVED | happyPath, negativePath, permission, persistence, console, network, responsive | none |
| `reminders-same-day-fcm-scheduler` | `final-cert-t5-260906-032126-38b8` | OBSERVED except external device dimension | happyPath, negativePath, permission, persistence, console, network | responsive (deployed scheduler, provider acceptance, physical-device receipt/cleanup) |

All six manifests record the same candidate commit and have zero `runErrors`. The combined run
`final-cert-t5-260906-032404-7331` is deliberately excluded: its member-event locator timed out
before case evidence was recorded. The clean isolated Events manifest above replaced it.

## Remaining external requirements

- `calendar-ics-create-fetch-revoke`: exact staging revision; deployed scheduler invocation with correlated logs
- `reminders-same-day-fcm-scheduler`: exact staging revision; provider acceptance, physical-device receipt and cleanup evidence; deployed scheduler invocation with correlated logs

## Cleanup

- `fixture-cleanup-final-cert-t5-260906-032838-18f3`: OBSERVED; deleted 305, restored 0, retained audit records 0.
- `fixture-cleanup-final-cert-t5-260906-033006-80fd`: OBSERVED; deleted 317, restored 0, retained audit records 0.
- `fixture-cleanup-final-cert-t5-260906-033140-5e32`: OBSERVED; deleted 317, restored 0, retained audit records 0.
- `fixture-cleanup-final-cert-t5-260906-033305-a2e0`: OBSERVED; deleted 308, restored 0, retained audit records 0.
- Shared proof `fixture-cleanup-final-cert-t5-260906-032126-38b8`: BLOCKED_PRECONDITION; deleted 312, restored 0, retained audit records 0.
  - `calendar-ics-create-fetch-revoke` (background-batch): local cleanup observed; external deployed invocation remains blocked.
  - `reminders-same-day-fcm-scheduler` (physical-device-batch): local cleanup observed; external device/provider cleanup remains blocked.
