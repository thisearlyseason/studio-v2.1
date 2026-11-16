# HeyCatch analytics

Installed from https://heycatch.ai/agents.md on November 16, 2026.

- Regular dependency: `@heycatch/sdk`, npm `latest` stable 0.8.5 at installation.
- `src/instrumentation-client.ts` statically imports the SDK and initializes it at module scope with the publishable project key and Next.js 15 / Codex metadata. No custom ingest host, router listeners, manual click/pageview events or initialization guards.
- The landing website and authenticated product share this repository and origin. Following the guide's shared-project exception, `site: 'landing'` is omitted. No cross-origin tracing hosts are added because the instrumented backend is same-origin.
- Both effective CSP variants allow `https://in.heycatch.ai` for scripts and connections. Existing restrictive defaults remain.
- Reserved one-character routes redirect to `/?utm_source=heycatch&utm_campaign=<character>` with Next's nonpermanent redirect. No existing single-character route was found.
- Firebase auth identifies verified, nonanonymous users by internal UID with available name/email and set-once signup date; sign-out resets identified analytics identity. Initial anonymous loads are not reset repeatedly.
- The verified-email completion flow reports `signup_completed` once it has established a session and completed signup enrollment, only when the pending-signup marker exists. It does not count unverified account creation or ordinary sign-in as a completed signup.
- The existing verified/idempotently claimed Stripe webhook reports subscription start, update and end only after authoritative subscription reconciliation. Events are awaited and use the same internal UID as browser identity; only plan/status/billing-cycle/event-ID properties are sent, not card or team/player records. Payment claims are never sent from browser success pages.
- The cookies page discloses HeyCatch usage and identity collection. There is no existing whole-analytics consent gate or separate IP choice to reconcile. No unrequested IP-collection override or consent banner was introduced.

## Verification

Run the full release gate before merge/deployment. Check the live CSP, `/x` attribution redirect and the SDK's client bundle. Use an ordinary browser for real visitor verification: HeyCatch deliberately filters headless/automated browser events. Open the live site and click around for a few seconds, then open this project's Analytics → Install page and press “I've installed” if shown. The successful SDK stage must be prod and the version must have no prerelease suffix. Do not ask the owner to inspect a browser console.
