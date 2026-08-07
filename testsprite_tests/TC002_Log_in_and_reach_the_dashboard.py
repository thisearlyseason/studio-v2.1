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
        
        # -> Click the 'Log In' button in the page header to open the login page or modal.
        # Log In button
        elem = page.locator('xpath=/html/body/div[2]/nav/div/div[2]/a/button')
        await elem.click(timeout=10000)
        
        # -> Fill the email field with $E2E_TEST_EMAIL, fill the password field with $E2E_TEST_PASSWORD, then click the 'Verify Identity' button to submit the login form.
        # name@organization.com email field
        elem = page.locator('[id="email"]')
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill(test_email())
        
        # -> Fill the email field with $E2E_TEST_EMAIL, fill the password field with $E2E_TEST_PASSWORD, then click the 'Verify Identity' button to submit the login form.
        # password field
        elem = page.locator('[id="password"]')
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill(test_password())
        
        # -> Fill the email field with $E2E_TEST_EMAIL, fill the password field with $E2E_TEST_PASSWORD, then click the 'Verify Identity' button to submit the login form.
        # Verify Identity button
        elem = page.get_by_role('button', name='Verify Identity', exact=True)
        await elem.click(timeout=10000)
        
        # --> Assertions to verify final state
        
        # --> Verify the dashboard is displayed
        # Assert: The browser URL contains "/dashboard", confirming the dashboard route is loaded.
        await expect(page).to_have_url(re.compile("/dashboard"), timeout=15000), "The browser URL contains \"/dashboard\", confirming the dashboard route is loaded."
        await page.locator("xpath=/html/body/div[2]/div/div/div/div/div[1]/div[2]/div/div[1]/ul/li[1]/a").nth(0).scroll_into_view_if_needed()
        # Assert: The 'Dashboard' navigation link is visible, indicating the dashboard is displayed.
        await expect(page.locator("xpath=/html/body/div[2]/div/div/div/div/div[1]/div[2]/div/div[1]/ul/li[1]/a").nth(0)).to_be_visible(timeout=15000), "The 'Dashboard' navigation link is visible, indicating the dashboard is displayed."
        
        # --> Verify the authenticated workspace is visible
        await page.locator("xpath=/html/body/div[2]/div/div/div/div/div[1]/div[2]/div/div[1]/button").nth(0).scroll_into_view_if_needed()
        # Assert: Left navigation shows the club/team selector (Elite Club / Example Elite Team) and is visible.
        await expect(page.locator("xpath=/html/body/div[2]/div/div/div/div/div[1]/div[2]/div/div[1]/button").nth(0)).to_be_visible(timeout=15000), "Left navigation shows the club/team selector (Elite Club / Example Elite Team) and is visible."
        await page.locator("xpath=/html/body/div[2]/div/div/div/div/div[2]/div[1]/main/div/header/div[2]/button[1]").nth(0).scroll_into_view_if_needed()
        # Assert: The 'New Squad' action button is visible on the dashboard.
        await expect(page.locator("xpath=/html/body/div[2]/div/div/div/div/div[2]/div[1]/main/div/header/div[2]/button[1]").nth(0)).to_be_visible(timeout=15000), "The 'New Squad' action button is visible on the dashboard."
        await page.locator("xpath=/html/body/div[2]/div/div/div/div/div[2]/div[1]/main/div/header/div[2]/button[2]").nth(0).scroll_into_view_if_needed()
        # Assert: The 'Portals' action button is visible on the dashboard.
        await expect(page.locator("xpath=/html/body/div[2]/div/div/div/div/div[2]/div[1]/main/div/header/div[2]/button[2]").nth(0)).to_be_visible(timeout=15000), "The 'Portals' action button is visible on the dashboard."
        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
    