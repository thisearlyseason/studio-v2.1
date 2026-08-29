"""Descriptor-relative removal for an admitted Phase 9 Playwright profile tree."""
import json
import os
import re
import secrets
import stat
import sys

PARENT_FD = 3
ROOT_FD = 4
MAX_INPUT = 4194304
MAX_ENTRIES = 8192
MAX_BYTES = 536870912
CLI_MAX_FILES = 256
CLI_MAX_FILE_BYTES = 1048576
CLI_MAX_BYTES = 16777216
CLI_NAME = re.compile(r"^(?:console-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.log|page-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.yml)$")
PROFILE_NAME = re.compile(r"^(?:playwright_chromiumdev_profile-[A-Za-z0-9_-]{1,80}|pw-[0-9a-f]{8})$")


def identity(value):
    if not isinstance(value, dict) or set(value) != {"dev", "ino", "uid", "mode"}:
        raise ValueError("invalid-protocol")
    return value


def entry_identity(value):
    keys = {"kind", "dev", "ino", "uid", "mode", "nlink", "size", "mtimeMs", "ctimeMs"}
    if not isinstance(value, dict) or set(value) != keys or value["kind"] not in ("directory", "file"):
        raise ValueError("invalid-protocol")
    return value


def matches(metadata, expected, kind):
    predicate = stat.S_ISDIR if kind == "directory" else stat.S_ISREG
    return (predicate(metadata.st_mode) and metadata.st_dev == expected["dev"]
            and metadata.st_ino == expected["ino"] and metadata.st_uid == expected["uid"]
            and stat.S_IMODE(metadata.st_mode) == expected["mode"])


def same(metadata, before, kind):
    return (matches(metadata, before, kind) and metadata.st_nlink == before["nlink"]
            and metadata.st_size == before["size"] and metadata.st_mtime_ns == before["mtime_ns"]
            and metadata.st_ctime_ns == before["ctime_ns"])


def snapshot(metadata):
    return {"dev": metadata.st_dev, "ino": metadata.st_ino, "uid": metadata.st_uid,
            "mode": stat.S_IMODE(metadata.st_mode), "nlink": metadata.st_nlink,
            "size": metadata.st_size, "mtime_ns": metadata.st_mtime_ns,
            "ctime_ns": metadata.st_ctime_ns}


def matches_entry(metadata, expected):
    kind = expected["kind"]
    predicate = stat.S_ISDIR if kind == "directory" else stat.S_ISREG
    return (predicate(metadata.st_mode) and metadata.st_dev == expected["dev"]
            and metadata.st_ino == expected["ino"] and metadata.st_uid == expected["uid"]
            and stat.S_IMODE(metadata.st_mode) == expected["mode"]
            and metadata.st_nlink == expected["nlink"] and metadata.st_size == expected["size"]
            and round(metadata.st_mtime_ns / 1000000, 6) == round(expected["mtimeMs"], 6)
            and round(metadata.st_ctime_ns / 1000000, 6) == round(expected["ctimeMs"], 6))


def quarantine_name():
    return f".phase9-playwright-cleanup-{secrets.token_hex(24)}.quarantine"


def restore_mismatch(directory_fd, quarantine, name, held, kind):
    try:
        current = os.stat(quarantine, dir_fd=directory_fd, follow_symlinks=False)
        original_missing = False
        try:
            os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
        except FileNotFoundError:
            original_missing = True
        if original_missing:
            os.rename(quarantine, name, src_dir_fd=directory_fd, dst_dir_fd=directory_fd)
    except Exception:
        pass


def quarantine_and_unlink(directory_fd, name, held, expected):
    quarantine = quarantine_name()
    if os.environ.get("PHASE9_CLEANUP_TEST_SWAP_FILE_AT_DELETE") == "1":
        del os.environ["PHASE9_CLEANUP_TEST_SWAP_FILE_AT_DELETE"]
        os.rename(name, f"{name}.phase9-test-held", src_dir_fd=directory_fd, dst_dir_fd=directory_fd)
        descriptor = os.open(name, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600, dir_fd=directory_fd)
        os.write(descriptor, b"foreign\n"); os.close(descriptor)
    os.rename(name, quarantine, src_dir_fd=directory_fd, dst_dir_fd=directory_fd)
    try:
        moved = os.stat(quarantine, dir_fd=directory_fd, follow_symlinks=False)
        if (not matches(moved, expected, "file") or moved.st_nlink != expected["nlink"]
                or moved.st_size != expected["size"] or not matches(os.fstat(held), expected, "file")
                or os.fstat(held).st_nlink != expected["nlink"] or os.fstat(held).st_size != expected["size"]):
            raise ValueError("quarantine-identity-mismatch")
        links = os.fstat(held).st_nlink
        os.unlink(quarantine, dir_fd=directory_fd)
        if os.fstat(held).st_nlink != links - 1:
            raise ValueError("quarantine-unlink-race")
    except Exception:
        restore_mismatch(directory_fd, quarantine, name, held, "file")
        raise


