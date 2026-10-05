// Run with Playwright CLI after loading an approved, untracked public fixture
// manifest into `configuration` and signing in to its isolated QA account.
// Never include passwords/tokens in that manifest. This is browser/session
// evidence only, not proof of a native provider chooser or physical device.
// eslint-disable-next-line @typescript-eslint/no-unused-expressions -- Playwright run-code function.
async ({ page, configuration }) => {
  const approved = 'https://thesquadv2-native-store-qa-tylers-projects-5b59182e.vercel.app';
  const config = configuration;
  if (!config || config.base !== approved || config.approvedBase !== approved ||
      config.isolatedFixture !== true || typeof config.expectedUid !== 'string' ||
      !config.expectedUid || !Array.isArray(config.routes) || config.routes.length === 0) {
    throw Error('Approved isolated hosted QA fixture is required');
  }
  for (const route of config.routes) {
    if (!['/dashboard', '/teams/join', '/schedule', '/chats', '/settings'].includes(route.path) ||
        typeof route.heading !== 'string' || !route.heading) throw Error('Invalid QA navigation assertion');
  }
  const results = [], errors = [];
  const capture = () => errors.push('Uncaught page error');
  page.on('pageerror', capture);
  const check = (condition, label) => { if (!condition) throw Error(label); results.push(`PASS ${label}`); };
  const verifySession = async () => {
    const response = await page.request.get(approved + '/api/auth/session');
    check(response.status() === 200, 'authenticated hosted session');
    check((await response.json()).uid === config.expectedUid, 'expected isolated Firebase UID');
  };
  try {
    const distribution = await page.request.get(approved + '/api/app-distribution');
    check(distribution.status() === 200 && (await distribution.json()).distribution === 'store', 'hosted store distribution');
    await verifySession();
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      for (const route of config.routes) {
        await page.goto(approved + route.path);
        await page.getByRole('heading', { name: route.heading, exact: true }).waitFor();
        check(new URL(page.url()).origin === approved, 'navigation stays on approved QA origin');
        check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${route.path} fits ${width}`);
        check(await page.getByRole('link', { name: /Upgrade|Checkout|Manage Subscription/i }).count() === 0, 'no store purchase links');
        await page.reload();
        await page.getByRole('heading', { name: route.heading, exact: true }).waitFor();
        await verifySession();
      }
    }
    check(errors.length === 0, 'no uncaught hosted browser errors');
    return results;
  } finally { page.off('pageerror', capture); }
}
