import asyncio
from playwright.async_api import async_playwright

try:
    from testsprite_tests.e2e_config import BASE_URL, league_code, test_email, test_password
except ModuleNotFoundError:
    from e2e_config import BASE_URL, league_code, test_email, test_password

async def run_comprehensive_test():
    print("🚀 Starting Comprehensive Flow Test...")
    pw = None
    browser = None
    context = None

    try:
        pw = await async_playwright().start()
        browser = await pw.chromium.launch(
            headless=True,
            args=[
                "--window-size=1280,720",
                "--disable-dev-shm-usage",
                "--ipc=host",
                "--single-process"
            ],
        )

        context = await browser.new_context()
        context.set_default_timeout(15000)

        page = await context.new_page()

        # Step 1: Open Home Page
        print("\n--- Step 1: Navigating to Home Page ---")
        await page.goto(f"{BASE_URL}")
        await page.wait_for_timeout(4000)
        title = await page.title()
        print(f"Page Title: {title}")
        assert "The Squad" in title, "Home page title verification failed"
        print("✅ Home Page Loaded successfully!")

        # Step 2: Open Login Page
        print("\n--- Step 2: Navigating to Login Page ---")
        await page.goto(f"{BASE_URL}/login")
        await page.wait_for_timeout(3000)
        
        # Verify inputs exist
        email_visible = await page.locator("#email").is_visible()
        password_visible = await page.locator("#password").is_visible()
        print(f"Email Input Visible: {email_visible}")
        print(f"Password Input Visible: {password_visible}")
        assert email_visible and password_visible, "Login input elements not visible"
        print("✅ Login Page UI verified!")

        # Step 3: Perform Login
        print("\n--- Step 3: Logging In with Test Coach credentials ---")
        await page.fill("#email", test_email())
        await page.fill("#password", test_password())
        
        # Click submit button
        submit_btn = page.locator("button:has-text('Verify Identity')")
        await submit_btn.click()
        
        # Wait for redirect to dashboard
        print("Waiting for dashboard redirect...")
        await page.wait_for_url("**/dashboard**", timeout=15000)
        print(f"Logged in successfully! Current URL: {page.url}")
        print("✅ Authentication Flow passed!")

        # Step 4: Verify Dashboard Page
        print("\n--- Step 4: Verifying Dashboard Hub ---")
        await page.wait_for_timeout(4000)
        body_text = await page.locator("body").inner_text()
        body_lower = body_text.lower()
        assert any(x in body_lower for x in ["dashboard", "activity", "squad", "welcome", "control", "operations", "hub"]), f"Dashboard content check failed. Body text: {body_text}"
        print("✅ Dashboard Hub rendered successfully!")

        # Step 5: Verify Schedule/Events Flow
        print("\n--- Step 5: Verifying Schedule Hub ---")
        await page.goto(f"{BASE_URL}/events")
        await page.wait_for_timeout(4000)
        events_text = (await page.locator("body").inner_text()).lower()
        assert "schedule" in events_text or "itinerary" in events_text or "events" in events_text, "Events/Schedule page load failed"
        print("✅ Schedule Hub flow verified!")

        # Step 6: Verify Playbook/Drills Flow
        print("\n--- Step 6: Verifying Playbook & Drills ---")
        await page.goto(f"{BASE_URL}/drills")
        await page.wait_for_timeout(4000)
        drills_text = (await page.locator("body").inner_text()).lower()
        assert "playbook" in drills_text or "drill" in drills_text, "Playbook/Drills page load failed"
        print("✅ Playbook Flow verified!")

        # Step 7: Verify Roster Flow
        print("\n--- Step 7: Verifying Roster ---")
        await page.goto(f"{BASE_URL}/roster")
        await page.wait_for_timeout(4000)
        roster_text = (await page.locator("body").inner_text()).lower()
        assert "roster" in roster_text or "members" in roster_text or "player" in roster_text, "Roster page load failed"
        print("✅ Roster Flow verified!")

        # Step 8: Verify Leagues Flow
        print("\n--- Step 8: Verifying Leagues & Competition ---")
        await page.goto(f"{BASE_URL}/leagues")
        await page.wait_for_timeout(4000)
        leagues_text = (await page.locator("body").inner_text()).lower()
        assert "league" in leagues_text or "standings" in leagues_text or "competition" in leagues_text, "Leagues page load failed"
        print("✅ Leagues/Competition Flow verified!")

        # Step 9: Verify Tournaments Flow
        print("\n--- Step 9: Verifying Tournaments ---")
        await page.goto(f"{BASE_URL}/tournaments")
        # Allow enough time for redirect and client-side guard checks
        await page.wait_for_timeout(6000)
        print(f"Tournaments page URL after redirect: {page.url}")
        tournaments_text = (await page.locator("body").inner_text()).lower()
        print(f"DEBUG: Tournaments page text: '{tournaments_text}'")
        assert any(x in tournaments_text for x in ["tournament", "bracket", "standings", "restricted", "coordination", "access", "admin"]), f"Tournaments page load failed. Text: {tournaments_text}"
        print("✅ Tournaments Flow verified!")

        # Step 10: Verify Family Hub Flow (Parent Perspective)
        print("\n--- Step 10: Verifying Family Hub ---")
        await page.goto(f"{BASE_URL}/family")
        await page.wait_for_timeout(4000)
        family_text = (await page.locator("body").inner_text()).lower()
        assert "family" in family_text or "children" in family_text or "guardian" in family_text or "household" in family_text, "Family page load failed"
        print("✅ Family Hub Flow verified!")

        print("\n🎉 ALL 10 COMPREHENSIVE FLOW VERIFICATIONS PASSED SUCCESSFULLY!")

    except Exception as e:
        print(f"\n❌ TEST FLOW FAILED: {str(e)}")
        # Dump page source to log for troubleshooting
        if page:
            try:
                content = await page.content()
                print("--- Page Content at Failure ---")
                print(content[:2000])
            except:
                pass
        raise e
    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

if __name__ == "__main__":
    asyncio.run(run_comprehensive_test())
