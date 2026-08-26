#!/usr/bin/python3
"""Descriptor-anchored atomic writer for the four Phase 9 evidence files."""

import json
import os
import re
import stat
import sys
import time

DIR_FD = 3
FILES = (
    "00-environment.md",
    "01-fixture-lifecycle.md",
    "03-browser-ledger.md",
    "04-cleanup.md",
)
MAX_INPUT = 1_048_576


def exact_object(value, keys):
    if not isinstance(value, dict) or set(value) != set(keys):
        raise ValueError("invalid-protocol")
    return value


def write_exclusive(name, payload):
    descriptor = os.open(
        name,
        os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW,
        0o600,
        dir_fd=DIR_FD,
    )
    try:
        view = memoryview(payload)
        while view:
            written = os.write(descriptor, view)
            if written <= 0:
                raise OSError("short-write")
            view = view[written:]
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def read_existing(name):
    descriptor = os.open(name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=DIR_FD)
    try:
        metadata = os.fstat(descriptor)
        if not stat.S_ISREG(metadata.st_mode) or metadata.st_size > MAX_INPUT:
            raise ValueError("invalid-target")
        chunks = []
        remaining = metadata.st_size
        while remaining:
            chunk = os.read(descriptor, min(65536, remaining))
            if not chunk:
                raise OSError("short-read")
            chunks.append(chunk)
            remaining -= len(chunk)
        return b"".join(chunks), stat.S_IMODE(metadata.st_mode)
    finally:
        os.close(descriptor)


def remove(name):
    try:
        os.unlink(name, dir_fd=DIR_FD)
    except FileNotFoundError:
        pass


def main():
    raw = sys.stdin.buffer.read(MAX_INPUT + 1)
    if len(raw) > MAX_INPUT:
        raise ValueError("invalid-protocol")
    request = exact_object(json.loads(raw), ("version", "transaction", "directory", "documents"))
    directory = exact_object(request["directory"], ("dev", "ino", "mode"))
    if request["version"] != 1 or not re.fullmatch(r"[0-9]+-[0-9]+-[a-f0-9]{16}", request["transaction"]):
        raise ValueError("invalid-protocol")
    if not isinstance(request["documents"], list) or len(request["documents"]) != len(FILES):
        raise ValueError("invalid-protocol")
    documents = []
    for index, item in enumerate(request["documents"]):
        exact_object(item, ("name", "contents"))
        if item["name"] != FILES[index] or not isinstance(item["contents"], str):
            raise ValueError("invalid-protocol")
        documents.append((item["name"], item["contents"].encode("utf-8")))
    metadata = os.fstat(DIR_FD)
    if (
        not stat.S_ISDIR(metadata.st_mode)
        or metadata.st_dev != directory["dev"]
        or metadata.st_ino != directory["ino"]
        or stat.S_IMODE(metadata.st_mode) != directory["mode"]
    ):
        raise ValueError("directory-identity-mismatch")

    transaction = request["transaction"]
    temps = [(name, f".{name}.{transaction}.tmp") for name, _ in documents]
    backups = []
    promoted = []
    try:
        for (name, contents), (_, temporary) in zip(documents, temps):
            write_exclusive(temporary, contents)
        for name, _ in documents:
            try:
                contents, mode = read_existing(name)
            except FileNotFoundError:
                continue
            backup = f".{name}.{transaction}.bak"
            write_exclusive(backup, contents)
            backups.append((name, backup, mode))
        fail_after = int(os.environ.get("PHASE9_WRITER_TEST_FAIL_PROMOTION", "0"))
        delay_ms = int(os.environ.get("PHASE9_WRITER_TEST_BEFORE_PROMOTION_MS", "0"))
        if delay_ms:
            time.sleep(delay_ms / 1000)
        for index, (name, temporary) in enumerate(temps, 1):
            if fail_after == index:
                raise OSError("injected-promotion-failure")
            os.rename(temporary, name, src_dir_fd=DIR_FD, dst_dir_fd=DIR_FD)
            promoted.append(name)
            os.chmod(name, 0o644, dir_fd=DIR_FD, follow_symlinks=False)
        os.fsync(DIR_FD)
        for _, backup, _ in backups:
            remove(backup)
        os.fsync(DIR_FD)
    except Exception:
        for _, temporary in temps:
            remove(temporary)
        for name in promoted:
            remove(name)
        for name, backup, mode in backups:
            try:
                os.rename(backup, name, src_dir_fd=DIR_FD, dst_dir_fd=DIR_FD)
                os.chmod(name, mode, dir_fd=DIR_FD, follow_symlinks=False)
            except FileNotFoundError:
                pass
        os.fsync(DIR_FD)
        raise
    sys.stdout.write('{"ok":true}\n')


if __name__ == "__main__":
    try:
        main()
    except Exception:
        sys.stderr.write("descriptor-anchored evidence transaction failed\n")
        sys.exit(1)
