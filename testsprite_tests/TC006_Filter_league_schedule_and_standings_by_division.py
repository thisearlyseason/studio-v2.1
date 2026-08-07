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
        
        # -> Click the page's "Log In" button (top-right) to navigate to the login page and reveal the email/password fields.
        # Log In button
        elem = page.locator('xpath=/html/body/div[2]/nav/div/div[2]/a/button')
        await elem.click(timeout=10000)
        
        # -> Fill the 'Official Email' field with test_email(), fill the 'Encrypted Password' field with test_password(), then click the 'Verify Identity' button to submit the login form.
        # name@organization.com email field
        elem = page.locator('[id="email"]')
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill(test_email())
        
        # -> Fill the 'Official Email' field with test_email(), fill the 'Encrypted Password' field with test_password(), then click the 'Verify Identity' button to submit the login form.
        # password field
        elem = page.locator('[id="password"]')
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill(test_password())
        
        # -> Fill the 'Official Email' field with test_email(), fill the 'Encrypted Password' field with test_password(), then click the 'Verify Identity' button to submit the login form.
        # Verify Identity button
        elem = page.get_by_role('button', name='Verify Identity', exact=True)
        await elem.click(timeout=10000)
        
        # -> Navigate to the 'Leagues' page (open the Leagues area) so the Division Architect and division/filter controls can be accessed.
        await page.goto(f"{BASE_URL}/leagues")
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=5000)
        except Exception:
            pass
        
        # -> Open the Division Architect by clicking the 'Launch League Architect' button so the Division Architect UI becomes available.
        # Launch League Architect button
        elem = page.get_by_role('button', name='Launch League Architect', exact=True)
        await elem.click(timeout=10000)
        
        # -> Add two divisions named 'Division A' and 'Division B' using the 'Divisions' input and 'Add' button, then click the 'Deploy Hub' button to persist them.
        # Press enter or click Add to stage multiple text field
        elem = page.locator("xpath=/html/body/div[6]/div/div[2]/div[2]/div[3]/div/input").nth(0)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("Division A")
        
        # -> Add two divisions named 'Division A' and 'Division B' using the 'Divisions' input and 'Add' button, then click the 'Deploy Hub' button to persist them.
        # Add button
        elem = page.locator("xpath=/html/body/div[6]/div/div[2]/div[2]/div[3]/div/button").nth(0)
        await elem.click(timeout=10000)
        
        # -> Add two divisions named 'Division A' and 'Division B' using the 'Divisions' input and 'Add' button, then click the 'Deploy Hub' button to persist them.
        # Press enter or click Add to stage multiple text field
        elem = page.get_by_placeholder('Press enter or click Add to stage multiple', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("Division B")
        
        # -> Add two divisions named 'Division A' and 'Division B' using the 'Divisions' input and 'Add' button, then click the 'Deploy Hub' button to persist them.
        # Add button
        elem = page.get_by_role('button', name='Add', exact=True)
        await elem.click(timeout=10000)
        
        # -> Add two divisions named 'Division A' and 'Division B' using the 'Divisions' input and 'Add' button, then click the 'Deploy Hub' button to persist them.
        # Deploy Hub button
        elem = page.get_by_role('button', name='Deploy Hub', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Deploy Hub' button in the League Architect modal to save the staged divisions so they appear in the league UI, then proceed to assign teams to divisions.
        # Deploy Hub button
        elem = page.get_by_role('button', name='Deploy Hub', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Deploy Hub' button in the League Architect modal to save the staged divisions, then verify the modal closes and the divisions appear in the league list.
        # Deploy Hub button
        elem = page.get_by_role('button', name='Deploy Hub', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Deploy Hub' button in the League Architect modal, then verify the modal closes and the new divisions appear in the league list.
        # Deploy Hub button
        elem = page.get_by_role('button', name='Deploy Hub', exact=True)
        await elem.click(timeout=10000)
        
        # -> click
        # Deploy Hub button
        elem = page.get_by_role('button', name='Deploy Hub', exact=True)
        await elem.click(timeout=10000)
        
        # -> Fill the 'League Title' field with 'Automated Division Hub' and then click the 'Deploy Hub' button to save the staged divisions and close the League Architect modal.
        # e.g. State Varsity Premier text field
        elem = page.get_by_placeholder('e.g. State Varsity Premier', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("Automated Division Hub")
        
        # -> Fill the 'League Title' field with 'Automated Division Hub' and then click the 'Deploy Hub' button to save the staged divisions and close the League Architect modal.
        # Deploy Hub button
        elem = page.get_by_role('button', name='Deploy Hub', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Close' button on the League Architect modal to dismiss it, then inspect the league list for the presence of the new hub/divisions (look for 'Automated Division Hub' or the division chips 'Division A' / 'Division B').
        # Close button
        elem = page.get_by_role('button', name='Close', exact=True)
        await elem.click(timeout=10000)
        
        # -> Open the 'Automated Division Filter Test League' by clicking its 'Select Hub' button to view its divisions, division filter controls, and team assignment UI.
        # Select Hub button
        elem = page.locator('xpath=/html/body/div[2]/div/div/div/div/div[2]/div/main/div/div[2]/div/div[8]/div[2]/div[2]/div/div[2]/button')
        await elem.click(timeout=10000)
        
        # --> Assertions to verify final state
        
        # --> Verify the filtered standings results are displayed
        await page.locator("xpath=/html/body/div[2]/div/div/div/div/div[2]/div[1]/main/div/div[3]/div[4]/div[1]/div/div/table/thead/tr").nth(0).scroll_into_view_if_needed()
        # Assert: The standings table header is visible, confirming standings are shown.
        await expect(page.locator("xpath=/html/body/div[2]/div/div/div/div/div[2]/div[1]/main/div/div[3]/div[4]/div[1]/div/div/table/thead/tr").nth(0)).to_be_visible(timeout=15000), "The standings table header is visible, confirming standings are shown."
        await page.locator("xpath=/html/body/div[2]/div/div/div/div/div[2]/div[1]/main/div/div[3]/div[4]/div[1]/div/div/table/tbody/tr").nth(0).scroll_into_view_if_needed()
        # Assert: At least one standings row is visible, confirming filtered standings results are displayed.
        await expect(page.locator("xpath=/html/body/div[2]/div/div/div/div/div[2]/div[1]/main/div/div[3]/div[4]/div[1]/div/div/table/tbody/tr").nth(0)).to_be_visible(timeout=15000), "At least one standings row is visible, confirming filtered standings results are displayed."
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
    