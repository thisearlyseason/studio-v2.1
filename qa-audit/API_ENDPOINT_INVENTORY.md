# API Endpoint Inventory

Authentication/authorization status is from static review. `Auth` means Firebase Admin token verification; `Public` routes use bounded input and rate limiting where applicable; `Webhook` means provider-signature verification. Subscription checks are server-side where paid operations need them.

| Route | Methods | Access | Main authorization / validation | Status |
|---|---|---|---|---|
| account/deletion-request | POST | Auth | owner, rate limit | Reviewed |
| admin/newsletter, admin/newsletter/send, admin/newsletter/welcome | GET/DELETE/POST/PUT | Auth | superadmin | Reviewed |
| admin/sports-hub; admin/users/[uid]/account-control | GET/POST | Auth | superadmin | Reviewed |
| checkout; stripe/create-checkout; stripe/customer-portal | POST | Auth | owner, non-anonymous, price/plan/idempotency | Reviewed |
| subscription/addon, cancel, sync, update | POST | Auth | owner, mutation lock, rate limit, Stripe authority | Reviewed |
| webhook; stripe/connect/webhook | POST | Webhook | Stripe signature + idempotency | Reviewed |
| stripe/connect/onboard, status | POST/GET | Auth | owner/authority checks | Reviewed |
| stripe/fundraising-link; stripe/payment-items | POST/DELETE/GET | Auth | team ownership, paid-seat/Connect checks | Reviewed |
| facilities/delete, facilities/update | POST | Auth | owner or superadmin, bounded input | Reviewed |
| teams/allocate-pro | POST/DELETE | Auth | owner/entitlement | Reviewed |
| teams/chat; teams/chat/message; teams/chat/vote | GET/POST | Auth | membership/owner checks | Reviewed |
| teams/games; teams/parent-access; teams/rsvp; teams/volunteers/verify | POST/PATCH | Auth | team/member authority | Reviewed |
| teams/join | GET/POST | Auth | join-code and player/parent validation | Reviewed |
| teams/repair-player-links | POST | Auth | staff/owner/superadmin, rate limit | Reviewed |
| invites/youth | GET/POST/PUT | Auth | guardian/superadmin | Reviewed |
| email/send, email/welcome | POST | Auth | team owner/superadmin | Reviewed |
| email/reset-password | POST | Public | email validation, rate limit, enumeration-safe response | Reviewed |
| notify | POST | Auth | server-resolved recipients, preference checks | Reviewed |
| webhooks/resend | POST | Webhook | Svix signature + delivery lease | Reviewed |
| contact; referrals/coach | POST | Public | bounded input, rate limits, sanitization/idempotency | Reviewed |
| newsletter/subscribe, newsletter/unsubscribe; sports-hub/newsletter | POST/GET | Public | bounded input, consent handling/rate limits | Reviewed |
| public/fundraising; public/volunteer | GET/POST | Public | public IDs, rate limits, idempotency | Reviewed |
| public/notify-admin | POST | Public | must correspond to recent stored signup; rate limit | Reviewed |
| public/tournaments/[teamId]/[eventId] | GET | Public | server projection | Review in Preview |
| sports-hub/articles, sports-hub/rss | GET | Public | content/URL hardening | Reviewed |
| sports-hub/rss-refresh | POST | Auth/internal | protected refresh | Reviewed |
| demo/seed | POST/PATCH | Auth | demo/session controls | Reviewed |

Every route still needs dynamic negative tests in Preview (missing/invalid token, wrong tenant ID, wrong role, malformed body, replay, rate limit, and expired resource).
