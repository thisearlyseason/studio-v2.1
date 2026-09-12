// eslint-disable-next-line @typescript-eslint/no-unused-expressions -- Playwright CLI consumes this function expression.
async page => {
  const base = 'http://localhost:9001';
  const distribution = (await (await page.request.get(base + '/api/app-distribution')).json()).distribution;
  if (!['store', 'web'].includes(distribution)) throw new Error('Missing build identity');
  const store = distribution === 'store';
  const results = [];
  const check = (ok, label) => { if (!ok) throw new Error(label); results.push('PASS ' + label); };
  const roles = [
    ['self', /^Adult Athlete/, 'adult_player'],
    ['child', /^Parent \/ Guardian/, 'parent'],
    ['coach', /^Coach \/ Team/, 'coach'],
    ['school_ad', /^School \/ Athletic/, 'admin'],
    ['league_creator', /^League \/ Tournament/, 'league_creator'],
  ];
  for (const [id, label] of roles) {
    await page.goto(base + '/signup');
    await page.getByRole('radio', { name: label }).click();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    if (id === 'self' || id === 'child') {
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
    } else if (!store) {
      check(await page.getByText('Choose Your Plan', { exact: true }).isVisible(), id + ' website plan step remains');
      if (id !== 'school_ad') await page.getByText('Starter', { exact: true }).click();
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
    }
    await page.locator('#signup-name').waitFor();
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${id} ${viewport.width}px account form fits`);
      if (store) check(!/\$\d|5.day.*trial|Stripe.*checkout|Choose Your Plan/i.test(await page.locator('body').innerText()), id + ' store account has no paid selection');
    }
    await page.locator('#signup-name').fill('Store QA ' + id);
    await page.locator('#signup-email').fill('not-an-email');
    await page.locator('#signup-password').fill('LocalOnly-store-QA-2026!');
    await page.locator('#signup-password-confirmation').fill('Mismatch-password');
    await page.getByRole('button', { name: /Create (?:Free )?Account/i }).click();
    check(await page.locator('#signup-name').isVisible(), id + ' invalid form does not navigate');
    check(!await page.locator('#signup-email').evaluate(el => el.validity.valid), id + ' invalid email rejected');
    await page.locator('#signup-email').fill('validation-only@store-qa.test');
    await page.getByRole('button', { name: /Create (?:Free )?Account/i }).click();
    await page.getByText('Passwords Do Not Match', { exact: true }).waitFor();
    check(true, id + ' password mismatch recovery');
  }
  if (store) {
    for (const path of ['/pricing','/dashboard/billing','/checkout','/register/league/test','/register/tournament/test/test','/events/register/test','/public/donate/test/test']) {
      await page.goto(base + path);
      await page.getByText("This action isn't available in the app", { exact: true }).waitFor();
      check(!await page.getByRole('link', { name: /upgrade|pricing|purchase|checkout/i }).count(), path + ' neutral direct route');
    }
    for (const path of ['/api/checkout','/api/stripe/create-checkout','/api/stripe/customer-portal','/api/stripe/payment-items','/api/stripe/fundraising-link','/api/stripe/connect/onboard']) {
      const response = await page.request.post(base + path, { data: {} });
      check(response.status() === 403, path + ' rejects purchase without reaching auth/provider');
    }
  }
  await page.goto(base + '/signup');
  await page.screenshot({ path: 'output/playwright/sep12-store/' + distribution + '-signup-mobile.png' });
  return { distribution, results };
}
