"""Descriptor-bound in-place credential zeroization for Phase 9 recovery."""
import json
import os
import stat
import sys
import time

WORKSPACE_FD = 3
CREDENTIAL_FD = 5
MAX_INPUT = 16_384


def exact(value, keys):
    if not isinstance(value, dict) or set(value) != set(keys):
        raise ValueError("invalid-protocol")
    return value


def identity(value):
    return exact(value, ("dev", "ino", "uid", "mode", "nlink", "size"))


def matches(metadata, expected, kind, size=True):
    expected_type = stat.S_ISDIR if kind == "directory" else stat.S_ISREG
    return (expected_type(metadata.st_mode)
            and metadata.st_dev == expected["dev"] and metadata.st_ino == expected["ino"]
            and metadata.st_uid == expected["uid"]
            and (stat.S_IMODE(metadata.st_mode) & 0o777) == expected["mode"]
            and (kind == "directory" or (metadata.st_nlink == expected["nlink"]
                 and (not size or metadata.st_size == expected["size"]))))


def require_fd(descriptor, expected, kind, size=True):
    if not matches(os.fstat(descriptor), expected, kind, size):
        raise ValueError("descriptor-identity-mismatch")


def require_named(descriptor, name, expected, kind, size=True):
    if not matches(os.stat(name, dir_fd=descriptor, follow_symlinks=False), expected, kind, size):
        raise ValueError("entry-identity-mismatch")


def main():
    raw = sys.stdin.buffer.read(MAX_INPUT + 1)
    if len(raw) > MAX_INPUT:
        raise ValueError("invalid-protocol")
    request = json.loads(raw)
    exact(request, ("version", "operation", "workspace", "name", "credential"))
    if request.get("version") != 3 or request.get("operation") != "zeroize-credential":
        raise ValueError("invalid-protocol")
    workspace = identity(request["workspace"])
    credential = identity(request["credential"])
    if (request["name"] != "credentials.json" or workspace["uid"] != os.getuid()
            or workspace["mode"] != 0o700 or credential["uid"] != os.getuid()
            or credential["mode"] != 0o600 or credential["nlink"] != 1):
        raise ValueError("invalid-boundary")
    require_fd(WORKSPACE_FD, workspace, "directory")
    require_fd(CREDENTIAL_FD, credential, "file")
    require_named(WORKSPACE_FD, "credentials.json", credential, "file")
    raw_pause = os.environ.get("PHASE9_RECOVERY_TEST_BEFORE_CREDENTIAL_ZEROIZE_MS")
    if raw_pause is not None:
        milliseconds = int(raw_pause)
        if milliseconds < 1 or milliseconds > 2_000:
            raise ValueError("invalid-test-pause")
        time.sleep(milliseconds / 1000)
    require_fd(WORKSPACE_FD, workspace, "directory")
    require_fd(CREDENTIAL_FD, credential, "file")
    require_named(WORKSPACE_FD, "credentials.json", credential, "file")
    os.ftruncate(CREDENTIAL_FD, 0)
    fail_after_truncate = os.environ.get("PHASE9_RECOVERY_TEST_FAIL_AFTER_CREDENTIAL_TRUNCATE")
    if fail_after_truncate is not None:
        if fail_after_truncate != "1":
            raise ValueError("invalid-test-failure")
        raise ValueError("injected-post-truncate-failure")
    if hasattr(os, "fdatasync"):
        os.fdatasync(CREDENTIAL_FD)
    os.fsync(CREDENTIAL_FD)
    require_fd(CREDENTIAL_FD, credential, "file", size=False)
    if os.fstat(CREDENTIAL_FD).st_size != 0:
        raise ValueError("zeroization-failed")
    print(json.dumps({"ok": True, "status": "committed"}, separators=(",", ":")))


try:
    main()
except Exception:
    print(json.dumps({"ok": False, "status": "failed"}, separators=(",", ":")))
    raise SystemExit(1)
