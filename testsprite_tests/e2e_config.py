"""Local configuration for generated browser tests.

Keep credentials and invite codes in the shell environment. Never commit
production accounts, live invite codes, or other secrets to these tests.
"""

from __future__ import annotations

import os


BASE_URL = os.environ.get("E2E_BASE_URL", "http://localhost:9001").rstrip("/")


def _required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(
            f"{name} is required for this test. "
            "Set it to disposable local/demo QA data before running Playwright."
        )
    return value


def test_email() -> str:
    return _required("E2E_TEST_EMAIL")


def test_password() -> str:
    return _required("E2E_TEST_PASSWORD")


def league_code() -> str:
    return _required("E2E_LEAGUE_CODE")
