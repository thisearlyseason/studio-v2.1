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
        
        # -> Click the 'Log In' button in the page header to open the login page.
        # Log In button
        elem = page.locator('xpath=/html/body/div[2]/nav/div/div[2]/a/button')
        await elem.click(timeout=10000)
        
        # -> Fill the email field with test_email(), fill the password field with test_password(), then click the 'Verify Identity' button to submit the login form.
        # name@organization.com email field
        elem = page.locator('[id="email"]')
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill(test_email())
        
        # -> Fill the email field with test_email(), fill the password field with test_password(), then click the 'Verify Identity' button to submit the login form.
        # password field
        elem = page.locator('[id="password"]')
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill(test_password())
        
        # -> Fill the email field with test_email(), fill the password field with test_password(), then click the 'Verify Identity' button to submit the login form.
        # Verify Identity button
        elem = page.get_by_role('button', name='Verify Identity', exact=True)
        await elem.click(timeout=10000)
        
        # -> Open the 'Manage Tournaments' page so the tournament management views can be tested (navigate to the Manage Tournaments page).
        await page.goto(f"{BASE_URL}/manage-tournaments")
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=5000)
        except Exception:
            pass
        
        # -> Scroll the Manage Tournaments page down to reveal the 'Architecture' tab so it can be opened and a division added.
        await page.mouse.wheel(0, 300)
        
        # -> Reveal and open the 'Architecture' tab on the Manage Tournaments page by scrolling the page to find the 'Architecture' tab or related controls.
        await page.mouse.wheel(0, 300)
        
        # -> Scroll the Manage Tournaments page further to reveal the 'Architecture' tab, then search the page for the text 'Architecture' so the tab can be clicked.
        await page.mouse.wheel(0, 300)
        
        # -> click
        # Launch Hub button
        elem = page.get_by_role('button', name='Launch Hub', exact=True)
        await elem.click(timeout=10000)
        
        # --> Assertions to verify final state
        
        # --> Verify the division structure is still present
        await page.locator("xpath=/html/body/div[2]/div/div/div/div/div[2]/div[1]/main/div/div/div[3]/div/div[1]/div/button[6]").nth(0).scroll_into_view_if_needed()
        # Assert: The Architecture tab is visible, confirming the division structure is present.
        await expect(page.locator("xpath=/html/body/div[2]/div/div/div/div/div[2]/div[1]/main/div/div/div[3]/div/div[1]/div/button[6]").nth(0)).to_be_visible(timeout=15000), "The Architecture tab is visible, confirming the division structure is present."
        
        # --> Verify the roster assignment is still present
        await page.locator("xpath=/html/body/div[2]/div/div/div/div/div[2]/div[1]/main/div/div/div[3]/div/div[1]/div/button[5]").nth(0).scroll_into_view_if_needed()
        # Assert: The Roster tab is visible.
        await expect(page.locator("xpath=/html/body/div[2]/div/div/div/div/div[2]/div[1]/main/div/div/div[3]/div/div[1]/div/button[5]").nth(0)).to_be_visible(timeout=15000), "The Roster tab is visible."
        # Assert: The roster shows the team name 'TBD Team 1'.
        await expect(page.locator("xpath=/html/body/div[2]/div/div/div/div/div[2]/div[1]/main/div/div/div[3]/div/div[2]/div[4]/div/div[2]/div").nth(0)).to_contain_text("TBD Team 1", timeout=15000), "The roster shows the team name 'TBD Team 1'."
        # Assert: The roster shows the team name 'TBD Team 2'.
        await expect(page.locator("xpath=/html/body/div[2]/div/div/div/div/div[2]/div[1]/main/div/div/div[3]/div/div[2]/div[4]/div/div[2]/div").nth(0)).to_contain_text("TBD Team 2", timeout=15000), "The roster shows the team name 'TBD Team 2'."
        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
    