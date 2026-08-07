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
        
        # -> Navigate to the login page (/login) and wait for the login form to load so the email and password fields are visible.
        await page.goto(f"{BASE_URL}/login")
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=5000)
        except Exception:
            pass
        
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
        
        # -> Open the 'Competition Hub' (left navigation) to reach league/competition features so a registration protocol can be opened.
        # Competition Hub link
        elem = page.get_by_role('link', name='Competition Hub', exact=True)
        await elem.click(timeout=10000)
        
        # -> Open the league hub by clicking the 'Select Hub' button on the league card titled 'AUTOMATED REGISTRATION FORM TEST 2026-05-27' so the registration protocol and form creation tools can be accessed.
        # Select Hub button
        elem = page.locator('xpath=/html/body/div[2]/div/div/div/div/div[2]/div/main/div/div[2]/div[2]/div/div[2]/div/div/div[2]/div[2]/div/div[2]/button')
        await elem.click(timeout=10000)
        
        # -> Click the 'Portal Architect' button to open the portal/registration builder for this league and reveal registration form or form-creation controls.
        # Portal Architect button
        elem = page.get_by_role('button', name='Portal Architect', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Protocol Architect' (or 'Portal Architect') button to open the registration/protocol builder so the form creation and field list (including Division) are displayed.
        # Protocol Architect button
        elem = page.get_by_role('button', name='Protocol Architect', exact=True)
        await elem.click(timeout=10000)
        
        # -> Search the Protocol/Portal builder page for the 'Division' field; if it's not found in the search results, scroll the Protocol Architect field list to reveal more fields and then inspect again.
        await page.mouse.wheel(0, 300)
        
        # -> Scroll the protocol/form builder to the bottom to reveal any hidden fields, then search the page for the text 'Division' to determine whether the Division field is present.
        await page.mouse.wheel(0, 300)
        
        # -> Scroll the protocol/form builder down further to reveal hidden fields and then search the page for the text 'Division' to determine whether the Division field exists and is visible.
        await page.mouse.wheel(0, 300)
        
        # --> Assertions to verify final state
        
        # --> Verify the new form is displayed
        # Assert: Expected the new form title 'New Form' to be visible.
        await expect(page.locator("xpath=/html/body/div[2]/div/div/div/div/div[2]/div[1]/main/div/div[3]/div/div[7]/div[2]/div[1]/div/div[1]").nth(0)).to_contain_text("New Form", timeout=15000), "Expected the new form title 'New Form' to be visible."
        # Assert: Expected a 'Create Form' button to be visible for the new form.
        await expect(page.locator("xpath=/html/body/div[2]/div/div/div/div/div[2]/div[1]/main/div/div[3]/div/div[7]/div[2]/div[1]/button").nth(0)).to_contain_text("Create Form", timeout=15000), "Expected a 'Create Form' button to be visible for the new form."
        # Assert: Verify the locked Division field is present at the top of the field list
        assert False, "Expected: Verify the locked Division field is present at the top of the field list (could not be verified on the page)"
        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
    