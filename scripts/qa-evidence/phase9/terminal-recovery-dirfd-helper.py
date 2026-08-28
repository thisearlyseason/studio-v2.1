"""Descriptor-bound zeroization and atomic no-clobber quarantine for Phase 9."""
import ctypes
import json
import os
import stat
import sys
import time

DIRECTORY_FD = 3
WORKSPACE_FD = 4
CREDENTIAL_FD = 5
MAX_INPUT = 16_384
RENAME_EXCL = 0x00000004
LIBC = ctypes.CDLL("/usr/lib/libSystem.B.dylib", use_errno=True)
RENAMEATX = LIBC.renameatx_np
RENAMEATX.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
RENAMEATX.restype = ctypes.c_int


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


def pause(name):
    raw = os.environ.get(name)
    if raw is not None:
        milliseconds = int(raw)
        if milliseconds < 1 or milliseconds > 2_000:
            raise ValueError("invalid-test-pause")
        time.sleep(milliseconds / 1000)


def rename_exclusive(source_fd, source, destination_fd, destination):
    if RENAMEATX(source_fd, source.encode(), destination_fd, destination.encode(), RENAME_EXCL) != 0:
        raise OSError(ctypes.get_errno(), "rename-exclusive-failed")


def main():
    raw = sys.stdin.buffer.read(MAX_INPUT + 1)
    if len(raw) > MAX_INPUT:
        raise ValueError("invalid-protocol")
    request = json.loads(raw)
    if not isinstance(request, dict) or request.get("version") != 2:
        raise ValueError("invalid-protocol")
    operation = request.get("operation")
    if operation == "zeroize-credential":
        exact(request, ("version", "operation", "workspace", "name", "credential"))
        workspace = identity(request["workspace"])
        credential = identity(request["credential"])
        if (request["name"] != "credentials.json" or workspace["uid"] != os.getuid()
                or workspace["mode"] != 0o700 or credential["uid"] != os.getuid()
                or credential["mode"] != 0o600 or credential["nlink"] != 1):
            raise ValueError("invalid-boundary")
        require_fd(DIRECTORY_FD, workspace, "directory")
        require_fd(CREDENTIAL_FD, credential, "file")
        require_named(DIRECTORY_FD, "credentials.json", credential, "file")
        pause("PHASE9_RECOVERY_TEST_BEFORE_CREDENTIAL_ZEROIZE_MS")
        require_fd(DIRECTORY_FD, workspace, "directory")
        require_fd(CREDENTIAL_FD, credential, "file")
        require_named(DIRECTORY_FD, "credentials.json", credential, "file")
        os.ftruncate(CREDENTIAL_FD, 0)
        if hasattr(os, "fdatasync"):
            os.fdatasync(CREDENTIAL_FD)
        os.fsync(CREDENTIAL_FD)
        require_fd(CREDENTIAL_FD, credential, "file", size=False)
        if os.fstat(CREDENTIAL_FD).st_size != 0:
            raise ValueError("zeroization-failed")
    elif operation == "quarantine-workspace":
        exact(request, ("version", "operation", "directory", "workspaceName", "quarantineName", "workspace"))
        directory = identity(request["directory"])
        workspace = identity(request["workspace"])
        source = request["workspaceName"]
        destination = request["quarantineName"]
        if (not isinstance(source, str) or not source.startswith("phase9-core-identities.")
                or not isinstance(destination, str) or not destination.startswith("phase9-terminal-quarantine.")
                or directory["uid"] != 0 or directory["mode"] != 0o777
                or workspace["uid"] != os.getuid() or workspace["mode"] != 0o700):
            raise ValueError("invalid-boundary")
        require_fd(DIRECTORY_FD, directory, "directory")
        require_fd(WORKSPACE_FD, workspace, "directory")
        require_named(DIRECTORY_FD, source, workspace, "directory")
        try:
            os.stat(destination, dir_fd=DIRECTORY_FD, follow_symlinks=False)
            raise ValueError("quarantine-collision")
        except FileNotFoundError:
            pass
        pause("PHASE9_RECOVERY_TEST_BEFORE_WORKSPACE_QUARANTINE_MS")
        require_fd(DIRECTORY_FD, directory, "directory")
        require_fd(WORKSPACE_FD, workspace, "directory")
        require_named(DIRECTORY_FD, source, workspace, "directory")
        rename_exclusive(DIRECTORY_FD, source, DIRECTORY_FD, destination)
        os.fsync(DIRECTORY_FD)
        require_fd(WORKSPACE_FD, workspace, "directory")
        require_named(DIRECTORY_FD, destination, workspace, "directory")
        try:
            os.stat(source, dir_fd=DIRECTORY_FD, follow_symlinks=False)
            raise ValueError("source-still-present")
        except FileNotFoundError:
            pass
    else:
        raise ValueError("invalid-operation")
    print(json.dumps({"ok": True, "status": "committed"}, separators=(",", ":")))


try:
    main()
except Exception:
    print(json.dumps({"ok": False, "status": "failed"}, separators=(",", ":")))
    raise SystemExit(1)
