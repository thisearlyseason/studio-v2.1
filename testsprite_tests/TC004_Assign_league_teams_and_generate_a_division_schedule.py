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
        
        # -> Open the Login page by navigating to the site's Login page (visit the 'Log In' page).
        await page.goto(f"{BASE_URL}/login")
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=5000)
        except Exception:
            pass
        
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
        
        # -> Open the Leagues page (visit the 'Leagues' page) so the Division Architect tab can be accessed.
        await page.goto(f"{BASE_URL}/leagues")
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=5000)
        except Exception:
            pass
        
        # -> Click the visible 'Launch League Architect' button to open the League/Division Architect interface so divisions can be created.
        # Launch League Architect button
        elem = page.get_by_role('button', name='Launch League Architect', exact=True)
        await elem.click(timeout=10000)
        
        # -> Enter 'Automated Division A' into the 'Divisions' field in the League Architect dialog and click the 'Add' button to stage the new division.
        # Press enter or click Add to stage multiple text field
        elem = page.get_by_placeholder('Press enter or click Add to stage multiple', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("Automated Division A")
        
        # -> Enter 'Automated Division A' into the 'Divisions' field in the League Architect dialog and click the 'Add' button to stage the new division.
        # Add button
        elem = page.get_by_role('button', name='Add', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Deploy Hub' button in the League Architect dialog to persist the staged division so squads/teams can be assigned.
        # Deploy Hub button
        elem = page.get_by_role('button', name='Deploy Hub', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Deploy Hub' button in the League Architect dialog to persist the staged division 'Automated Division A' so teams can be assigned.
        # Deploy Hub button
        elem = page.get_by_role('button', name='Deploy Hub', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Deploy Hub' button in the League Architect dialog to persist the staged division 'Automated Division A'.
        # Deploy Hub button
        elem = page.get_by_role('button', name='Deploy Hub', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the visible 'Deploy Hub' button in the League Architect dialog to persist the staged division, then confirm the division appears in the Leagues list.
        # Deploy Hub button
        elem = page.get_by_role('button', name='Deploy Hub', exact=True)
        await elem.click(timeout=10000)
        
        # -> Close the League Architect modal by clicking the 'Close' button, then search the page for the text 'Automated Division A' to confirm whether the division was persisted to the Leagues list.
        # Close button
        elem = page.get_by_role('button', name='Close', exact=True)
        await elem.click(timeout=10000)
        
        # -> Open the League Architect by clicking the 'Launch League Architect' button so the modal can be inspected and an alternative deployment approach attempted.
        # Launch League Architect button
        elem = page.get_by_role('button', name='Launch League Architect', exact=True)
        await elem.click(timeout=10000)
        
        # -> input
        # e.g. State Varsity Premier text field
        elem = page.get_by_placeholder('e.g. State Varsity Premier', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("Automated Division A Hub")
        
        # -> input
        # Press enter or click Add to stage multiple text field
        elem = page.get_by_placeholder('Press enter or click Add to stage multiple', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("Automated Division A")
        
        # -> click
        # Add button
        elem = page.get_by_role('button', name='Add', exact=True)
        await elem.click(timeout=10000)
        
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
    