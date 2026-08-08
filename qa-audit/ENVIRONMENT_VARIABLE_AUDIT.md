# Environment Variable Audit

Values were not read or recorded. `npm run verify:env` must run in the actual production environment.

| Variable | Purpose | Client/server | Preview | Production | Missing behavior / concern |
|---|---|---|---|---|---|
| NEXT_PUBLIC_APP_URL | canonical application URL | Client | isolated preview URL | required | Link/redirect correctness |
| NEXT_PUBLIC_FIREBASE_WEBAPP_CONFIG | Firebase Web SDK config | Client | isolated project | App Hosting injected | Must never point Preview at production data |
| NEXT_PUBLIC_FCM_VAPID_KEY | browser push registration | Client | test key | required | Push disabled gracefully |
| NEXT_PUBLIC_STRIPE_PRICE_* | display/checkout price identifiers | Client | test prices | production prices | Must match trusted server map |
| STRIPE_SECRET_KEY | Stripe server SDK | Server | test key | required | Must not be public/logged |
| STRIPE_WEBHOOK_SECRET | subscription webhook verification | Server | test endpoint | required | Fail closed if missing |
| STRIPE_CONNECT_WEBHOOK_SECRET | Connect webhook verification | Server | test endpoint | required | Fail closed if missing |
| STRIPE_PRICE_EXTRA_TEAM_* | add-on mapping | Server | test prices | required | Must match Stripe products |
| RESEND_API_KEY | email delivery/webhook verification client | Server | sandbox | required | No secret exposure |
| RESEND_WEBHOOK_SECRET | Resend signature verification | Server | test endpoint | required | Fail closed if missing |
| FIREBASE_SERVICE_ACCOUNT_JSON | Admin SDK credentials | Server | isolated project | App Hosting identity/secret | Never browser-visible |
| FIREBASE_WEBAPP_CONFIG | hosted Firebase config | Server/build | isolated project | App Hosting injected | Avoid production fallback in preview |
| INTERNAL_API_SECRET | internal endpoint guard | Server | unique secret | required | Never use a default |
| OWNER_NOTIFICATION_EMAIL | owner operational email alerts | Server | test recipient | required | Avoid real-recipient test sends |
| OWNER_FCM_TOKEN | optional dedicated owner push alert | Server | test recipient or unset | optional | Email alerts remain active when unset |
| APP_URL, GCLOUD_PROJECT, GOOGLE_CLOUD_PROJECT | backend/runtime config | Server | isolated | required as applicable | Validate platform injection |
| FIREBASE_AUTH_EMULATOR_HOST, FIRESTORE_EMULATOR_HOST, USE_EMULATOR, NEXT_PUBLIC_USE_FIREBASE_EMULATORS | local emulator controls | Local only | unset | unset | Must not reach production |

`NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, and `NEXT_PUBLIC_FIREBASE_PROJECT_ID` are referenced for legacy/client configuration and should be reviewed alongside the injected web app config.
