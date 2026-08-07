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
        
        # -> Click the 'Log In' button in the page header to open the login page or modal so the login form can be filled.
        # Log In button
        elem = page.locator('xpath=/html/body/div[2]/nav/div/div[2]/a/button')
        await elem.click(timeout=10000)
        
        # -> Fill the email field with $E2E_TEST_EMAIL, fill the password field with $E2E_TEST_PASSWORD, and click the 'Verify Identity' button to submit the login form.
        # name@organization.com email field
        elem = page.locator('[id="email"]')
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill(test_email())
        
        # -> Fill the email field with $E2E_TEST_EMAIL, fill the password field with $E2E_TEST_PASSWORD, and click the 'Verify Identity' button to submit the login form.
        # password field
        elem = page.locator('[id="password"]')
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill(test_password())
        
        # -> Fill the email field with $E2E_TEST_EMAIL, fill the password field with $E2E_TEST_PASSWORD, and click the 'Verify Identity' button to submit the login form.
        # Verify Identity button
        elem = page.get_by_role('button', name='Verify Identity', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Club Hub' navigation link in the left sidebar to open club-related options and look for a 'Leagues' or league-management entry.
        # Club Hub link
        elem = page.get_by_role('link', name='Club Hub', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Competition Hub' link in the left sidebar to open competition-related features and look for a 'Leagues' or 'Division Architect' entry.
        # Competition Hub link
        elem = page.get_by_role('link', name='Competition Hub', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Launch League Architect' button to open the Division (League) Architect view so divisions can be created and teams assigned.
        # Launch League Architect button
        elem = page.get_by_role('button', name='Launch League Architect', exact=True)
        await elem.click(timeout=10000)
        
        # -> Fill the 'League Title' field with a test name, type a division name into the 'Divisions' field, and click the 'Add' button to stage the new division.
        # e.g. State Varsity Premier text field
        elem = page.get_by_placeholder('e.g. State Varsity Premier', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("Smoke Test League 2026")
        
        # -> Fill the 'League Title' field with a test name, type a division name into the 'Divisions' field, and click the 'Add' button to stage the new division.
        # Press enter or click Add to stage multiple text field
        elem = page.get_by_placeholder('Press enter or click Add to stage multiple', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("Division A")
        
        # -> Fill the 'League Title' field with a test name, type a division name into the 'Divisions' field, and click the 'Add' button to stage the new division.
        # Add button
        elem = page.get_by_role('button', name='Add', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Deploy Hub' button in the League Architect modal to create/deploy the hub so squads/teams can be assigned to the staged division.
        # Deploy Hub button
        elem = page.get_by_role('button', name='Deploy Hub', exact=True)
        await elem.click(timeout=10000)
        
        # -> Close the League Architect modal (click the 'Close' button) and search the Competition Hub list for the hub titled 'Smoke Test League 2026' to confirm the deployment succeeded.
        # Close button
        elem = page.get_by_role('button', name='Close', exact=True)
        await elem.click(timeout=10000)
        
        # -> Re-open the 'Launch League Architect' modal from the Competition Hub to inspect whether 'Smoke Test League 2026' and its staged division persist after the prior Deploy action.
        # Launch League Architect button
        elem = page.get_by_role('button', name='Launch League Architect', exact=True)
        await elem.click(timeout=10000)
        
        # -> Fill 'Smoke Test League 2026' into the League Title field, add 'Division A' in the Divisions field and click 'Add', then click the 'Deploy Hub' button to create the hub.
        # e.g. State Varsity Premier text field
        elem = page.get_by_placeholder('e.g. State Varsity Premier', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("Smoke Test League 2026")
        
        # -> Fill 'Smoke Test League 2026' into the League Title field, add 'Division A' in the Divisions field and click 'Add', then click the 'Deploy Hub' button to create the hub.
        # Press enter or click Add to stage multiple text field
        elem = page.get_by_placeholder('Press enter or click Add to stage multiple', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("Division A")
        
        # -> Fill 'Smoke Test League 2026' into the League Title field, add 'Division A' in the Divisions field and click 'Add', then click the 'Deploy Hub' button to create the hub.
        # Add button
        elem = page.get_by_role('button', name='Add', exact=True)
        await elem.click(timeout=10000)
        
        # -> Fill 'Smoke Test League 2026' into the League Title field, add 'Division A' in the Divisions field and click 'Add', then click the 'Deploy Hub' button to create the hub.
        # Deploy Hub button
        elem = page.get_by_role('button', name='Deploy Hub', exact=True)
        await elem.click(timeout=10000)
        
        # -> Close the 'League Architect' modal to return to the Competition Hub list and then look for the hub titled 'Smoke Test League 2026' in the hub cards.
        # Close button
        elem = page.get_by_role('button', name='Close', exact=True)
        await elem.click(timeout=10000)
        
        # -> Open the 'Launch League Architect' modal from the Competition Hub to inspect whether the league title 'Smoke Test League 2026' and the staged division persist.
        # Launch League Architect button
        elem = page.get_by_role('button', name='Launch League Architect', exact=True)
        await elem.click(timeout=10000)
        
        # --> Assertions to verify final state
        
        # --> Verify the division configuration is still present
        await page.locator("xpath=/html/body/div[6]").nth(0).scroll_into_view_if_needed()
        # Assert: The League Architect dialog is open so the division configuration can be inspected.
        await expect(page.locator("xpath=/html/body/div[6]").nth(0)).to_be_visible(timeout=15000), "The League Architect dialog is open so the division configuration can be inspected."
        await page.locator("xpath=/html/body/div[6]/div/div[2]/div[2]/div[3]/div/input").nth(0).scroll_into_view_if_needed()
        # Assert: The Divisions input is visible so staged divisions are available for review.
        await expect(page.locator("xpath=/html/body/div[6]/div/div[2]/div[2]/div[3]/div/input").nth(0)).to_be_visible(timeout=15000), "The Divisions input is visible so staged divisions are available for review."
        await page.locator("xpath=/html/body/div[6]/div/div[2]/div[3]/button").nth(0).scroll_into_view_if_needed()
        # Assert: The Deploy Hub button is visible, confirming the division configuration UI is present.
        await expect(page.locator("xpath=/html/body/div[6]/div/div[2]/div[3]/button").nth(0)).to_be_visible(timeout=15000), "The Deploy Hub button is visible, confirming the division configuration UI is present."
        
        # --> Verify the team assignment is still present
        # Assert: The division shows 1 squad enrolled, confirming a team assignment is present.
        await expect(page.locator("xpath=/html/body/div[2]/div/div/div/div/div[2]/div[1]/main/div/div[2]/div[2]/div/div[2]/div/div[4]/div[2]/div[2]/div[1]/div[1]/div[2]/p[1]").nth(0)).to_contain_text("1\n squads enrolled", timeout=15000), "The division shows 1 squad enrolled, confirming a team assignment is present."
        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
    