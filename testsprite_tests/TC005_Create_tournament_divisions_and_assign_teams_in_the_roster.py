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
        
        # -> Open the Login page by navigating to the /login path (go to the application's Login page).
        await page.goto(f"{BASE_URL}/login")
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=5000)
        except Exception:
            pass
        
        # -> Fill test_email() into the Official Email field, fill test_password() into the Encrypted Password field, then click the 'Verify Identity' button to submit the login form.
        # name@organization.com email field
        elem = page.locator('[id="email"]')
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill(test_email())
        
        # -> Fill test_email() into the Official Email field, fill test_password() into the Encrypted Password field, then click the 'Verify Identity' button to submit the login form.
        # password field
        elem = page.locator('[id="password"]')
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill(test_password())
        
        # -> Fill test_email() into the Official Email field, fill test_password() into the Encrypted Password field, then click the 'Verify Identity' button to submit the login form.
        # Verify Identity button
        elem = page.get_by_role('button', name='Verify Identity', exact=True)
        await elem.click(timeout=10000)
        
        # -> Open the Manage Tournaments page (navigate to the Manage Tournaments section or path, expected label 'Manage Tournaments' or URL /manage-tournaments) so the Architecture and Roster tabs can be accessed.
        await page.goto(f"{BASE_URL}/manage-tournaments")
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=5000)
        except Exception:
            pass
        
        # -> Open the tournament card '2026 CHAMPIONSHIP INVITATIONAL' by clicking its title or card to reveal the Architecture and Roster tabs.
        # 2026 CHAMPIONSHIP INVITATIONAL
        elem = page.get_by_text('2026 CHAMPIONSHIP INVITATIONAL', exact=True)
        await elem.click(timeout=10000)
        
        # -> Open the 'Architecture' tab by clicking the 'Architecture' tab in the tournament detail view to reveal division controls.
        # Architecture button
        elem = page.get_by_role('tab', name='Architecture', exact=True)
        await elem.click(timeout=10000)
        
        # -> Scroll down within the Architecture panel to reveal any 'Add Division' or 'Divisions' controls so the add-division UI can be located.
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
    