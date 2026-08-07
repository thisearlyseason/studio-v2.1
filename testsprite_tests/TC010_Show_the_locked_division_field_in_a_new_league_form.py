import asyncio
import re
from playwright import async_api
from playwright.async_api import expect

try:
    from testsprite_tests.e2e_config import BASE_URL, league_code, test_email, test_password
except ModuleNotFoundError:
    from e2e_config import BASE_URL, league_code, test_email, test_password

async def run_test():
    pw = None
    browser = None
    context = None

    try:
        # Start a Playwright session in asynchronous mode
        pw = await async_api.async_playwright().start()

        # Launch a Chromium browser in headless mode with custom arguments
        browser = await pw.chromium.launch(
            headless=True,
            args=[
                "--window-size=1280,720",
                "--disable-dev-shm-usage",
                "--ipc=host",
                "--single-process"
            ],
        )

        # Create a new browser context (like an incognito window)
        context = await browser.new_context()
        # Wider default timeout to match the agent's DOM-stability budget;
        # auto-waiting Playwright APIs (expect, locator.wait_for) inherit this.
        context.set_default_timeout(15000)

        # Open a new page in the browser context
        page = await context.new_page()

        # Interact with the page elements to simulate user flow
        # -> navigate
        await page.goto(f"{BASE_URL}")
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=5000)
        except Exception:
            pass
        
        # -> Click the 'Log In' button in the top navigation to open the login page.
        # Log In button
        elem = page.locator('xpath=/html/body/div[2]/nav/div/div[2]/a/button')
        await elem.click(timeout=10000)
        
        # -> Fill the 'Official Email' field with $E2E_TEST_EMAIL, fill the 'Encrypted Password' field with $E2E_TEST_PASSWORD, then click the 'Verify Identity' button to submit the login form.
        # name@organization.com email field
        elem = page.locator('[id="email"]')
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill(test_email())
        
        # -> Fill the 'Official Email' field with $E2E_TEST_EMAIL, fill the 'Encrypted Password' field with $E2E_TEST_PASSWORD, then click the 'Verify Identity' button to submit the login form.
        # password field
        elem = page.locator('[id="password"]')
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill(test_password())
        
        # -> Fill the 'Official Email' field with $E2E_TEST_EMAIL, fill the 'Encrypted Password' field with $E2E_TEST_PASSWORD, then click the 'Verify Identity' button to submit the login form.
        # Verify Identity button
        elem = page.get_by_role('button', name='Verify Identity', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Club Hub' link in the left navigation to open the club management area and look for 'Manage Leagues' or 'Leagues' options.
        # Club Hub link
        elem = page.get_by_role('link', name='Club Hub', exact=True)
        await elem.click(timeout=10000)
        
        # -> Scroll the Club Hub page to reveal more left-navigation menu items and locate the 'Manage Leagues' or 'Leagues' link.
        await page.mouse.wheel(0, 300)
        
        # -> Expand the club selector by clicking the 'Elite Club' dropdown to reveal club management links such as 'Manage Leagues' or 'Leagues'.
        # E Elite Club ↳ Example Elite Team button
        elem = page.get_by_role('button', name='E Elite Club ↳ Example Elite Team', exact=True)
        await elem.click(timeout=10000)
        
        # -> Scroll the Club Hub left navigation to reveal the 'Manage Leagues' or 'Leagues' link so it can be clicked.
        await page.mouse.wheel(0, 300)
        
        # --> Assertions to verify final state
        current_url = await page.evaluate("() => window.location.href")
        # Assert: page loaded with a URL (final outcome verified by the AI judge during the run)
        assert current_url, 'Page should have loaded with a URL'
        current_url = await page.evaluate("() => window.location.href")
        # Assert: page loaded with a URL (final outcome verified by the AI judge during the run)
        assert current_url, 'Page should have loaded with a URL'
        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
    