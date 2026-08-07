# Generated browser tests

These Playwright scripts are retained as QA references. They must use only
disposable local, demo, or dedicated test data. Do not run them with a
production user or against the live production site.

Set the local test inputs in your terminal before running a script:

```sh
export E2E_BASE_URL="http://localhost:9001"
export E2E_TEST_EMAIL="your-disposable-test-user@example.test"
export E2E_TEST_PASSWORD="your-local-test-password"
export E2E_LEAGUE_CODE="your-disposable-test-invite-code"
python3 testsprite_tests/TC001_Log_in_and_reach_the_dashboard.py
```

`E2E_BASE_URL` defaults to `http://localhost:9001`. The email, password, and
league code have no defaults and fail closed when a test needs one.

The generated tests use brittle recorded selectors and are not currently part
of the automated release gate. Review and update each test before relying on
it for a production decision.
