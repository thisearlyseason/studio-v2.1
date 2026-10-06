// eslint-disable-next-line @typescript-eslint/no-unused-expressions -- Playwright CLI run-code entrypoint.
async page => {
  const base = 'http://localhost:9017';
  const mode = (await (await page.request.get(base + '/api/app-distribution')).json()).distribution;
  if (!['web', 'store'].includes(mode)) throw Error('Missing local distribution');
  const results = [], errors = [];
  const check = (condition, label) => { if (!condition) throw Error(label); results.push('PASS ' + label); };
  const context = await page.context().browser().newContext();
  const p = await context.newPage();
  p.on('pageerror', error => errors.push(error.message));
  try {
    await p.goto(base + '/login');
    await p.getByRole('heading', { name: 'Sign In', exact: true }).waitFor();
    if (mode === 'store') await p.getByRole('status').filter({ hasText: 'Provider sign-in is unavailable in this app version.' }).waitFor();
    else await p.getByRole('button', { name: 'Continue with Google', exact: true }).waitFor();
    for (const width of [1440, 390]) {
      await p.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      check(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), mode + ' login fits ' + width);
    }
    // Confirm client hydration through a real reversible control before typing
    // into a development server's just-streamed SSR form.
    await p.getByRole('button', { name: 'Show password', exact: true }).click();
    await p.getByRole('button', { name: 'Hide password', exact: true }).waitFor();
    await p.getByRole('button', { name: 'Hide password', exact: true }).click();
    await p.locator('#email:visible').fill('native-auth-qa-coach@local.test');
    await p.locator('#password:visible').fill('NativeAuthLocal!2026');
    await p.getByRole('button', { name: 'Sign In', exact: true }).click();
    await p.waitForURL(url => url.pathname === '/dashboard', { timeout: 30000 });
    check((await (await p.request.get(base + '/api/auth/session')).json()).uid === 'native-auth-qa-coach', mode + ' real emulator email login preserves UID');
    await p.goto(base + '/settings');
    await p.getByRole('button', { name: 'Sign Out', exact: true }).click();
    await p.waitForURL(url => url.pathname === '/login', { timeout: 30000 });
    check((await p.request.get(base + '/api/auth/session')).status() === 401, mode + ' logout clears cookie');
    if (mode === 'web') {
      check(await p.getByRole('button', { name: 'Continue with Google', exact: true }).isVisible(), 'ordinary Google popup control retained');
      check(errors.length === 0, 'web no uncaught browser errors');
      return results;
    }
    await context.addInitScript(() => {
      window.squadNativeAuthCapabilities = { version: 1, providers: ['google.com', 'apple.com'] };
      window.nativeQA = { latest: null, beginCount: 0 };
      window.squadNativeAuth = { postMessage(raw) { const data = JSON.parse(raw); if (data.type === 'begin') { window.nativeQA.latest = data; window.nativeQA.beginCount++; } } };
    });
    const ready = async onboarding => p.evaluate(needsOnboarding => {
      window.squadNativeAuth.onmessage({ data: JSON.stringify({ version: 1, type: 'ready', requestId: window.nativeQA.latest.requestId, handle: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', needsOnboarding }) });
    }, onboarding);
    let redeemed = 0, lastInput, successUid = null, sessionPosts = 0;
    const fixtureTokens = await p.evaluate(() => Object.fromEntries(['coach', 'parent', 'adult_player'].map(role => {
      const uid = 'native-auth-qa-' + role;
      const encode = object => btoa(JSON.stringify(object)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      return [uid, encode({ alg: 'none', typ: 'JWT' }) + '.' + encode({ uid, iss: 'qa@demo-native-auth-test.iam.gserviceaccount.com', sub: 'qa@demo-native-auth-test.iam.gserviceaccount.com', aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 }) + '.'];
    })));
    p.on('request', request => { if (request.url().endsWith('/api/auth/session') && request.method() === 'POST') sessionPosts++; });
    await p.route('**/api/native-auth/redeem', route => {
      redeemed++; lastInput = route.request().postDataJSON();
      if (!successUid) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'unavailable' }) });
      // Auth-emulator-only token; not provider proof. Never save or print it.
      const customToken = fixtureTokens[successUid];
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ uid: successUid, customToken, returnPath: '/teams/join?code=QA_CODE' }) });
    });
    await p.goto(base + '/login?returnTo=' + encodeURIComponent('/teams/join?code=QA_CODE'));
    await p.getByRole('button', { name: 'Continue with Google', exact: true }).click();
    check(await p.locator('#email').isDisabled(), 'native attempt blocks competing email sign-in');
    check(await p.getByRole('button', { name: 'Continue with Apple', exact: true }).isDisabled(), 'duplicate provider actions disabled');
    await p.getByRole('button', { name: 'Cancel sign-in', exact: true }).click();
    await ready(false);
    check(redeemed === 0, 'cancelled late native result never redeems');
    check(await p.locator('#email').isEnabled(), 'cancel restores email controls');
    await p.getByRole('button', { name: 'Continue with Google', exact: true }).click();
    await ready(true);
    await p.getByRole('heading', { name: 'Create your free account', exact: true }).waitFor();
    check(redeemed === 0, 'new identity waits for explicit onboarding');
    check(await p.locator('#native-join-code').inputValue() === 'QA_CODE', 'pending team code preserved');
    await p.getByRole('button', { name: 'Create free account', exact: true }).click();
    await p.getByText('Enter your name and confirm your age and agreement to continue.').waitFor();
    check(redeemed === 0, 'missing consent never redeems');
    for (const width of [1440, 390]) {
      await p.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      check(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'free onboarding fits ' + width);
    }
    await p.locator('#native-name').fill('Local QA Athlete');
    await p.getByRole('checkbox', { name: 'I confirm I am 18 or older.' }).check();
    await p.getByRole('checkbox', { name: /I agree to the/ }).check();
    await p.screenshot({ path: 'output/playwright/native-auth-onboarding-mobile.png', fullPage: true });
    await p.getByRole('button', { name: 'Create free account', exact: true }).click();
    await p.getByText(/Sign-in could not be completed/).waitFor();
    check(lastInput.onboarding.adultConfirmed && lastInput.onboarding.termsAccepted, 'consent reaches strict server payload');
    check((await p.request.get(base + '/api/auth/session')).status() === 401, 'failed redemption grants no session');
    for (const role of ['coach', 'parent', 'adult_player']) {
      successUid = 'native-auth-qa-' + role;
      await p.goto(base + '/login');
      sessionPosts = 0;
      await p.getByRole('button', { name: 'Continue with Google', exact: true }).click();
      await ready(false);
      await p.waitForURL(url => url.pathname === '/teams/join', { timeout: 30000 });
      await p.getByRole('button', { name: 'Review Team', exact: true }).waitFor();
      check((await (await p.request.get(base + '/api/auth/session')).json()).uid === successUid, role + ' emulator handoff keeps server UID');
      check(sessionPosts === 1, role + ' login observer does not race native session setup');
      await p.reload();
      await p.getByRole('button', { name: 'Review Team', exact: true }).waitFor();
      check((await (await p.request.get(base + '/api/auth/session')).json()).uid === successUid, role + ' identity persists after reload');
      check(await p.getByRole('link', { name: /Upgrade|Checkout|Manage Subscription/i }).count() === 0, role + ' store page has no purchase links');
      await p.goto(base + '/settings');
      await p.getByRole('button', { name: 'Sign Out', exact: true }).click();
      await p.waitForURL(url => url.pathname === '/login', { timeout: 30000 });
      await p.reload();
      check((await p.request.get(base + '/api/auth/session')).status() === 401, role + ' logout and reload do not restore native identity');
    }
    check(errors.length === 0, 'store no uncaught browser errors');
    return results;
  } finally { await context.close(); }
}
