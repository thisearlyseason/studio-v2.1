# Production environment checklist

Run `npm run verify:env` in the deployment environment before promoting a
release. The command checks presence and safe formatting without printing any
secret values.

Firebase App Hosting injects `FIREBASE_WEBAPP_CONFIG` and supplies Application
Default Credentials to server code. Do not commit a service-account JSON file.
For non-Google hosting, provide `FIREBASE_SERVICE_ACCOUNT_JSON` through the
host's encrypted secret manager.

The release requires:

- The canonical HTTPS application URL and FCM VAPID key.
- All base-plan and extra-squad Stripe price IDs.
- Stripe secret and both webhook-signing secrets.
- Resend API and webhook-signing credentials, Straico, and Google AI credentials.
- A high-entropy internal API secret and owner notification destinations.
- Google Calendar OAuth client ID, client secret, and HTTPS redirect URI.

The Resend webhook destination is
`https://www.thesquad.pro/api/webhooks/resend`. Subscribe it to the email
delivery events and `contact.updated`/`contact.deleted`, then store its signing
secret as `RESEND_WEBHOOK_SECRET`.

Set a long, random `NEWSLETTER_UNSUBSCRIBE_SECRET` for newsletter unsubscribe links. During
migration, links previously signed with `RESEND_API_KEY` remain valid; new links use the dedicated
secret as soon as it is configured.

After configuration, verify Stripe, Stripe Connect, and Resend webhook destinations,
Firebase authorized domains, Google OAuth redirect URIs, Resend sender-domain
verification, and FCM delivery from the deployed audit preview.
