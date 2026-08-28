"""Descriptor-anchored destructive helper for exact Phase 9 terminal recovery."""
import json
import os
import stat
import sys
import time

DIRECTORY_FD = 3
WORKSPACE_FD = 4
MAX_INPUT = 16_384


def exact_object(value, keys):
    if not isinstance(value, dict) or set(value) != set(keys):
        raise ValueError("invalid-protocol")
    return value


def exact_identity(value):
    return exact_object(value, ("dev", "ino", "uid", "mode", "nlink", "size"))


def matches(metadata, expected, kind):
    expected_type = stat.S_ISDIR if kind == "directory" else stat.S_ISREG
    return (expected_type(metadata.st_mode)
            and metadata.st_dev == expected["dev"]
            and metadata.st_ino == expected["ino"]
            and metadata.st_uid == expected["uid"]
            and (stat.S_IMODE(metadata.st_mode) & 0o777) == expected["mode"]
            and (kind == "directory" or (
                metadata.st_nlink == expected["nlink"]
                and metadata.st_size == expected["size"])))


def require_directory(descriptor, expected):
    metadata = os.fstat(descriptor)
    if not matches(metadata, expected, "directory"):
        raise ValueError("directory-identity-mismatch")


def require_named(descriptor, name, expected, kind):
    metadata = os.stat(name, dir_fd=descriptor, follow_symlinks=False)
    if not matches(metadata, expected, kind):
        raise ValueError("entry-identity-mismatch")


def optional_pause(name):
    raw = os.environ.get(name)
    if raw is None:
        return
    milliseconds = int(raw)
    if milliseconds < 1 or milliseconds > 2_000:
        raise ValueError("invalid-test-pause")
    time.sleep(milliseconds / 1000)


def main():
    raw = sys.stdin.buffer.read(MAX_INPUT + 1)
    if len(raw) > MAX_INPUT:
        raise ValueError("invalid-protocol")
    request = json.loads(raw)
    if not isinstance(request, dict) or request.get("version") != 1:
        raise ValueError("invalid-protocol")
    operation = request.get("operation")
    if operation == "remove-credential":
        exact_object(request, ("version", "operation", "directory", "name", "expected"))
        directory = exact_identity(request["directory"])
        expected = exact_identity(request["expected"])
        if (request["name"] != "credentials.json" or directory["uid"] != os.getuid()
                or directory["mode"] != 0o700 or expected["uid"] != os.getuid()
                or expected["mode"] != 0o600 or expected["nlink"] != 1):
            raise ValueError("invalid-name")
        require_directory(DIRECTORY_FD, directory)
        require_named(DIRECTORY_FD, request["name"], expected, "file")
        optional_pause("PHASE9_RECOVERY_TEST_BEFORE_CREDENTIAL_UNLINK_MS")
        require_directory(DIRECTORY_FD, directory)
        require_named(DIRECTORY_FD, request["name"], expected, "file")
        os.unlink(request["name"], dir_fd=DIRECTORY_FD)
        try:
            os.stat(request["name"], dir_fd=DIRECTORY_FD, follow_symlinks=False)
            raise ValueError("credential-removal-uncertain")
        except FileNotFoundError:
            pass
    elif operation == "remove-workspace":
        exact_object(request, (
            "version", "operation", "directory", "name", "workspace", "manifestName", "manifest",
        ))
        directory = exact_identity(request["directory"])
        workspace = exact_identity(request["workspace"])
        manifest = exact_identity(request["manifest"])
        name = request["name"]
        if (not isinstance(name, str) or not name.startswith("phase9-core-identities.")
                or request["manifestName"] != "manifest.json"
                or directory["uid"] != 0 or directory["mode"] != 0o777
                or workspace["uid"] != os.getuid() or workspace["mode"] != 0o700
                or manifest["uid"] != os.getuid() or manifest["mode"] != 0o600
                or manifest["nlink"] != 1):
            raise ValueError("invalid-name")
        require_directory(DIRECTORY_FD, directory)
        require_directory(WORKSPACE_FD, workspace)
        require_named(DIRECTORY_FD, name, workspace, "directory")
        if os.listdir(WORKSPACE_FD) != ["manifest.json"]:
            raise ValueError("unexpected-workspace-entry")
        require_named(WORKSPACE_FD, "manifest.json", manifest, "file")
        optional_pause("PHASE9_RECOVERY_TEST_BEFORE_WORKSPACE_RMDIR_MS")
        require_directory(DIRECTORY_FD, directory)
        require_directory(WORKSPACE_FD, workspace)
        require_named(DIRECTORY_FD, name, workspace, "directory")
        if os.listdir(WORKSPACE_FD) != ["manifest.json"]:
            raise ValueError("unexpected-workspace-entry")
        require_named(WORKSPACE_FD, "manifest.json", manifest, "file")
        os.unlink("manifest.json", dir_fd=WORKSPACE_FD)
        os.rmdir(name, dir_fd=DIRECTORY_FD)
        try:
            os.stat(name, dir_fd=DIRECTORY_FD, follow_symlinks=False)
            raise ValueError("workspace-removal-uncertain")
        except FileNotFoundError:
            pass
    else:
        raise ValueError("invalid-operation")
    print(json.dumps({"ok": True, "status": "removed"}, separators=(",", ":")))


try:
    main()
except Exception as error:
    reason = str(error) if isinstance(error, ValueError) else "system-failure"
    print(json.dumps({"ok": False, "reason": reason, "status": "failed"}, separators=(",", ":")))
    raise SystemExit(1)
