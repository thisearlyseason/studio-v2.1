// Run against a running local app with playwright-cli run-code and this file's contents.
// eslint-disable-next-line @typescript-eslint/no-unused-expressions -- playwright-cli evaluates and invokes this function expression.
async (page) => {
  const origin = await page.evaluate(() => location.origin);
  const results = [];
  for (const width of [1440, 1280, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
    await page.goto(origin);
    await page.getByRole('navigation').waitFor({ state: 'visible' });
    const menu = page.getByRole('button', { name: 'Open navigation menu' });
    const mobileMenu = await menu.isVisible();
    const navOverlaps = await page.getByRole('navigation').evaluate(nav => {
      const groups = Array.from(nav.firstElementChild.children)
        .map(group => group.getBoundingClientRect()).filter(rect => rect.width > 0);
      return groups.some((rect, index) => index > 0 && groups[index - 1].right > rect.left + 1);
    });
    if (navOverlaps) throw new Error(`Navigation groups overlap at ${width}px`);
    if (mobileMenu) await menu.click();
    const navigation = mobileMenu ? page.getByRole('dialog') : page.getByRole('navigation');
    const explore = navigation.getByRole('link', { name: 'Explore Sports', exact: true });
    await explore.waitFor({ state: 'visible', timeout: 5000 });
    await explore.click();
    await page.waitForURL(url => url.pathname === '/sports');
    await page.getByRole('heading', { name: 'Choose your sport' }).waitFor();
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) {
      throw new Error(`Sports directory overflows at ${width}px`);
    }
    await page.locator('a[href="/sports/soccer"]').click();
    await page.waitForURL(url => url.pathname === '/sports/soccer');
    await page.locator('h1').waitFor();
    // The directory must not replace the separate resources destination.
    await page.goto(origin);
    if (mobileMenu) await menu.click();
    await navigation.getByRole('link', { name: 'Sports Hub', exact: true }).click();
    await page.waitForURL(url => url.pathname === '/sports-hub');
    await page.locator('h1').waitFor();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    if (overflow) throw new Error(`Sports Hub overflows at ${width}px`);
    if (mobileMenu) {
      await page.goto(origin);
      await menu.click();
      // Same-page navigation must dismiss the drawer, not hide the destination.
      await page.getByRole('dialog').getByRole('link', { name: 'Pricing', exact: true }).click();
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
      await page.waitForURL(url => url.hash === '#pricing');
      await menu.click();
      // The last menu action must remain reachable even on a short phone screen.
      const signIn = page.getByRole('dialog').getByRole('button', { name: 'Log In', exact: true });
      await signIn.click();
      await page.waitForURL(url => url.pathname === '/login');
    }
    results.push({ width, directoryNavigation: 'PASS', sportNavigation: 'PASS', resourcesNavigation: 'PASS' });
  }
  return results;
}
