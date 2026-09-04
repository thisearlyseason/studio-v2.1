const required = [
  'NEXT_PUBLIC_APP_URL',
  'NEXT_PUBLIC_FCM_VAPID_KEY',
  'NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY',
  'WEB_PUSH_VAPID_PRIVATE_KEY',
  'WEB_PUSH_VAPID_SUBJECT',
  'NEXT_PUBLIC_STRIPE_PRICE_TEAM_MONTHLY',
  'NEXT_PUBLIC_STRIPE_PRICE_TEAM_ANNUAL',
  'NEXT_PUBLIC_STRIPE_PRICE_ELITE_TEAMS_MONTHLY',
  'NEXT_PUBLIC_STRIPE_PRICE_ELITE_TEAMS_ANNUAL',
  'NEXT_PUBLIC_STRIPE_PRICE_ELITE_LEAGUE_MONTHLY',
  'NEXT_PUBLIC_STRIPE_PRICE_ELITE_LEAGUE_ANNUAL',
  'NEXT_PUBLIC_STRIPE_PRICE_SCHOOLS_MONTHLY',
  'NEXT_PUBLIC_STRIPE_PRICE_SCHOOLS_ANNUAL',
  'STRIPE_PRICE_EXTRA_TEAM_MONTHLY',
  'STRIPE_PRICE_EXTRA_TEAM_ANNUAL',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_CONNECT_WEBHOOK_SECRET',
  'RESEND_API_KEY',
  'RESEND_WEBHOOK_SECRET',
  'NEWSLETTER_UNSUBSCRIBE_SECRET',
  'CALENDAR_FEED_BASE_URL',
  'INTERNAL_API_SECRET',
  'OWNER_NOTIFICATION_EMAIL',
];

const placeholderPattern = /^(change[-_ ]?me|your[_-]|example|test|placeholder|todo|null|undefined)$/i;
const missing = [];
const invalid = [];

for (const name of required) {
  const value = process.env[name]?.trim();
  if (!value) {
    missing.push(name);
    continue;
  }
  if (placeholderPattern.test(value)) {
    invalid.push(`${name} contains a placeholder value`);
  }
}

const firebaseServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
const runtimeProjectId = process.env.GOOGLE_CLOUD_PROJECT?.trim() || process.env.GCLOUD_PROJECT?.trim();
let serviceAccountProjectId;

if (firebaseServiceAccount) {
  let parsed;
  try {
    parsed = JSON.parse(firebaseServiceAccount);
  } catch {
    try {
      parsed = JSON.parse(Buffer.from(firebaseServiceAccount, 'base64').toString('utf8'));
    } catch {
      invalid.push('FIREBASE_SERVICE_ACCOUNT_JSON must contain valid JSON or base64-encoded JSON');
    }
  }
  if (parsed) {
    serviceAccountProjectId = parsed.project_id || parsed.projectId;
    if (!serviceAccountProjectId) {
      invalid.push('FIREBASE_SERVICE_ACCOUNT_JSON must include project_id');
    }
  }
} else if (!runtimeProjectId) {
  missing.push('FIREBASE_SERVICE_ACCOUNT_JSON or GOOGLE_CLOUD_PROJECT/GCLOUD_PROJECT');
}

const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
if (appUrl) {
  try {
    const parsed = new URL(appUrl);
    if (parsed.protocol !== 'https:') invalid.push('NEXT_PUBLIC_APP_URL must use HTTPS');
    if (['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)) {
      invalid.push('NEXT_PUBLIC_APP_URL cannot point to localhost');
    }
  } catch {
    invalid.push('NEXT_PUBLIC_APP_URL must be a valid absolute URL');
  }
}

const calendarFeedUrl = process.env.CALENDAR_FEED_BASE_URL?.trim();
if (calendarFeedUrl) {
  try {
    const parsed = new URL(calendarFeedUrl);
    if (parsed.protocol !== 'https:') invalid.push('CALENDAR_FEED_BASE_URL must use HTTPS');
    if (parsed.username || parsed.password || parsed.search || parsed.hash) {
      invalid.push('CALENDAR_FEED_BASE_URL cannot contain credentials, query parameters, or a fragment');
    }
    if (parsed.pathname.replace(/\/$/, '') !== '/getCalendarFeed') {
      invalid.push('CALENDAR_FEED_BASE_URL must target the getCalendarFeed Function');
    }
    const projectId = serviceAccountProjectId || runtimeProjectId;
    if (projectId) {
      const expectedHost = `us-central1-${projectId}.cloudfunctions.net`;
      if (parsed.hostname !== expectedHost) {
        invalid.push(`CALENDAR_FEED_BASE_URL must target ${expectedHost}`);
      }
    }
  } catch {
    invalid.push('CALENDAR_FEED_BASE_URL must be a valid absolute URL');
  }
}

const stripeSecret = process.env.STRIPE_SECRET_KEY?.trim();
if (stripeSecret && !/^sk_(test|live)_/.test(stripeSecret)) {
  invalid.push('STRIPE_SECRET_KEY has an unexpected format');
}

for (const name of ['STRIPE_WEBHOOK_SECRET', 'STRIPE_CONNECT_WEBHOOK_SECRET']) {
  const value = process.env[name]?.trim();
  if (value && !value.startsWith('whsec_')) {
    invalid.push(`${name} has an unexpected format`);
  }
}

const resendWebhookSecret = process.env.RESEND_WEBHOOK_SECRET?.trim();
if (resendWebhookSecret && !resendWebhookSecret.startsWith('whsec_')) {
  invalid.push('RESEND_WEBHOOK_SECRET has an unexpected format');
}

const webPushSubject = process.env.WEB_PUSH_VAPID_SUBJECT?.trim();
if (webPushSubject && !/^(mailto:|https:\/\/)/i.test(webPushSubject)) {
  invalid.push('WEB_PUSH_VAPID_SUBJECT must be a mailto: or HTTPS contact URI');
}

const fcmVapidPublicKey = process.env.NEXT_PUBLIC_FCM_VAPID_KEY?.trim();
const webPushVapidPublicKey = process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY?.trim();
if (fcmVapidPublicKey && webPushVapidPublicKey && fcmVapidPublicKey === webPushVapidPublicKey) {
  invalid.push('NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY must be distinct from NEXT_PUBLIC_FCM_VAPID_KEY');
}

const newsletterUnsubscribeSecret = process.env.NEWSLETTER_UNSUBSCRIBE_SECRET?.trim();
if (newsletterUnsubscribeSecret && newsletterUnsubscribeSecret.length < 32) {
  invalid.push('NEWSLETTER_UNSUBSCRIBE_SECRET must be at least 32 characters');
}

for (const name of required.filter((key) => key.includes('STRIPE_PRICE_'))) {
  const value = process.env[name]?.trim();
  if (value && !value.startsWith('price_')) {
    invalid.push(`${name} has an unexpected format`);
  }
}

if (missing.length || invalid.length) {
  if (missing.length) {
    console.error(`Missing production environment variables:\n- ${missing.join('\n- ')}`);
  }
  if (invalid.length) {
    console.error(`Invalid production environment variables:\n- ${invalid.join('\n- ')}`);
  }
  process.exit(1);
}

console.log(`Production environment check passed (${required.length} required values).`);
