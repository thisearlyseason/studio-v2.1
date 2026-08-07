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
        
        # -> Click the 'Log In' button in the page header to open the login page or form.
        # Log In button
        elem = page.locator('xpath=/html/body/div[2]/nav/div/div[2]/a/button')
        await elem.click(timeout=10000)
        
        # -> Enter test_email() into the Official Email field, test_password() into the Encrypted Password field, then click the 'Verify Identity' button to submit the login form.
        # name@organization.com email field
        elem = page.locator('[id="email"]')
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill(test_email())
        
        # -> Enter test_email() into the Official Email field, test_password() into the Encrypted Password field, then click the 'Verify Identity' button to submit the login form.
        # password field
        elem = page.locator('[id="password"]')
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill(test_password())
        
        # -> Enter test_email() into the Official Email field, test_password() into the Encrypted Password field, then click the 'Verify Identity' button to submit the login form.
        # Verify Identity button
        elem = page.get_by_role('button', name='Verify Identity', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Competition Hub' link in the left sidebar to open the competition management area where tournament and registration tools should be located.
        # Competition Hub link
        elem = page.get_by_role('link', name='Competition Hub', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Tournaments' tab in the Competition Hub tablist to switch to the Tournaments view and expose tournament-specific launch/architect controls.
        # Tournaments button
        elem = page.get_by_role('tab', name='Tournaments', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Launch Hub' button on the tournament card to open the tournament architect so the registration protocol can be accessed.
        # Launch Hub button
        elem = page.get_by_role('button', name='Launch Hub', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Architecture' tab in the tournament tab list to open the Tournament Architect and expose registration/protocol controls.
        # Architecture button
        elem = page.get_by_role('tab', name='Architecture', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Launch Builder' button in the Registration Architect panel to open the form builder/modal.
        # Launch Builder button
        elem = page.get_by_role('button', name='Launch Builder', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the '+ CREATE FORM' button in the Protocol Forms view to open the form creation modal or page.
        # + Create Form button
        elem = page.get_by_role('button', name='+ Create Form', exact=True)
        await elem.click(timeout=10000)
        
        # -> Type a new form name into the 'Form Name' input (placeholder: 'e.g. Division A Registration') and click the 'Create Form' button to create the form.
        # e.g. Division A Registration text field
        elem = page.get_by_placeholder('e.g. Division A Registration', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("Test Registration Form - Auto")
        
        # -> Type a new form name into the 'Form Name' input (placeholder: 'e.g. Division A Registration') and click the 'Create Form' button to create the form.
        # Create Form button
        elem = page.get_by_role('button', name='Create Form', exact=True)
        await elem.click(timeout=10000)
        
        # --> Assertions to verify final state
        
        # --> Verify the new form appears in the existing forms list
        # Assert: The new form 'Test Registration Form - Auto' is listed in the Protocol Architect header.
        await expect(page.locator("xpath=/html/body/div[2]/div/div/div/div/div[2]/div[1]/main/div/div[3]/div[1]/div[1]/div[1]").nth(0)).to_contain_text("Test Registration Form - Auto", timeout=15000), "The new form 'Test Registration Form - Auto' is listed in the Protocol Architect header."
        # Assert: The URL contains the protocol identifier for the created form.
        await expect(page).to_have_url(re.compile("protocol=form_test_registration_form__auto_mqop7iv4"), timeout=15000), "The URL contains the protocol identifier for the created form."
        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
    