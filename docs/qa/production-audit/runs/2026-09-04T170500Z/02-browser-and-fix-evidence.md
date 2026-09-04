# Browser and Fix Evidence

All browser work used the repository Playwright CLI wrapper against a loopback-only Next.js server plus Firebase Auth, Firestore, and Storage emulators. Runtime credentials were randomly generated, redacted, never persisted, and the fixtures marked both teams as demo data to suppress outbound email/push providers.

## Identity and permissions

- Every seeded active persona reached the expected landing route.
- Wrong password and disabled, unverified, removed-member, and pending-deletion states failed closed.
- Protected deep-link return, logout, revoked endpoint access, and second-tab logout passed.
- Claim-controlled superadmin access passed; profile-only fake superadmin denial passed.
- Owner, assistant, member, parent, and superadmin surface sweeps passed at desktop and/or 390x844 mobile as selected, with route denials and tenant isolation enforced.

## Changed workflow verification

- Communication: invalid poll rejected; feed post, poll, comment, vote, and chat message persisted; owner/member cross-role visibility passed; Team B chat content was absent; owner deletion persisted.
- Events: incomplete activity rejected; owner create/edit/delete persisted; member visibility and RSVP persisted; member edit controls absent.
- Facilities: empty and name-only submissions disabled; valid create/edit persisted; resource add/rename persisted; deletion cancel preserved data; confirmed resource and facility deletion persisted.
- Equipment: create/edit/search persisted; over-assignment rejected; assignment persisted; assigned deletion blocked; return restored stock; final delete persisted.
- Schedule companion: online/offline shell and todo persistence, corrupt/legacy storage recovery, two-profile and two-team isolation, and mobile fit passed.

Every successful workflow recorded zero application console errors and zero unexpected same-origin HTTP 5xx responses.

## Defects resolved in this run

- BUG-015 pending-deletion login provider crash
- BUG-016 legacy event Calendar crash
- BUG-017 legacy chat-message crash
- BUG-018 facility required-field no-op
- BUG-019 facility edit accessible name
- BUG-020 assigned-equipment deletion integrity failure
