import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const checker = fileURLToPath(new URL('../scripts/check-production-env.mjs', import.meta.url));

const validEnvironment = {
  NEXT_PUBLIC_APP_URL: 'https://www.thesquad.pro',
  NEXT_PUBLIC_FCM_VAPID_KEY: 'public-vapid-key',
  NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY: 'separate-public-web-push-key',
  WEB_PUSH_VAPID_PRIVATE_KEY: 'separate-private-web-push-key',
  WEB_PUSH_VAPID_SUBJECT: 'mailto:push@example.test',
  NEXT_PUBLIC_STRIPE_PRICE_TEAM_MONTHLY: 'price_team_monthly',
  NEXT_PUBLIC_STRIPE_PRICE_TEAM_ANNUAL: 'price_team_annual',
  NEXT_PUBLIC_STRIPE_PRICE_ELITE_TEAMS_MONTHLY: 'price_elite_teams_monthly',
  NEXT_PUBLIC_STRIPE_PRICE_ELITE_TEAMS_ANNUAL: 'price_elite_teams_annual',
  NEXT_PUBLIC_STRIPE_PRICE_ELITE_LEAGUE_MONTHLY: 'price_elite_league_monthly',
  NEXT_PUBLIC_STRIPE_PRICE_ELITE_LEAGUE_ANNUAL: 'price_elite_league_annual',
  NEXT_PUBLIC_STRIPE_PRICE_SCHOOLS_MONTHLY: 'price_schools_monthly',
  NEXT_PUBLIC_STRIPE_PRICE_SCHOOLS_ANNUAL: 'price_schools_annual',
  STRIPE_PRICE_EXTRA_TEAM_MONTHLY: 'price_extra_monthly',
  STRIPE_PRICE_EXTRA_TEAM_ANNUAL: 'price_extra_annual',
  STRIPE_SECRET_KEY: 'sk_live_example',
  STRIPE_WEBHOOK_SECRET: 'whsec_subscription',
  STRIPE_CONNECT_WEBHOOK_SECRET: 'whsec_connect',
  RESEND_API_KEY: 're_example',
  RESEND_WEBHOOK_SECRET: 'whsec_resend',
  NEWSLETTER_UNSUBSCRIBE_SECRET: 'a'.repeat(32),
  CALENDAR_FEED_BASE_URL: 'https://us-central1-production-project.cloudfunctions.net/getCalendarFeed',
  INTERNAL_API_SECRET: 'internal-secret',
  OWNER_NOTIFICATION_EMAIL: 'owner@example.test',
  FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({ project_id: 'production-project' }),
};

function runChecker(overrides = {}) {
  return spawnSync(process.execPath, [checker], {
    encoding: 'utf8',
    env: { ...validEnvironment, ...overrides },
  });
}

test('production environment accepts a matching Firebase identity and calendar Function', () => {
  const result = runChecker();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Production environment check passed/);
});

test('production environment rejects a calendar Function from another Firebase project', () => {
  const result = runChecker({
    CALENDAR_FEED_BASE_URL: 'https://us-central1-staging-project.cloudfunctions.net/getCalendarFeed',
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /must target us-central1-production-project\.cloudfunctions\.net/);
});

test('production environment accepts platform identity and keeps owner push optional', () => {
  const { FIREBASE_SERVICE_ACCOUNT_JSON: _removed, ...platformEnvironment } = validEnvironment;
  const result = spawnSync(process.execPath, [checker], {
    encoding: 'utf8',
    env: {
      ...platformEnvironment,
      GCLOUD_PROJECT: 'production-project',
    },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stderr, /OWNER_FCM_TOKEN/);
});

test('production environment requires separate web push VAPID configuration', () => {
  const result = runChecker({
    NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY: '',
    WEB_PUSH_VAPID_PRIVATE_KEY: '',
    WEB_PUSH_VAPID_SUBJECT: '',
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY/);
  assert.match(result.stderr, /WEB_PUSH_VAPID_PRIVATE_KEY/);
  assert.match(result.stderr, /WEB_PUSH_VAPID_SUBJECT/);
});
