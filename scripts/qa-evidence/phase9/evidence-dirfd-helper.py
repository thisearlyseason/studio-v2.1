"""Descriptor-anchored atomic writer for the four Phase 9 evidence files."""
import hashlib, json, os, re, signal, stat, sys, time

DIR_FD = 3
FILES = ("00-environment.md", "01-fixture-lifecycle.md", "03-browser-ledger.md", "04-cleanup.md")
MAX_INPUT = 1_048_576

def exact_object(value, keys):
    if not isinstance(value, dict) or set(value) != set(keys): raise ValueError("invalid-protocol")
    return value

def inventory(allowed):
    names = set(os.listdir(DIR_FD))
    if names - set(allowed): raise ValueError("unexpected-directory-entry")
    return names

def sync(descriptor):
    if hasattr(os, "fdatasync"): os.fdatasync(descriptor)
    os.fsync(descriptor)

def create_held(name, payload, mode=0o600):
    descriptor = os.open(name, os.O_CREAT | os.O_EXCL | os.O_RDWR | os.O_NOFOLLOW | os.O_NONBLOCK, mode, dir_fd=DIR_FD)
    try:
        os.fchmod(descriptor, mode)
        view = memoryview(payload)
        while view:
            written = os.write(descriptor, view)
            if written <= 0: raise OSError("short-write")
            view = view[written:]
        sync(descriptor)
        return descriptor
    except Exception:
        os.close(descriptor); raise

def hash_fd(descriptor, expected_size):
    os.lseek(descriptor, 0, os.SEEK_SET); digest = hashlib.sha256(); remaining = expected_size
    while remaining:
        chunk = os.read(descriptor, min(65536, remaining))
        if not chunk: raise OSError("short-read")
        digest.update(chunk); remaining -= len(chunk)
    if os.read(descriptor, 1): raise ValueError("oversize-entry")
    return digest.hexdigest()

def read_fd(descriptor, expected_size):
    os.lseek(descriptor, 0, os.SEEK_SET); chunks = []; remaining = expected_size
    while remaining:
        chunk = os.read(descriptor, min(65536, remaining))
        if not chunk: raise OSError("short-read")
        chunks.append(chunk); remaining -= len(chunk)
    if os.read(descriptor, 1): raise ValueError("oversize-entry")
    return b"".join(chunks)

def require_regular(metadata, mode=None):
    if not stat.S_ISREG(metadata.st_mode) or metadata.st_nlink != 1: raise ValueError("invalid-entry-type")
    if mode is not None and stat.S_IMODE(metadata.st_mode) != mode: raise ValueError("invalid-entry-mode")

def open_existing(name):
    before = os.stat(name, dir_fd=DIR_FD, follow_symlinks=False); require_regular(before)
    descriptor = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=DIR_FD)
    try:
        after = os.fstat(descriptor); require_regular(after)
        if (before.st_dev, before.st_ino) != (after.st_dev, after.st_ino): raise ValueError("entry-identity-race")
        return descriptor, after
    except Exception:
        os.close(descriptor); raise

def verify_exposed(name, held, expected_mode, expected_size, expected_hash):
    held_metadata = os.fstat(held); require_regular(held_metadata, expected_mode)
    if held_metadata.st_size != expected_size or hash_fd(held, expected_size) != expected_hash: raise ValueError("held-content-mismatch")
    entry_metadata = os.stat(name, dir_fd=DIR_FD, follow_symlinks=False); require_regular(entry_metadata, expected_mode)
    if (entry_metadata.st_dev, entry_metadata.st_ino) != (held_metadata.st_dev, held_metadata.st_ino): raise ValueError("entry-identity-mismatch")
    check, checked = open_existing(name)
    try:
        require_regular(checked, expected_mode)
        if (checked.st_dev, checked.st_ino) != (held_metadata.st_dev, held_metadata.st_ino): raise ValueError("opened-entry-identity-mismatch")
        if checked.st_size != expected_size or hash_fd(check, expected_size) != expected_hash: raise ValueError("entry-content-mismatch")
    finally: os.close(check)

def remove(name):
    try: os.unlink(name, dir_fd=DIR_FD)
    except FileNotFoundError: pass

