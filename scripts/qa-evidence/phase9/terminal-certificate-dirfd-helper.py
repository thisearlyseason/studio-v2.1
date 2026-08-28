"""Descriptor-anchored single-file Phase 9 terminal certificate writer."""
import hashlib
import json
import os
import re
import stat
import sys
import time

DIR_FD = 3
MAX_INPUT = 65_536
MAX_DOCUMENT = 32_768


def exact_object(value, keys):
    if not isinstance(value, dict) or set(value) != set(keys):
        raise ValueError("invalid-protocol")
    return value


def sync(descriptor):
    if hasattr(os, "fdatasync"):
        os.fdatasync(descriptor)
    os.fsync(descriptor)


def require_regular(metadata, mode=0o600):
    if (not stat.S_ISREG(metadata.st_mode) or metadata.st_nlink != 1
            or stat.S_IMODE(metadata.st_mode) != mode
            or metadata.st_uid != os.getuid()
            or metadata.st_size < 1 or metadata.st_size > MAX_DOCUMENT):
        raise ValueError("invalid-target")


def read_exact(descriptor, size):
    if not isinstance(size, int) or size < 1 or size > MAX_DOCUMENT:
        raise ValueError("invalid-size")
    os.lseek(descriptor, 0, os.SEEK_SET)
    chunks = []
    remaining = size
    while remaining:
        chunk = os.read(descriptor, min(65_536, remaining))
        if not chunk:
            raise OSError("short-read")
        chunks.append(chunk)
        remaining -= len(chunk)
    if os.read(descriptor, 1):
        raise ValueError("oversize-target")
    return b"".join(chunks)


def open_existing(name):
    before = os.stat(name, dir_fd=DIR_FD, follow_symlinks=False)
    require_regular(before)
    descriptor = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=DIR_FD)
    try:
        after = os.fstat(descriptor)
        require_regular(after)
        if (before.st_dev, before.st_ino) != (after.st_dev, after.st_ino):
            raise ValueError("target-identity-race")
        payload = read_exact(descriptor, after.st_size)
        final = os.fstat(descriptor)
        require_regular(final)
        if (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns) != (
                final.st_dev, final.st_ino, final.st_size, final.st_mtime_ns, final.st_ctime_ns):
            raise ValueError("target-content-race")
        return payload, after
    finally:
        os.close(descriptor)


def require_inventory(name, private_names=()):
    names = set(os.listdir(DIR_FD))
    allowed = {name, *private_names}
    if len(names) > 4 or names - allowed:
        raise ValueError("unexpected-directory-entry")
    return names


def unlink_if_present(name):
    try:
        os.unlink(name, dir_fd=DIR_FD)
    except FileNotFoundError:
        pass