def quarantine_and_rmdir(directory_fd, name, held, expected, inject_root=False):
    quarantine = quarantine_name()
    if inject_root and os.environ.get("PHASE9_CLEANUP_TEST_SWAP_ROOT_AT_DELETE") == "1":
        del os.environ["PHASE9_CLEANUP_TEST_SWAP_ROOT_AT_DELETE"]
        os.rename(name, f"{name}.phase9-test-held", src_dir_fd=directory_fd, dst_dir_fd=directory_fd)
        os.mkdir(name, 0o700, dir_fd=directory_fd)
    os.rename(name, quarantine, src_dir_fd=directory_fd, dst_dir_fd=directory_fd)
    try:
        moved = os.stat(quarantine, dir_fd=directory_fd, follow_symlinks=False)
        if not matches(moved, expected, "directory") or not matches(os.fstat(held), expected, "directory"):
            raise ValueError("quarantine-identity-mismatch")
        os.rmdir(quarantine, dir_fd=directory_fd)
    except Exception:
        restore_mismatch(directory_fd, quarantine, name, held, "directory")
        raise


def main():
    raw = sys.stdin.buffer.read(MAX_INPUT + 1)
    if len(raw) > MAX_INPUT:
        raise ValueError("invalid-protocol")
    request = json.loads(raw)
    if (not isinstance(request, dict) or set(request) != {"version", "operation", "name", "parent", "root", "entries"}
            or request["version"] != 1 or request["operation"] != "remove-playwright-tree"
            or request["name"] != "playwright-tmp"):
        raise ValueError("invalid-protocol")
    parent = identity(request["parent"])
    root = identity(request["root"])
    if not isinstance(request["entries"], list) or len(request["entries"]) > MAX_ENTRIES:
        raise ValueError("invalid-protocol")
    expected_entries = {}
    for entry in request["entries"]:
        if not isinstance(entry, dict) or set(entry) != {"path", "identity"}:
            raise ValueError("invalid-protocol")
        path = entry["path"]
        if (not isinstance(path, str) or not path or path.startswith("/") or "//" in path
                or any(part in ("", ".", "..") for part in path.split("/")) or path in expected_entries):
            raise ValueError("invalid-protocol")
        expected_entries[path] = entry_identity(entry["identity"])
    if parent["uid"] != os.getuid() or root["uid"] != os.getuid() or parent["mode"] != 0o700 or root["mode"] != 0o700:
        raise ValueError("invalid-boundary")
    if not matches(os.fstat(PARENT_FD), parent, "directory") or not matches(os.fstat(ROOT_FD), root, "directory"):
        raise ValueError("descriptor-identity-mismatch")
    named_root = os.stat(request["name"], dir_fd=PARENT_FD, follow_symlinks=False)
    if not matches(named_root, root, "directory"):
        raise ValueError("entry-identity-mismatch")

    counters = {"entries": 0, "bytes": 0, "cli_files": 0, "cli_bytes": 0}
    validated = set()

    def validate_children(directory_fd, prefix=""):
        names = sorted(os.listdir(directory_fd))
        expected_names = {
            path[len(prefix) + 1:].split("/", 1)[0] if prefix else path.split("/", 1)[0]
            for path in expected_entries if not prefix or path.startswith(f"{prefix}/")
        }
        if set(names) != expected_names:
            raise ValueError("entry-identity-mismatch")
        for name in names:
            relative_path = f"{prefix}/{name}" if prefix else name
            expected = expected_entries.get(relative_path)
            if expected is None:
                raise ValueError("entry-identity-mismatch")
            metadata = os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
            if not matches_entry(metadata, expected):
                raise ValueError("entry-identity-mismatch")
            validated.add(relative_path)
            if expected["kind"] == "directory":
                child_fd = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=directory_fd)
                try:
                    if not matches_entry(os.fstat(child_fd), expected):
                        raise ValueError("descriptor-identity-mismatch")
                    validate_children(child_fd, relative_path)
                finally:
                    os.close(child_fd)

    validate_children(ROOT_FD)
    if validated != set(expected_entries):
        raise ValueError("entry-identity-mismatch")

    seen_entries = set()

    def remove_children(directory_fd, scope, depth, prefix=""):
        names = sorted(os.listdir(directory_fd))
        if len(names) > 4096:
            raise ValueError("inventory-limit")
        for name in names:
            counters["entries"] += 1
            if (counters["entries"] > MAX_ENTRIES or not isinstance(name, str) or not 0 < len(name) <= 255
                    or "/" in name or name in (".", "..")):
                raise ValueError("inventory-invalid")
            child_scope = scope
            relative_path = f"{prefix}/{name}" if prefix else name
            expected_entry = expected_entries.get(relative_path)
            if expected_entry is None:
                raise ValueError("entry-identity-mismatch")
            seen_entries.add(relative_path)
            top_modes = None
            if depth == 0:
                if name == ".playwright-cli":
                    child_scope, top_modes = "cli", {0o700}
                elif PROFILE_NAME.fullmatch(name):
                    child_scope = "profile"
                    top_modes = {0o700, 0o755} if name.startswith("pw-") else {0o700}
                else:
                    raise ValueError("inventory-invalid")
            elif scope == "cli" and not CLI_NAME.fullmatch(name):
                raise ValueError("inventory-invalid")
            before_stat = os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
            if not matches_entry(before_stat, expected_entry):
                raise ValueError("entry-identity-mismatch")
            before = snapshot(before_stat)
            mode = before["mode"]
            if before["uid"] != os.getuid() or mode & 0o022:
                raise ValueError("metadata-invalid")
            if stat.S_ISDIR(before_stat.st_mode):
                if depth == 0 and mode not in top_modes:
                    raise ValueError("metadata-invalid")
                if scope == "cli" or depth >= 8:
                    raise ValueError("metadata-invalid")
                child_fd = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=directory_fd)
                try:
                    if not same(os.fstat(child_fd), before, "directory"):
                        raise ValueError("descriptor-identity-mismatch")
                    remove_children(child_fd, child_scope, depth + 1, relative_path)
                    if not matches(os.fstat(child_fd), before, "directory"):
                        raise ValueError("descriptor-identity-mismatch")
                    named = os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
                    if not matches(named, before, "directory"):
                        raise ValueError("entry-identity-mismatch")
                    quarantine_and_rmdir(directory_fd, name, child_fd, before)
                finally:
                    os.close(child_fd)
            elif stat.S_ISREG(before_stat.st_mode):
                if depth == 0 or before["nlink"] != 1 or before["size"] < 0:
                    raise ValueError("metadata-invalid")
                if scope == "cli" and mode != 0o600:
                    raise ValueError("metadata-invalid")
                counters["bytes"] += before["size"]
                if counters["bytes"] > MAX_BYTES:
                    raise ValueError("inventory-limit")
                if scope == "cli":
                    counters["cli_files"] += 1
                    counters["cli_bytes"] += before["size"]
                    if (counters["cli_files"] > CLI_MAX_FILES or before["size"] > CLI_MAX_FILE_BYTES
                            or counters["cli_bytes"] > CLI_MAX_BYTES):
                        raise ValueError("inventory-limit")
                child_fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=directory_fd)
                try:
                    if not same(os.fstat(child_fd), before, "file"):
                        raise ValueError("descriptor-identity-mismatch")
                    named = os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
                    if not same(named, before, "file"):
                        raise ValueError("entry-identity-mismatch")
                    quarantine_and_unlink(directory_fd, name, child_fd, expected_entry)
                finally:
                    os.close(child_fd)
            else:
                raise ValueError("metadata-invalid")

    remove_children(ROOT_FD, "root", 0)
    if seen_entries != set(expected_entries):
        raise ValueError("entry-identity-mismatch")
    if os.listdir(ROOT_FD):
        raise ValueError("cleanup-incomplete")
    if not matches(os.fstat(PARENT_FD), parent, "directory") or not matches(os.fstat(ROOT_FD), root, "directory"):
        raise ValueError("descriptor-identity-mismatch")
    named_root = os.stat(request["name"], dir_fd=PARENT_FD, follow_symlinks=False)
    if not matches(named_root, root, "directory"):
        raise ValueError("entry-identity-mismatch")
    quarantine_and_rmdir(PARENT_FD, request["name"], ROOT_FD, root, inject_root=True)
    try:
        os.stat(request["name"], dir_fd=PARENT_FD, follow_symlinks=False)
        raise ValueError("cleanup-incomplete")
    except FileNotFoundError:
        pass
    print('{"ok":true,"status":"removed"}')


try:
    main()
except Exception:
    print('{"ok":false,"status":"failed"}')
    raise SystemExit(1)
