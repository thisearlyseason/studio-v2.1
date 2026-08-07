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
        
        # -> Fill the email field with test_email(), fill the password field with test_password(), and click the 'Verify Identity' button to submit the login form.
        # name@organization.com email field
        elem = page.locator('[id="email"]')
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill(test_email())
        
        # -> Fill the email field with test_email(), fill the password field with test_password(), and click the 'Verify Identity' button to submit the login form.
        # password field
        elem = page.locator('[id="password"]')
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill(test_password())
        
        # -> Fill the email field with test_email(), fill the password field with test_password(), and click the 'Verify Identity' button to submit the login form.
        # Verify Identity button
        elem = page.get_by_role('button', name='Verify Identity', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Club Hub' link in the left navigation to open club management and reveal league-related actions.
        # Club Hub link
        elem = page.get_by_role('link', name='Club Hub', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Competition Hub' link in the left navigation to open the area that manages competitions and leagues.
        # Competition Hub link
        elem = page.get_by_role('link', name='Competition Hub', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Launch League Architect' button to open the protocol architect (the red 'Launch League Architect' button near the top-right of the Competition Hub).
        # Launch League Architect button
        elem = page.get_by_role('button', name='Launch League Architect', exact=True)
        await elem.click(timeout=10000)
        
        # -> Fill the 'League Title' field with a unique name and click the 'Deploy Hub' button to create the hub so registration form creation becomes available.
        # e.g. State Varsity Premier text field
        elem = page.get_by_placeholder('e.g. State Varsity Premier', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("Automated Registration Form TEST 2026-06-22")
        
        # -> Fill the 'League Title' field with a unique name and click the 'Deploy Hub' button to create the hub so registration form creation becomes available.
        # Deploy Hub button
        elem = page.get_by_role('button', name='Deploy Hub', exact=True)
        await elem.click(timeout=10000)
        
        # -> Close the 'League Architect' modal dialog, then search the Competition Hub page for the league titled 'Automated Registration Form TEST 2026-06-22' to verify the new form appears in the existing forms list.
        # Close button
        elem = page.get_by_role('button', name='Close', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Launch League Architect' button to re-open the architect modal and check whether the newly deployed hub 'Automated Registration Form TEST 2026-06-22' appears in the architect's list.
        # Launch League Architect button
        elem = page.get_by_role('button', name='Launch League Architect', exact=True)
        await elem.click(timeout=10000)
        
        # -> Close the 'League Architect' dialog by clicking the 'Close' button, then search the Competition Hub page for the text 'Automated Registration Form TEST 2026-06-22' to verify the new form appears in the list.
        # Close button
        elem = page.get_by_role('button', name='Close', exact=True)
        await elem.click(timeout=10000)
        
        # -> Reload the Competition Hub page to refresh the forms list, then search the page for the deployed title 'Automated Registration Form TEST 2026-06-22' to verify whether the new hub appears in the list.
        await page.goto(f"{BASE_URL}/competition")
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=5000)
        except Exception:
            pass
        
        # -> Open the 'Launch League Architect' modal from the Competition Hub to inspect the list of deployed hubs and check for 'Automated Registration Form TEST 2026-06-22'.
        # Launch League Architect button
        elem = page.get_by_role('button', name='Launch League Architect', exact=True)
        await elem.click(timeout=10000)
        
        # -> Close the 'League Architect' dialog by clicking the 'Close' button, then search the Competition Hub page for the exact title 'Automated Registration Form TEST 2026-06-22' to verify the new form appears in the list.
        # Close button
        elem = page.get_by_role('button', name='Close', exact=True)
        await elem.click(timeout=10000)
        
        # --> Assertions to verify final state
        
        # --> Verify the new form appears in the existing forms list
        # Assert: Expected the forms list to include 'Automated Registration Form TEST 2026-06-22'.
        await expect(page.locator("xpath=/html/body/div[2]/div/div/div/div/div[2]/div[1]/main/div/div[2]/div[2]").nth(0)).to_contain_text("Automated Registration Form TEST 2026-06-22", timeout=15000), "Expected the forms list to include 'Automated Registration Form TEST 2026-06-22'."
        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
    