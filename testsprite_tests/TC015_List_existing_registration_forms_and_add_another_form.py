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
        
        # -> Click the 'Log In' button to open the login page.
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
        
        # -> Click the 'Club Hub' link in the left navigation to open the Club Hub workspace so the Leagues or Competition area can be located.
        # Club Hub link
        elem = page.get_by_role('link', name='Club Hub', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Competition Hub' link in the left navigation to open the Competition / Leagues area so a league registration protocol can be located.
        # Competition Hub link
        elem = page.get_by_role('link', name='Competition Hub', exact=True)
        await elem.click(timeout=10000)
        
        # -> Open the 'AUTOMATED REGISTRATION FORM TEST 2026-05-27' league by clicking its visible 'Select Hub' button to enter the league workspace.
        # Select Hub button
        elem = page.locator('xpath=/html/body/div[2]/div/div/div/div/div[2]/div/main/div/div[2]/div[2]/div/div[2]/div/div/div[2]/div[2]/div/div[2]/button')
        await elem.click(timeout=10000)
        
        # -> Open the league's Portal / Portal Architect control to view and manage the registration forms for the 'AUTOMATED REGISTRATION FORM TEST 2026-05-27' league.
        # Portal Architect button
        elem = page.get_by_role('button', name='Portal Architect', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Protocol Architect' button (label: Protocol Architect) to open the league's protocol/workspace and display the registration forms.
        # Protocol Architect button
        elem = page.get_by_role('button', name='Protocol Architect', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Inject Field' button to begin creating an additional form inside the Protocol Architect workspace.
        # Inject Field button
        elem = page.get_by_text('Identity HubParticipant Data Injection', exact=True).locator("xpath=ancestor-or-self::*[.//button][1]").get_by_role('button', name='Inject Field', exact=True)
        await elem.click(timeout=10000)
        
        # -> Fill the Field Label input (shown with placeholder 'e.g. Jersey Size') with 'Automated Extra Field' and then click the 'Confirm Protocol Spec' button to add the new form.
        # e.g. Jersey Size text field
        elem = page.get_by_placeholder('e.g. Jersey Size', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("Automated Extra Field")
        
        # -> Fill the Field Label input (shown with placeholder 'e.g. Jersey Size') with 'Automated Extra Field' and then click the 'Confirm Protocol Spec' button to add the new form.
        # Confirm Protocol Spec button
        elem = page.get_by_role('button', name='Confirm Protocol Spec', exact=True)
        await elem.click(timeout=10000)
        
        # --> Assertions to verify final state
        
        # --> Verify multiple forms are listed
        await page.locator("xpath=/html/body/div[2]/div/div/div/div/div[2]/div[1]/main/div/div[3]/div/div[3]/div[2]/div[1]/button").nth(0).scroll_into_view_if_needed()
        # Assert: An 'Inject Field' button is visible for one protocol form section, proving a form is listed.
        await expect(page.locator("xpath=/html/body/div[2]/div/div/div/div/div[2]/div[1]/main/div/div[3]/div/div[3]/div[2]/div[1]/button").nth(0)).to_be_visible(timeout=15000), "An 'Inject Field' button is visible for one protocol form section, proving a form is listed."
        await page.locator("xpath=/html/body/div[2]/div/div/div/div/div[2]/div[1]/main/div/div[3]/div/div[4]/div[2]/div[1]/button").nth(0).scroll_into_view_if_needed()
        # Assert: A second 'Inject Field' button is visible for another protocol form section, proving multiple forms are listed.
        await expect(page.locator("xpath=/html/body/div[2]/div/div/div/div/div[2]/div[1]/main/div/div[3]/div/div[4]/div[2]/div[1]/button").nth(0)).to_be_visible(timeout=15000), "A second 'Inject Field' button is visible for another protocol form section, proving multiple forms are listed."
        
        # --> Verify the newly added form is present
        # Assert: The newly added form labeled 'Automated Extra Field' is visible in the forms list.
        await expect(page.locator("xpath=/html/body/div[2]/div/div/div/div/div[2]/div[1]/main/div/div[3]/div/div[3]/div[2]/div[2]/div[2]/div/div[5]/div/span/span").nth(0)).to_contain_text("Automated Extra Field", timeout=15000), "The newly added form labeled 'Automated Extra Field' is visible in the forms list."
        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
    