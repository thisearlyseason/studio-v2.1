# Phase 8 Confirmed Defects — BUG-010 Root Cause

**Probe time:** 2026-08-25T03:33:09Z  
**Pre-fix commit:** `b1c8d3b42c23872fd3d39f029487614e04315b09`  
**Environment:** isolated hosted staging only

## Guard result

The existing Phase 7 read-only preflight independently resolved Firebase Admin to exactly `the-squad-v2-staging`, matched both explicit project confirmations and the canonical staging origin, rejected emulator configuration, and returned `safe=true`. No fixture was seeded and no Auth or Firestore mutation was attempted.

## Read-only query result

The probe executed the same bounded query shape as the authorized route:

- collection group: `registrationEntries`
- field: `assigned_team_id`
- operator: equality
- limit: `1`
- sentinel value: a non-document Phase 8 probe identifier

Sanitized outcome:

```json
{"projectId":"the-squad-v2-staging","operation":"registrationEntries.assigned_team_id equality limit 1","outcome":"FAIL","errorCode":"9"}
```

Firebase Admin code `9` is `FAILED_PRECONDITION`. Together with the absent `registrationEntries.assigned_team_id` collection-group field override in the pre-fix index declaration, this confirms BUG-010's root cause: the authorized own-squad request reached a collection-group query whose required single-field collection-group index was not deployed.

## Scoped repair

Phase 8 adds exactly one ascending `COLLECTION_GROUP` field override for `registrationEntries.assigned_team_id`. Authorization remains before query execution, the result remains bounded to 200 rows, and provider/query failures return a sanitized `503` without an index-creation URL or provider message. Exact-commit staging verification is required before BUG-010 can close.

No credential metadata, token, cookie, provider payload, raw error message, or index-creation URL is retained in this evidence.
