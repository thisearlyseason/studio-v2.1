# Phase 9 Fixture Lifecycle

## Result

`INCONCLUSIVE-HARNESS` — retry 4 established a clean exact v3 baseline, then stopped before transition when the first responsive browser pair exposed an incomplete synthetic player contract.

## Guard and baseline

| Gate | Sanitized result |
| --- | --- |
| Read-only preflight | PASS — exact staging project and canonical origin; `safe=true` |
| Planned graph | Manifest v3; `20` Auth identities; `82` Firestore documents; `1` expected-absent profile |
| Seed | PASS — `state=seeded`; created `20/82` |
| Credential confinement | PASS — external regular file, mode `0600` |
| Mandatory inspection | PASS — actual presence `20/82`; problems `0`; drift `0` |
| Browser boundary | STOP — two Parent A diagnostic contexts reproduced the same synthetic-data exception |
| Pending-delete transition | NOT RUN |

## Deterministic attribution

Each context navigated to the Parent A `/family` landing seven times during the login/direct-route matrix. The Family itinerary consumes `PlayerProfile.firstName[0]`, while all four v3 `players` documents omitted `firstName`, `lastName`, `dateOfBirth`, `hasLogin`, and `createdAt`. Each real render exception was logged once by the application and once by the error boundary, producing `14` console entries per viewport. No product runtime change is required for this harness mismatch.

The earlier denied-route listener counts were also non-canonical: the harness used the transient page target URL and therefore attributed authorized landing-page listeners to the denied pathname during redirects. The private runner now attributes listener starts to the request's committed initiating frame URL. An offline system-Chrome smoke proves that a transient redirect landing listener is excluded while a committed denied-route listener is included.

## Fix round 4 — strict RED/GREEN

- Focused RED: `0/1`; every required field was `undefined` on all four v3 player documents.
- Minimal fixture correction: deterministic names, age-consistent birth dates, login state derived from the existing exact user relationship, and a fixed audit creation timestamp. Resource paths/counts and authorization relationships are unchanged; v2 recovery and product runtime are unchanged.
- Focused GREEN: player contract and v2 recovery `2/2`.
- Complete fixture safety: `158/158`.
- Fixture/authorization/repository-hygiene gate: `203/203`.
- Full verification: Node `628/628`, components `2/2`, rules `38/38`, production build PASS, Functions TypeScript build PASS.

No hosted retry, push, deployment, production action, or merge followed this local correction. Independent review is required before a complete fresh lifecycle.
