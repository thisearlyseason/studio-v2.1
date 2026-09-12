import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import {
  isDistributionContentAvailable,
  isExternalPurchaseUrl,
  isStoreBlockedPath,
  safeReturnPath,
} from '../src/lib/app-distribution.ts';

test('distribution-scoped help content remains on web and is omitted from store', () => {
  assert.equal(isDistributionContentAvailable('all', 'store'), true);
  assert.equal(isDistributionContentAvailable('web', 'web'), true);
  assert.equal(isDistributionContentAvailable('web', 'store'), false);
});

test('store return policy blocks purchase routes without breaking valid team joins', () => {
  const cases = [
    ['/pricing', 'web', '/pricing'],
    ['/pricing', 'store', '/dashboard'],
    ['/pricing/compare?cycle=annual', 'store', '/dashboard'],
    ['/dashboard/billing', 'store', '/dashboard'],
    ['/dashboard/billing/history', 'store', '/dashboard'],
    ['/checkout?price=pro', 'store', '/dashboard'],
    ['//evil.example', 'store', '/dashboard'],
    ['/\\evil.example', 'store', '/dashboard'],
    ['/%2fevil.example', 'store', '/dashboard'],
    ['/dashboard/%2Fbilling', 'store', '/dashboard'],
    ['/family?addChild=1&returnTo=%2Fpricing', 'store', '/dashboard'],
    ['/teams/join?code=DEMO_C', 'store', '/teams/join?code=DEMO_C'],
    [
      '/family?addChild=1&returnTo=%2Fteams%2Fjoin%3Fcode%3DDEMO_C',
      'store',
      '/family?addChild=1&returnTo=%2Fteams%2Fjoin%3Fcode%3DDEMO_C',
    ],
  ];

  for (const [candidate, distribution, expected] of cases) {
    assert.equal(
      safeReturnPath(candidate, distribution),
      expected,
      `${distribution} should normalize ${candidate}`,
    );
  }
});

test('external purchase classifier blocks payment destinations without blocking resources or receipts', () => {
  for (const href of [
    'https://checkout.stripe.com/c/pay/session',
    'https://buy.stripe.com/test-link',
    'https://billing.stripe.com/p/session',
    'https://paypal.me/teamfund',
    'https://www.gofundme.com/f/team-fund',
    'https://square.link/u/example',
    'https://venmo.com/u/teamfund',
    'https://cash.app/$teamfund',
    'https://pay.example.org/checkout',
    'https://example.org/coaching/payment-strategy',
    'https://www.thesquad.pro/',
    'https://www.thesquad.pro/signup',
    'https://www.thesquad.pro/#pricing',
    '/\\buy.stripe.com/test',
    'not a url',
  ]) {
    assert.equal(isExternalPurchaseUrl(href), true, href);
  }

  for (const href of [
    '/downloads/score-sheet.pdf',
    'https://pay.stripe.com/receipts/example',
    'https://www.youtube.com/watch?v=example',
    'https://storage.googleapis.com/team-files/guide.pdf',
    'mailto:team@thesquad.pro',
  ]) {
    assert.equal(isExternalPurchaseUrl(href), false, href);
  }

  const priorAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  process.env.NEXT_PUBLIC_APP_URL = 'https://store.thesquad-app.test';
  try {
    assert.equal(
      isExternalPurchaseUrl('https://store.thesquad-app.test/downloads/score-sheet.pdf'),
      false,
    );
    assert.equal(
      isExternalPurchaseUrl('http://store.thesquad-app.test/downloads/score-sheet.pdf'),
      true,
    );
    assert.equal(
      isExternalPurchaseUrl('https://store.thesquad-app.test:444/downloads/score-sheet.pdf'),
      true,
    );
  } finally {
    if (priorAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = priorAppUrl;
  }
});

test('store path policy blocks direct purchase-capable surfaces and keeps neutral routes', () => {
  for (const pathname of [
    '/pricing',
    '/checkout',
    '/dashboard/billing',
    '/register/league/demo',
    '/register/tournament/team/event',
    '/events/register/team',
    '/public/donate/team/campaign',
  ]) {
    assert.equal(isStoreBlockedPath(pathname), true, `${pathname} must be blocked`);
  }

  for (const pathname of [
    '/dashboard',
    '/settings',
    '/teams/join',
    '/register/squad/team',
    '/family',
    '/how-to',
    '/privacy',
    '/app-unavailable',
  ]) {
    assert.equal(isStoreBlockedPath(pathname), false, `${pathname} must remain available`);
  }
});

test('return validation rejects malformed and recursively nested purchase destinations', () => {
  const cases = [
    [undefined, '/dashboard'],
    [null, '/dashboard'],
    ['', '/dashboard'],
    ['https://evil.example/pricing', '/dashboard'],
    ['/dashboard\u0000/pricing', '/dashboard'],
    ['/dashboard?returnTo=%252Fpricing', '/dashboard'],
    ['/family?returnTo=%2Ffamily%3FreturnTo%3D%252Fpricing', '/dashboard'],
    ['/dashboard?returnTo=%E0%A4%A', '/dashboard'],
  ];

  for (const [candidate, expected] of cases) {
    assert.equal(safeReturnPath(candidate, 'store'), expected, String(candidate));
  }
});

test('compiled distribution defaults to web and accepts only explicit store', () => {
  const probe = `import { APP_DISTRIBUTION, isStoreDistribution } from './src/lib/app-distribution.ts'; console.log(JSON.stringify({ APP_DISTRIBUTION, isStoreDistribution }));`;
  const run = value => spawnSync(
    process.execPath,
    ['--import', 'tsx', '--input-type=module', '--eval', probe],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        ...(value === undefined
          ? { NEXT_PUBLIC_APP_DISTRIBUTION: '' }
          : { NEXT_PUBLIC_APP_DISTRIBUTION: value }),
      },
    },
  );

  const defaultResult = run(undefined);
  assert.equal(defaultResult.status, 0, defaultResult.stderr);
  assert.deepEqual(JSON.parse(defaultResult.stdout), {
    APP_DISTRIBUTION: 'web',
    isStoreDistribution: false,
  });

  const storeResult = run('store');
  assert.equal(storeResult.status, 0, storeResult.stderr);
  assert.deepEqual(JSON.parse(storeResult.stdout), {
    APP_DISTRIBUTION: 'store',
    isStoreDistribution: true,
  });
});

test('Next configuration rejects an explicitly invalid distribution', () => {
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', '--input-type=module', '--eval', "await import('./next.config.ts')"],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: { ...process.env, NEXT_PUBLIC_APP_DISTRIBUTION: 'native-ish' },
    },
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /NEXT_PUBLIC_APP_DISTRIBUTION must be either "web" or "store"/);
});
