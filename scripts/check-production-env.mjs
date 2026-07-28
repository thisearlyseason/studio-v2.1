const required = [
  'NEXT_PUBLIC_APP_URL',
  'NEXT_PUBLIC_FCM_VAPID_KEY',
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
  'STRAICO_API_KEY',
  'GOOGLE_AI_API_KEY',
  'INTERNAL_API_SECRET',
  'OWNER_NOTIFICATION_EMAIL',
  'OWNER_FCM_TOKEN',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REDIRECT_URI',
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

const redirectUri = process.env.GOOGLE_REDIRECT_URI?.trim();
if (redirectUri) {
  try {
    const parsed = new URL(redirectUri);
    if (parsed.protocol !== 'https:') invalid.push('GOOGLE_REDIRECT_URI must use HTTPS');
  } catch {
    invalid.push('GOOGLE_REDIRECT_URI must be a valid absolute URL');
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
