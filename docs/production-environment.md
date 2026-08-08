# Production environment checklist

Run `npm run verify:env` in the deployment environment before promoting a
release. The command checks presence and safe formatting without printing any
secret values.

Firebase App Hosting injects `FIREBASE_WEBAPP_CONFIG` and supplies Application
Default Credentials to server code. Production currently runs on Vercel, where
`FIREBASE_SERVICE_ACCOUNT_JSON` must be stored as a Sensitive environment value.
Do not commit a service-account JSON file.

The release requires:

- The canonical HTTPS application URL and FCM VAPID key.
- All base-plan and extra-squad Stripe price IDs.
- Stripe secret and both webhook-signing secrets.
- Resend API and webhook-signing credentials.
- A high-entropy internal API secret and owner notification destinations.
- The public HTTPS `CALENDAR_FEED_BASE_URL` for the same environment's deployed feed Function.

Calendar subscriptions use a server-issued ICS feed for Google Calendar, Apple
Calendar, and Outlook. They do not require Google OAuth credentials or a redirect URI.

The Resend webhook destination is
`https://www.thesquad.pro/api/webhooks/resend`. Subscribe it to the email
delivery events and `contact.updated`/`contact.deleted`, then store its signing
secret as `RESEND_WEBHOOK_SECRET`.

Set a long, random `NEWSLETTER_UNSUBSCRIBE_SECRET` for newsletter unsubscribe links. During
migration, links previously signed with `RESEND_API_KEY` remain valid; new links use the dedicated
secret as soon as it is configured.

After configuration, verify Stripe, Stripe Connect, and Resend webhook destinations,
Firebase authorized domains, Resend sender-domain verification, and FCM delivery
from the deployed audit preview. `OWNER_FCM_TOKEN` is optional; owner email alerts
remain active when no dedicated owner device token is configured.
