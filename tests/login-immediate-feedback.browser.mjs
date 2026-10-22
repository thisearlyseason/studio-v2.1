// Run against the unchanged Next app with fictional Firebase config. This test
// intercepts network boundaries only; it uses the real page, SDK, providers and router.
// PLAYWRIGHT_MODULE may point to an existing Playwright installation.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.SQUAD_LOGIN_BASE_URL || 'http://127.0.0.1:9371';
assert.ok(/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin), 'localhost only');
const output = process.env.SQUAD_LOGIN_OUTPUT_DIR || 'output/playwright/login-feedback';
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const passed = [];
const networks = [];
let activeFixtureState;
const deferred = () => {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
};
const jwt = () => ['eyJhbGciOiJub25lIn0', Buffer.from(JSON.stringify({
  iss: 'https://securetoken.google.com/demo-squad-login-local',
  aud: 'demo-squad-login-local', user_id: 'fixture-user', sub: 'fixture-user',
  auth_time: Math.floor(Date.now() / 1000), iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 3600, email: 'qa@example.com',
  email_verified: true, firebase: { identities: { email: ['qa@example.com'] }, sign_in_provider: 'password' },
})).toString('base64url'), 'fixture-signature'].join('.');

async function fixture(options = {}) {
  const context = await browser.newContext({ serviceWorkers: 'block', ...options });
  const state = { authCount: 0, sessionCount: 0, submitted: [], errors: [], network: [] };
  activeFixtureState = state;
  const success = () => ({ localId: 'fixture-user', email: 'qa@example.com',
    idToken: jwt(), registered: true, refreshToken: 'fixture-refresh', expiresIn: '3600' });
  const json = (route, body, status = 200) => route.fulfill({ status,
    contentType: 'application/json', body: JSON.stringify(body) });
  await context.route('**/*', async route => {
    const req = route.request();
    const url = new URL(req.url());
    state.network.push({ path: url.origin + url.pathname, method: req.method() });
    if (url.hostname === 'identitytoolkit.googleapis.com') {
      if ((url.pathname.endsWith('/recaptchaConfig') || url.pathname.endsWith('getRecaptchaConfig'))) {
        if (state.configGate) await state.configGate.promise;
        if (state.configFailure) return json(route, { error: { message: 'INVALID_API_KEY' } }, 400);
        return json(route, { recaptchaEnforcementState: [] });
      }
      if (url.pathname.endsWith('signInWithPassword')) {
        state.authCount++;
        state.submitted.push(req.postDataJSON());
        if (state.authGate) await state.authGate.promise;
        if (state.missingRecaptcha) return json(route, { error: { message: 'MISSING_RECAPTCHA_TOKEN' } }, 400);
        if (state.authFailure) return json(route, { error: { message: 'INVALID_LOGIN_CREDENTIALS' } }, 400);
        return json(route, success());
      }
      if (url.pathname.endsWith('lookup')) return json(route, { users: [{
        localId: 'fixture-user', email: 'qa@example.com', emailVerified: state.verified !== false,
        displayName: 'Fixture', providerUserInfo: [{ providerId: 'password', email: 'qa@example.com', rawId: 'qa@example.com' }],
        createdAt: '1700000000000', lastLoginAt: '1700000000000',
      }] });
    }
    if (url.hostname === 'securetoken.googleapis.com') {
      if (state.tokenGate) await state.tokenGate.promise;
      return json(route, { access_token: jwt(), expires_in: '3600', token_type: 'Bearer',
        refresh_token: 'fixture-refresh', id_token: jwt(), user_id: 'fixture-user', project_id: 'demo-squad-login-local' });
    }
    if (url.origin === origin) {
      if (state.hydrationGate && url.pathname.endsWith('/chunks/app/login/page.js')) {
        await state.hydrationGate.promise;
      }
      if (url.pathname === '/_next/image') return route.fulfill({ status: 404, body: '' });
      if (url.pathname === '/api/auth/session') {
        if (req.method() === 'POST') {
          state.sessionCount++;
          if (state.sessionGate) await state.sessionGate.promise;
          return json(route, { ok: !state.sessionFailure }, state.sessionFailure ? 503 : 200);
        }
        return json(route, { ok: true });
      }
      if (state.navigationGate && url.pathname === '/how-to' && url.searchParams.has('_rsc')) {
        state.navigationSeen = true;
        await state.navigationGate.promise;
      }
      return route.continue();
    }
    // No real provider, customer data, image or telemetry traffic is allowed.
    return route.abort();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.setDefaultNavigationTimeout(20000);
  page.on('pageerror', e => state.errors.push(e.stack));
  const open = async (suffix = '?returnTo=%2Fhow-to') => {
    await page.goto(origin + '/login' + suffix);
    await page.locator('#email').fill('qa@example.com');
    await page.locator('#password').fill('fixture-password');
  };
  const busy = async label => {
    const button = page.getByRole('button', { name: 'Logging in…', exact: true });
    await button.waitFor();
    assert.equal(await button.isDisabled(), true, label);
    assert.equal(await page.locator('form').getAttribute('aria-busy'), 'true', label);
    const status = page.getByRole('status').filter({ hasText: 'Logging in. Please wait.' });
    assert.equal(await status.count(), 1, label);
    assert.equal(await status.evaluate(el => !!el.closest('[aria-busy="true"]')), false,
      'announcement must not be deferred by busy ancestor');
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    assert.equal(await button.isVisible(), true, label);
  };
  const close = async () => {
    assert.deepEqual(state.errors, [], 'no page errors');
    networks.push(state.network);
    await context.close();
  };
  return { context, page, state, open, busy, close };
}

try {

  {
    const f = await fixture({viewport:{width:834,height:1194},hasTouch:true});
    await f.context.addInitScript(() => {
      window.squadNativeAuthCapabilities={version:1,providers:['apple.com']};
      window.nativeBeginCount=0;window.nativeButtonAtBridge=[];
      window.webkit={messageHandlers:{squadNativeAuth:{postMessage(message){
        if(message.type==='cancel')return Promise.resolve({version:1,type:'cancelled',requestId:message.requestId});
        window.nativeBeginCount++;window.nativeButtonAtBridge.push(document.querySelector('[aria-label="App sign-in"] button')?.textContent);
        return new Promise((resolve,reject)=>{window.rejectNativeFixture=()=>reject(Error('synthetic-native-cancellation'));});
      }}}};
    });
    await f.open();
    const apple=f.page.getByRole('button',{name:'Continue with Apple',exact:true});await apple.waitFor();
    const immediate=await apple.evaluate(button=>{button.click();return{text:button.textContent,disabled:button.disabled,busy:button.getAttribute('aria-busy')};});
    assert.equal(immediate.text,'Logging in…','actual native provider button changes in click task');assert.equal(immediate.disabled,true);assert.equal(immediate.busy,'true');
    await f.page.waitForFunction(()=>window.nativeBeginCount===1);
    assert.deepEqual(await f.page.evaluate(()=>window.nativeButtonAtBridge),['Logging in…']);
    await f.page.evaluate(()=>{const b=document.querySelector('[aria-label="App sign-in"] button');b.click();b.click()});assert.equal(await f.page.evaluate(()=>window.nativeBeginCount),1);
    await f.page.evaluate(()=>window.rejectNativeFixture());await f.page.getByRole('alert').filter({hasText:'Sign-in could not be completed'}).waitFor();
    await apple.waitFor();assert(await apple.isEnabled());await apple.click();await f.page.waitForFunction(()=>window.nativeBeginCount===2);await f.page.evaluate(()=>window.rejectNativeFixture());await apple.waitFor();
    await f.close();passed.push('actual store login route: iOS capability/provider bridge fixture reproduces button path, immediate pending, duplicate lock and failure retry');
  }
  {
    const f=await fixture({viewport:{width:834,height:1194},hasTouch:true});f.state.authFailure=true;f.state.authGate=deferred();await f.open();
    await f.page.evaluate(()=>{window.framesAfterSubmit=0;document.querySelector('form').addEventListener('submit',()=>{const frame=()=>{window.framesAfterSubmit++;window.firstPendingFrame??={text:document.querySelector('button[type=submit]').textContent,disabled:document.querySelector('button[type=submit]').disabled};if(window.framesAfterSubmit<3)requestAnimationFrame(frame)};requestAnimationFrame(frame)},{capture:true,once:true});});
    const immediate=await f.page.locator('button[type=submit]').evaluate(button=>{button.click();return{text:button.textContent,disabled:button.disabled};});assert.match(immediate.text,/Logging in/);assert.equal(immediate.disabled,true);await f.page.waitForFunction(()=>window.framesAfterSubmit>=2);assert.match((await f.page.evaluate(()=>window.firstPendingFrame)).text,/Logging in/);await f.busy('immediate DOM and rendering-opportunity feedback on actual route');
    f.state.authGate.resolve();await f.page.getByText('Login Failed',{exact:true}).waitFor();assert(await f.page.getByRole('button',{name:'Sign In',exact:true}).isEnabled());await f.close();passed.push('actual email login click task and first rendering frame show pending before held SDK response; error retries unlock');
  }

  {
    const f = await fixture();
    f.state.authFailure = true;
    await f.open();
    await f.page.locator('#email').fill('');
    await f.page.getByRole('button', { name: 'Sign In', exact: true }).click();
    assert.equal(f.state.authCount, 0);
    await f.page.locator('#email').fill('invalid');
    await f.page.locator('#password').press('Enter');
    assert.equal(f.state.authCount, 0);
    await f.page.locator('#email').fill('qa@example.com');
    f.state.authGate = deferred();
    await f.page.locator('#password').press('Enter');
    await f.busy('valid Enter shows pending before network resolves');
    await f.page.getByRole('button', { name: 'Forgot?', exact: true }).isDisabled().then(v => assert.equal(v, true));
    await f.page.locator('#password').press('Enter');
    await f.page.evaluate(() => { const form = document.querySelector('form');
      for (let i = 0; i < 5; i++) form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    await f.page.waitForTimeout(100);
    assert.equal(f.state.authCount, 1, 'one SDK request across duplicate submissions');
    f.state.authGate.resolve();
    await f.page.getByText('Login Failed', { exact: true }).waitFor();
    assert.equal(await f.page.getByRole('button', { name: 'Sign In', exact: true }).isEnabled(), true);
    f.state.authFailure = false;
    f.state.sessionFailure = true;
    f.state.sessionGate = deferred();
    await f.page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await f.page.waitForFunction(() => document.querySelector('form')?.getAttribute('aria-busy') === 'true');
    await f.page.waitForTimeout(200);
    await f.busy('valid click remains pending after Firebase success');
    f.state.sessionGate.resolve();
    await f.page.getByText('Session Setup Failed', { exact: true }).waitFor();
    assert.equal(await f.page.getByRole('button', { name: 'Sign In', exact: true }).isEnabled(), true);
    f.state.sessionFailure = false;
    f.state.sessionGate = deferred();
    // Autofill can update the DOM without an input/change event.
    await f.page.evaluate(() => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      set.call(document.getElementById('email'), 'AUTOFILL@example.com');
      set.call(document.getElementById('password'), '  fixture-password  ');
    });
    await f.page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await f.busy('autofill submits immediately');
    await f.page.waitForTimeout(200);
    assert.equal(f.state.submitted.at(-1).email, 'autofill@example.com');
    assert.equal(f.state.submitted.at(-1).password, '  fixture-password  ');
    if (process.env.SQUAD_LOGIN_DISTRIBUTION === 'store') {
      // Headless Chrome has no native provider bridge; do not manufacture one
      // or confuse its absent provider button with an email-login defect.
      await f.page.getByText('Provider sign-in is unavailable in this app version. Please use email and password below.', { exact: true }).waitFor();
    } else {
      assert.equal(await f.page.getByRole('button', { name: 'Continue with Google' }).isDisabled(), true);
    }
    f.state.navigationGate = deferred();
    f.state.sessionGate.resolve();
    await f.page.waitForTimeout(500);
    assert.equal(f.state.navigationSeen, true, 'actual Next RSC navigation starts');
    await f.busy('pending survives until navigation commits');
    await f.page.screenshot({ path: path.join(output, 'pending-navigation.png') });
    f.state.navigationGate.resolve();
    await f.page.waitForURL('**/how-to');
    await f.close();
    passed.push('native validation; click/Enter; same-turn duplicates; error and session-failure retries; DOM autofill; navigation delay and return URL');
  }
  {
    const f = await fixture({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    f.state.tokenGate = deferred();
    await f.open();
    await f.page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await f.busy('mobile reduced-motion pending during forced token refresh');
    await f.page.waitForTimeout(300);
    assert.equal(f.state.sessionCount, 0, 'token refresh precedes cookie exchange');
    await f.page.screenshot({ path: path.join(output, 'mobile-token-pending.png') });
    f.state.tokenGate.resolve();
    await f.page.waitForURL('**/how-to');
    await f.close();
    passed.push('mobile/reduced-motion visible label and live status through token refresh');
  }
  {
    const f = await fixture();
    f.state.configGate = deferred();
    f.state.configFailure = true;
    f.state.missingRecaptcha = true;
    await f.open();
    await f.page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await f.page.waitForTimeout(250);
    await f.busy('real Firebase reCAPTCHA preflight remains pending');
    assert.ok(f.state.network.some(r => r.path.endsWith('/recaptchaConfig')));
    f.state.configGate.resolve();
    await f.page.getByText('Login Failed', { exact: true }).waitFor();
    assert.equal(await f.page.getByRole('button', { name: 'Sign In', exact: true }).isEnabled(), true);
    await f.close();
    passed.push('SDK reCAPTCHA config/preflight error retains feedback and restores retry');
  }
  {
    const f = await fixture();
    f.state.hydrationGate = deferred();
    await f.page.goto(origin + '/login', { waitUntil: 'commit' });
    await f.page.locator('#email').waitFor({ state: 'attached' });
    const observation = await f.page.locator('form').evaluate(form => ({
      visible: !!form.getBoundingClientRect().height && getComputedStyle(form).visibility !== 'hidden',
      buttonDisabled: form.querySelector('button[type=submit]').disabled,
      buttonText: form.querySelector('button[type=submit]').textContent,
      busy: form.getAttribute('aria-busy'),
      hiddenAncestor: !!form.closest('[hidden]'),
    }));
    await fs.writeFile(path.join(output, 'hydration-observation.json'), JSON.stringify(observation, null, 2));
    assert.equal(observation.buttonDisabled, true, 'pre-hydration submit is disabled');
    assert.equal(observation.busy, 'true');
    assert.equal(observation.buttonText, 'Preparing sign-in…', 'pre-hydration feedback is visible');
    assert.equal(await f.page.locator('#email').isDisabled(), true, 'cannot type into unhydrated controlled email');
    assert.equal(await f.page.locator('#password').isDisabled(), true, 'cannot type into unhydrated controlled password');
    await f.page.keyboard.press('Enter');
    await f.page.waitForTimeout(100);
    assert.equal(f.state.authCount, 0, 'Enter before hydration cannot start authentication');
    assert.equal(new URL(f.page.url()).pathname, '/login', 'Enter before hydration does not navigate');
    f.state.hydrationGate.resolve();
    await f.page.waitForLoadState('domcontentloaded');
    f.state.authGate = deferred();
    await f.page.locator('#email').fill('qa@example.com');
    await f.page.locator('#password').fill('fixture-password');
    await f.page.getByRole('button', { name: 'Sign In', exact: true }).click();
    assert.equal(f.state.submitted.at(-1)?.email ?? await f.page.locator('#email').inputValue(), 'qa@example.com');
    await f.busy('submission after delayed hydration');
    f.state.authFailure = true;
    f.state.authGate.resolve();
    await f.page.getByText('Login Failed', { exact: true }).waitFor();
    await f.close();
    passed.push('actual streamed login route inspected with delayed page hydration; hydrated submit gives pending');
  }
  {
    const f = await fixture();
    f.state.authGate = deferred();
    f.state.authFailure = true;
    await f.open();
    await f.page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await f.page.waitForTimeout(16000);
    await f.busy('original SDK request still owns the lock beyond former 15s timeout');
    await f.page.locator('#password').press('Enter');
    await f.page.evaluate(() => document.querySelector('form').requestSubmit());
    await f.page.waitForTimeout(100);
    assert.equal(f.state.authCount, 1);
    f.state.authGate.resolve();
    await f.page.getByText('Login Failed', { exact: true }).waitFor();
    assert.equal(await f.page.getByRole('button', { name: 'Sign In', exact: true }).isEnabled(), true);
    await f.close();
    passed.push('request ownership beyond 15 seconds; no overlap; failure releases retry');
  }
  await fs.rm(path.join(output, 'failure.json'), { force: true });
  await fs.writeFile(path.join(output, 'actual-route-results.json'), JSON.stringify({ passed, networks }, null, 2));
  console.log(JSON.stringify({ passed }));
} catch (error) {
  await fs.writeFile(path.join(output, 'failure.json'), JSON.stringify({ error: error.stack, passed, networks, active: activeFixtureState }, null, 2));
  throw error;
} finally {
  await browser.close();
}
