# Phase 6 BUG-004 Root-Cause Verification

**Window (UTC):** `2026-08-24T13:12:34Z`–`2026-08-24T13:18:56Z`\
**Tester alias:** `phase6-bug004-root-cause`\
**Application baseline:** `21db91d08ed47f443c9476f683e585a5867157a8`\
**Hosted runtime:** Phase 5 staging deployment of `658d3ca89f3cabf6c55800400aa17bc72229c1af`\
**Origin:** `https://studio--the-squad-v2-staging.us-east4.hosted.app`\
**Result:** `BUG-004` is a false-positive audit classification; no SaaS runtime defect was found.

## Original observation

Phase 5 consistently captured a Chrome `requestfailed` event for `/faq/how-to-create-a-game.mp4` with reason `net::ERR_ABORTED`. The same run also showed a successful page, a healthy final video element, no media error, and no HTTP response of 400 or higher. Phase 5 correctly retained the contradiction as unresolved rather than suppressing it.

## Static and HTTP evidence

The checked-in MP4 is 1,405,404 bytes and reports as ISO Base Media MP4. Its top-level streaming atoms begin at these offsets:

| Atom | Byte offset |
|---|---:|
| `ftyp` | 4 |
| `moov` | 36 |
| `mdat` | 40,924 |

The early `moov` atom makes metadata available before the media payload. Hosted staging returned:

- `HEAD /faq/how-to-create-a-game.mp4`: HTTP 200, `content-type: video/mp4`, `accept-ranges: bytes`, `content-length: 1405404`.
- `GET` with `Range: bytes=0-1023`: HTTP 206, `content-range: bytes 0-1023/1405404`, `content-length: 1024`.
- The browser request used `Range: bytes=0-` and received HTTP 206.

## Controlled preload experiment

The bundled Playwright CLI drove fresh system-Chrome sessions. The existing page video was removed in page memory and replaced with an otherwise identical temporary element; only `preload` and a cache-isolating query marker varied. No repository, staging, account, or persistent browser state changed.

| Preload | Response | Final state after 4 seconds | Buffered | `requestfailed` |
|---|---|---|---:|---|
| `metadata` | HTTP 206, `bytes=0-` | `readyState=4`, `networkState=1`, duration 133.84s, no error | 16.094s | One media `net::ERR_ABORTED` |
| `auto` | HTTP 206, `bytes=0-` | `readyState=4`, `networkState=1`, duration 133.84s, no error | 133.84s | None |
| `none` | No request | `readyState=0`, `networkState=1`, no error | 0s | None |

Changing only `metadata` to `auto` caused Chrome to consume the entire transfer instead of terminating it after a playable prefix. This proves that the original abort was caused by the preload lifecycle, not a corrupt file, rejected response, unsupported range, or media decode failure.

## Fresh two-viewport staging replay

System Chrome opened staging from `about:blank`, installed page-scoped response, request-failure, page-error, and console listeners before navigation, waited for healthy media readiness, started the muted video, and required playback time to advance beyond one second.

| Viewport | Page | Layout | Media | Playback | Errors/failures |
|---|---|---|---|---|---|
| 390×844 | HTTP 200; `Operational Manual.` | overflow delta 0 | HTTP 206; `readyState=4`; `networkState=1`; duration 133.84s; no error | advanced to 1.008825s | 0 application console errors; 0 page errors; 0 same-origin request failures |
| 1440×900 | HTTP 200; `Operational Manual.` | overflow delta 0 | HTTP 206; `readyState=4`; `networkState=1`; duration 133.84s; no error | advanced to 1.00917s | 0 application console errors; 0 page errors; 0 same-origin request failures |

The staging health endpoint also returned `status: ok`, service `the-squad-web`, and revision label `studio-build-2026-08-24-001`.

## Corrected request-health rule

Do not equate a browser `requestfailed` event with a failed asset without checking the resource outcome. A media `net::ERR_ABORTED` may be classified as an intentional metadata-preload cancellation only when all of these observations are present:

1. The same media URL has a successful 2xx/206 response.
2. The media element finishes with `readyState >= 3` and `networkState === 1`.
3. `HTMLMediaElement.error` is null.
4. Duration is finite and positive.
5. A controlled playback check advances `currentTime`.
6. There is no related HTTP error, page error, or application console error.

If any condition is absent, the abort remains a failure. Other abort reasons, stalled loading, decode errors, unsuccessful responses, and playback failures are never suppressed by this rule.

## Resolution and safety

`BUG-004` is closed as `FALSE POSITIVE`. The coverage row returns to `PASS` with its bug ID retained for traceability. No application code, asset, dependency, configuration, identity, provider, database, or production environment changed.

Changing the product to `preload="auto"` would hide the signal by forcing the entire 1.4 MB video to download on every visit. Changing it to `preload="none"` would avoid exercising the asset during the page check. Both are inferior to correcting the audit classification while preserving the existing bandwidth-conscious product behavior.

No raw Playwright state, screenshots, traces, videos, response bodies, credentials, cookies, tokens, or personal data were retained.