def main():
    if os.environ.get("PHASE9_CERTIFICATE_TEST_HANG") == "1":
        time.sleep(3600)
    raw = sys.stdin.buffer.read(MAX_INPUT + 1)
    if len(raw) > MAX_INPUT:
        raise ValueError("invalid-protocol")
    request = exact_object(json.loads(raw), (
        "version", "operation", "transaction", "directory", "name", "expected", "document",
    ))
    if request["version"] != 1 or request["operation"] != "write":
        raise ValueError("invalid-protocol")
    if not re.fullmatch(r"[0-9]+-[0-9]+-[a-f0-9]{16}", request["transaction"]):
        raise ValueError("invalid-transaction")
    name = request["name"]
    if not isinstance(name, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,126}\.json", name):
        raise ValueError("invalid-name")
    directory = exact_object(request["directory"], ("dev", "ino", "mode", "uid"))
    metadata = os.fstat(DIR_FD)
    if (not stat.S_ISDIR(metadata.st_mode)
            or metadata.st_dev != directory["dev"] or metadata.st_ino != directory["ino"]
            or stat.S_IMODE(metadata.st_mode) != directory["mode"] or metadata.st_uid != directory["uid"]
            or metadata.st_uid != os.getuid()):
        raise ValueError("directory-identity-mismatch")
    payload = request["document"].encode("utf-8") if isinstance(request["document"], str) else None
    if payload is None or len(payload) < 1 or len(payload) > MAX_DOCUMENT:
        raise ValueError("invalid-document")
    expected = request["expected"]
    if not isinstance(expected, dict) or expected.get("state") not in ("absent", "checkpoint"):
        raise ValueError("invalid-expected")
    if expected["state"] == "absent":
        exact_object(expected, ("state",))
    else:
        exact_object(expected, ("state", "size", "sha256"))
        if (not isinstance(expected["size"], int) or expected["size"] < 1 or expected["size"] > MAX_DOCUMENT
                or not isinstance(expected["sha256"], str) or not re.fullmatch(r"[a-f0-9]{64}", expected["sha256"])):
            raise ValueError("invalid-expected")

    temporary = f'.{name}.{request["transaction"]}.tmp'
    backup = f'.{name}.{request["transaction"]}.bak'
    require_inventory(name)
    original = None
    if expected["state"] == "absent":
        try:
            os.stat(name, dir_fd=DIR_FD, follow_symlinks=False)
            raise ValueError("target-must-be-absent")
        except FileNotFoundError:
            pass
    else:
        original, original_metadata = open_existing(name)
        if (len(original) != expected["size"]
                or hashlib.sha256(original).hexdigest() != expected["sha256"]):
            raise ValueError("checkpoint-mismatch")

    temporary_fd = None
    backup_fd = None
    promoted = False
    promoted_identity = None
    try:
        temporary_fd = os.open(
            temporary,
            os.O_CREAT | os.O_EXCL | os.O_RDWR | os.O_NOFOLLOW | os.O_NONBLOCK,
            0o600,
            dir_fd=DIR_FD,
        )
        os.fchmod(temporary_fd, 0o600)
        view = memoryview(payload)
        while view:
            written = os.write(temporary_fd, view)
            if written <= 0:
                raise OSError("short-write")
            view = view[written:]
        sync(temporary_fd)
        if read_exact(temporary_fd, len(payload)) != payload:
            raise ValueError("temporary-mismatch")
        if original is not None:
            backup_fd = os.open(
                backup,
                os.O_CREAT | os.O_EXCL | os.O_RDWR | os.O_NOFOLLOW | os.O_NONBLOCK,
                0o600,
                dir_fd=DIR_FD,
            )
            os.fchmod(backup_fd, 0o600)
            view = memoryview(original)
            while view:
                written = os.write(backup_fd, view)
                if written <= 0:
                    raise OSError("short-backup-write")
                view = view[written:]
            sync(backup_fd)
            if read_exact(backup_fd, len(original)) != original:
                raise ValueError("backup-mismatch")
        require_inventory(name, (temporary, backup) if original is not None else (temporary,))
        delay = int(os.environ.get("PHASE9_CERTIFICATE_TEST_BEFORE_PROMOTION_MS", "0"))
        if delay < 0 or delay > 2000:
            raise ValueError("invalid-delay")
        if delay:
            time.sleep(delay / 1000)
        if original is not None:
            current, current_metadata = open_existing(name)
            if ((current_metadata.st_dev, current_metadata.st_ino) != (original_metadata.st_dev, original_metadata.st_ino)
                    or current != original):
                raise ValueError("checkpoint-swap")
        if os.environ.get("PHASE9_CERTIFICATE_TEST_FAIL_PROMOTION") == "1":
            raise OSError("injected-promotion-failure")
        if original is None:
            temporary_metadata = os.fstat(temporary_fd)
            promoted_identity = (temporary_metadata.st_dev, temporary_metadata.st_ino)
            os.link(
                temporary, name,
                src_dir_fd=DIR_FD, dst_dir_fd=DIR_FD,
                follow_symlinks=False,
            )
            promoted = True
            os.unlink(temporary, dir_fd=DIR_FD)
        else:
            os.replace(temporary, name, src_dir_fd=DIR_FD, dst_dir_fd=DIR_FD)
            promoted = True
        committed, committed_metadata = open_existing(name)
        if committed != payload or stat.S_IMODE(committed_metadata.st_mode) != 0o600:
            raise ValueError("promotion-mismatch")
        os.fsync(DIR_FD)
        unlink_if_present(backup)
        os.fsync(DIR_FD)
        require_inventory(name)
    except Exception:
        if promoted:
            if original is None:
                try:
                    current_metadata = os.stat(name, dir_fd=DIR_FD, follow_symlinks=False)
                    if (current_metadata.st_dev, current_metadata.st_ino) == promoted_identity:
                        os.unlink(name, dir_fd=DIR_FD)
                except FileNotFoundError:
                    pass
            else:
                current, _ = open_existing(name)
                if current == payload:
                    os.replace(backup, name, src_dir_fd=DIR_FD, dst_dir_fd=DIR_FD)
                else:
                    raise
        unlink_if_present(temporary)
        unlink_if_present(backup)
        os.fsync(DIR_FD)
        raise
    finally:
        for descriptor in (temporary_fd, backup_fd):
            if descriptor is not None:
                try:
                    os.close(descriptor)
                except OSError:
                    pass
    sys.stdout.write(json.dumps({
        "ok": True,
        "status": "committed",
        "size": len(payload),
        "sha256": hashlib.sha256(payload).hexdigest(),
    }, sort_keys=True, separators=(",", ":")) + "\n")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        sys.stdout.write('{"ok":false,"status":"atomic-restoration"}\n')
        sys.exit(1)
