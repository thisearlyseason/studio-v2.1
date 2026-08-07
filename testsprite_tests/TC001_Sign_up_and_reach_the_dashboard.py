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
        
        # -> Open the signup page by navigating to the application's '/signup' URL and load the registration form.
        await page.goto(f"{BASE_URL}/signup")
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=5000)
        except Exception:
            pass
        
        # -> Select the 'Player / Athlete' role and click 'Continue' so the email/password registration form can appear.
        # Player / Athlete I am the player — join or get... button
        elem = page.get_by_role('button', name='Player / Athlete I am the player — join or get recruited', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'CONTINUE' button on the role-selection screen to advance to the registration form and reveal the email/password fields.
        # Continue button
        elem = page.get_by_role('button', name='Continue', exact=True)
        await elem.click(timeout=10000)
        
        # -> Fill the 'Full Name', 'Email Address', and 'Password' fields on the Create Account form and click the 'CREATE ACCOUNT' button to submit the registration.
        # John Smith text field
        elem = page.get_by_placeholder('John Smith', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("Test User")
        
        # -> Fill the 'Full Name', 'Email Address', and 'Password' fields on the Create Account form and click the 'CREATE ACCOUNT' button to submit the registration.
        # you@example.com email field
        elem = page.get_by_placeholder('you@example.com', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill(test_email())
        
        # -> Fill the 'Full Name', 'Email Address', and 'Password' fields on the Create Account form and click the 'CREATE ACCOUNT' button to submit the registration.
        # Min. 6 characters password field
        elem = page.get_by_placeholder('Min. 6 characters', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill(test_password())
        
        # -> Fill the 'Full Name', 'Email Address', and 'Password' fields on the Create Account form and click the 'CREATE ACCOUNT' button to submit the registration.
        # Create Account button
        elem = page.get_by_role('button', name='Create Account', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Create Account' button to submit the registration form and check whether the authenticated dashboard workspace appears (look for dashboard title, navigation, or workspace content).
        # Create Account button
        elem = page.get_by_role('button', name='Create Account', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Create Account' button to submit the registration and verify that the authenticated dashboard workspace appears (look for a dashboard title or navigation elements).
        # Create Account button
        elem = page.get_by_role('button', name='Create Account', exact=True)
        await elem.click(timeout=10000)
        
        # -> Submit the registration by clicking the 'CREATE ACCOUNT' button and verify the authenticated dashboard or capture any visible error messages.
        # Create Account button
        elem = page.get_by_role('button', name='Create Account', exact=True)
        await elem.click(timeout=10000)
        
        # -> Fill the Email Address field with a unique address (e.g., example+12345@gmail.com) and click the 'CREATE ACCOUNT' button to attempt registration again and observe if the dashboard appears or an error becomes visible.
        # you@example.com email field
        elem = page.get_by_placeholder('you@example.com', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill(test_email())
        
        # -> Fill the Email Address field with a unique address (e.g., example+12345@gmail.com) and click the 'CREATE ACCOUNT' button to attempt registration again and observe if the dashboard appears or an error becomes visible.
        # Create Account button
        elem = page.get_by_role('button', name='Create Account', exact=True)
        await elem.click(timeout=10000)
        
        # --> Assertions to verify final state
        
        # --> Verify the dashboard is displayed
        await page.locator("xpath=/html/body/div[2]/div/div/div/div/div[1]/div[2]/div/div[1]/ul/li/a").nth(0).scroll_into_view_if_needed()
        # Assert: The Dashboard navigation link is visible, confirming the dashboard is displayed.
        await expect(page.locator("xpath=/html/body/div[2]/div/div/div/div/div[1]/div[2]/div/div[1]/ul/li/a").nth(0)).to_be_visible(timeout=15000), "The Dashboard navigation link is visible, confirming the dashboard is displayed."
        
        # --> Verify the authenticated workspace is visible
        # Assert: The 'Dashboard' navigation link is visible in the authenticated workspace.
        await expect(page.locator("xpath=/html/body/div[2]/div/div/div/div/div[1]/div[2]/div/div[1]/ul/li/a").nth(0)).to_have_text("Dashboard", timeout=15000), "The 'Dashboard' navigation link is visible in the authenticated workspace."
        # Assert: The signed-in user's email (example+12345@gmail.com) is visible in the workspace header.
        await expect(page.locator("xpath=/html/body/div[2]/div/div/div/div/div[2]/div[1]/main/div/div[2]/div/div[3]/div[1]/div/button").nth(0)).to_contain_text(test_email(), timeout=15000), "The signed-in user's email (example+12345@gmail.com) is visible in the workspace header."
        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
    