def main():
    if os.environ.get("PHASE9_WRITER_TEST_HANG") == "1": time.sleep(3600)
    raw = sys.stdin.buffer.read(MAX_INPUT + 1)
    if len(raw) > MAX_INPUT: raise ValueError("invalid-protocol")
    request = exact_object(json.loads(raw), ("version", "transaction", "directory", "documents"))
    directory = exact_object(request["directory"], ("dev", "ino", "mode"))
    if request["version"] != 1 or not re.fullmatch(r"[0-9]+-[0-9]+-[a-f0-9]{16}", request["transaction"]): raise ValueError("invalid-protocol")
    if not isinstance(request["documents"], list) or len(request["documents"]) != len(FILES): raise ValueError("invalid-protocol")
    documents = []
    for index, item in enumerate(request["documents"]):
        exact_object(item, ("name", "contents"))
        if item["name"] != FILES[index] or not isinstance(item["contents"], str): raise ValueError("invalid-protocol")
        payload = item["contents"].encode("utf-8"); documents.append((item["name"], payload, hashlib.sha256(payload).hexdigest()))
    metadata = os.fstat(DIR_FD)
    if not stat.S_ISDIR(metadata.st_mode) or metadata.st_dev != directory["dev"] or metadata.st_ino != directory["ino"] or stat.S_IMODE(metadata.st_mode) != directory["mode"]: raise ValueError("directory-identity-mismatch")
    inventory(FILES)
    transaction = request["transaction"]
    temps = [(name, f".{name}.{transaction}.tmp") for name, _, _ in documents]
    temp_fds, backups, promoted, allowed = {}, [], [], set(FILES)
    try:
        for (name, payload, _), (_, temporary) in zip(documents, temps):
            temp_fds[name] = create_held(temporary, payload); allowed.add(temporary); inventory(allowed)
            if os.environ.get("PHASE9_WRITER_TEST_SIGKILL_AFTER_TEMP") == "1": os.kill(os.getpid(), signal.SIGKILL)
        for name, _, _ in documents:
            try: existing, existing_metadata = open_existing(name)
            except FileNotFoundError: continue
            try:
                payload_hash = hash_fd(existing, existing_metadata.st_size); payload = read_fd(existing, existing_metadata.st_size)
                if hashlib.sha256(payload).hexdigest() != payload_hash: raise ValueError("existing-content-race")
            finally: os.close(existing)
            backup = f".{name}.{transaction}.bak"; mode = stat.S_IMODE(existing_metadata.st_mode)
            backup_fd = create_held(backup, payload, mode); backups.append((name, backup, backup_fd, mode, len(payload), payload_hash)); allowed.add(backup); inventory(allowed)
        fail_after = int(os.environ.get("PHASE9_WRITER_TEST_FAIL_PROMOTION", "0")); delay_ms = int(os.environ.get("PHASE9_WRITER_TEST_BEFORE_PROMOTION_MS", "0"))
        if delay_ms: time.sleep(delay_ms / 1000)
        for index, ((name, payload, payload_hash), (_, temporary)) in enumerate(zip(documents, temps), 1):
            if fail_after == index: raise OSError("injected-promotion-failure")
            held = temp_fds[name]; os.fchmod(held, 0o644); sync(held); os.rename(temporary, name, src_dir_fd=DIR_FD, dst_dir_fd=DIR_FD)
            if index == 1 and os.environ.get("PHASE9_WRITER_TEST_REPLACE_PROMOTION") == "1":
                os.unlink(name, dir_fd=DIR_FD); os.link(temps[1][1], name, src_dir_fd=DIR_FD, dst_dir_fd=DIR_FD, follow_symlinks=False)
            allowed.discard(temporary); promoted.append(name); verify_exposed(name, held, 0o644, len(payload), payload_hash); inventory(allowed)
        os.fsync(DIR_FD)
        for name, payload, payload_hash in documents: verify_exposed(name, temp_fds[name], 0o644, len(payload), payload_hash)
        expected_final = set(FILES) | {backup for _, backup, *_ in backups}
        if inventory(expected_final) != expected_final: raise ValueError("incomplete-final-inventory")
        for _, backup, backup_fd, _, _, _ in backups: remove(backup); os.close(backup_fd)
        backups.clear(); inventory(FILES); os.fsync(DIR_FD)
    except Exception:
        for _, temporary in temps: remove(temporary)
        for name in promoted: remove(name)
        for name, backup, backup_fd, mode, size, payload_hash in backups:
            try:
                os.fchmod(backup_fd, mode); sync(backup_fd); os.rename(backup, name, src_dir_fd=DIR_FD, dst_dir_fd=DIR_FD); verify_exposed(name, backup_fd, mode, size, payload_hash)
            except FileNotFoundError: pass
        os.fsync(DIR_FD); raise
    finally:
        for descriptor in list(temp_fds.values()) + [item[2] for item in backups]:
            try: os.close(descriptor)
            except OSError: pass
    sys.stdout.write('{"ok":true}\n')

if __name__ == "__main__":
    try: main()
    except Exception:
        sys.stderr.write("descriptor-anchored evidence transaction failed\n"); sys.exit(1)
