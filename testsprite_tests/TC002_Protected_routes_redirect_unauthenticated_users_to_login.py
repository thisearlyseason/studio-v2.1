import asyncio
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
                "--window-size=1280,720",         # Set the browser window size
                "--disable-dev-shm-usage",        # Avoid using /dev/shm which can cause issues in containers
                "--ipc=host",                     # Use host-level IPC for better stability
                "--single-process"                # Run the browser in a single process mode
            ],
        )

        # Create a new browser context (like an incognito window)
        context = await browser.new_context()
        context.set_default_timeout(5000)

        # Open a new page in the browser context
        page = await context.new_page()

        # Interact with the page elements to simulate user flow
        # -> Navigate to $E2E_BASE_URL
        await page.goto(f"{BASE_URL}")
        
        # -> Navigate to /events and check whether unauthenticated access redirects to the login page.
        await page.goto(f"{BASE_URL}/events")
        
        # -> Navigate to /roster and verify whether unauthenticated access redirects to the login page.
        await page.goto(f"{BASE_URL}/roster")
        
        # --> Assertions to verify final state
        frame = context.pages[-1]
        current_url = await frame.evaluate("() => window.location.href")
        assert '/login' in current_url, "The page should have navigated to the login page after attempting to access /events"
        current_url = await frame.evaluate("() => window.location.href")
        assert '/login' in current_url, "The page should have navigated to the login page after attempting to access /roster"
        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
    