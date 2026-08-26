"""Descriptor-anchored atomic writer for the four Phase 9 evidence files."""
import hashlib, json, os, re, signal, stat, sys, time

DIR_FD = 3
FILES = ("00-environment.md", "01-fixture-lifecycle.md", "03-browser-ledger.md", "04-cleanup.md")
MAX_INPUT = 1_048_576
MAX_ENTRIES = 32


class UnsafeRecovery(Exception):
    """The original four-file set could not be certified after rollback."""


def exact_object(value, keys):
    if not isinstance(value, dict) or set(value) != set(keys): raise ValueError("invalid-protocol")
    return value


def inventory(allowed):
    names = set(os.listdir(DIR_FD))
    if len(names) > MAX_ENTRIES: raise ValueError("directory-inventory-overflow")
    if names - set(allowed): raise ValueError("unexpected-directory-entry")
    return names


def sync(descriptor):
    if hasattr(os, "fdatasync"): os.fdatasync(descriptor)
    os.fsync(descriptor)


def bounded_size(value):
    if not isinstance(value, int) or value < 0 or value > MAX_INPUT: raise ValueError("invalid-entry-size")
    return value


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
    remaining = bounded_size(expected_size); os.lseek(descriptor, 0, os.SEEK_SET); digest = hashlib.sha256()
    while remaining:
        chunk = os.read(descriptor, min(65536, remaining))
        if not chunk: raise OSError("short-read")
        digest.update(chunk); remaining -= len(chunk)
    if os.read(descriptor, 1): raise ValueError("oversize-entry")
    return digest.hexdigest()


def read_fd(descriptor, expected_size):
    remaining = bounded_size(expected_size); os.lseek(descriptor, 0, os.SEEK_SET); chunks = []
    while remaining:
        chunk = os.read(descriptor, min(65536, remaining))
        if not chunk: raise OSError("short-read")
        chunks.append(chunk); remaining -= len(chunk)
    if os.read(descriptor, 1): raise ValueError("oversize-entry")
    return b"".join(chunks)


def identity(metadata):
    return metadata.st_dev, metadata.st_ino


def require_regular(metadata, mode=None, links=(1,)):
    if not stat.S_ISREG(metadata.st_mode) or (metadata.st_nlink < 1 if links is None else metadata.st_nlink not in links):
        raise ValueError("invalid-entry-type")
    if mode is not None and stat.S_IMODE(metadata.st_mode) != mode: raise ValueError("invalid-entry-mode")


def open_existing(name, links=(1,)):
    before = os.stat(name, dir_fd=DIR_FD, follow_symlinks=False); require_regular(before, links=links)
    descriptor = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=DIR_FD)
    try:
        after = os.fstat(descriptor); require_regular(after, links=links)
        if identity(before) != identity(after): raise ValueError("entry-identity-race")
        return descriptor, after
    except Exception:
        os.close(descriptor); raise


def verify_held(descriptor, expected_mode, expected_size, expected_hash, allow_unlinked=False):
    metadata = os.fstat(descriptor); require_regular(metadata, expected_mode, (0, 1) if allow_unlinked else (1,))
    if metadata.st_size != bounded_size(expected_size) or hash_fd(descriptor, expected_size) != expected_hash:
        raise ValueError("held-content-mismatch")
    return metadata


def read_verified_held(descriptor, expected_mode, expected_size, expected_hash, allow_unlinked=False):
    verify_held(descriptor, expected_mode, expected_size, expected_hash, allow_unlinked)
    payload = read_fd(descriptor, expected_size)
    if hashlib.sha256(payload).hexdigest() != expected_hash: raise ValueError("held-content-race")
    verify_held(descriptor, expected_mode, expected_size, expected_hash, allow_unlinked)
    return payload


def verify_exposed(name, held, expected_mode, expected_size, expected_hash):
    held_metadata = verify_held(held, expected_mode, expected_size, expected_hash)
    entry_metadata = os.stat(name, dir_fd=DIR_FD, follow_symlinks=False); require_regular(entry_metadata, expected_mode)
    if identity(entry_metadata) != identity(held_metadata): raise ValueError("entry-identity-mismatch")
    check, checked = open_existing(name)
    try:
        if identity(checked) != identity(held_metadata): raise ValueError("opened-entry-identity-mismatch")
        if checked.st_size != expected_size or hash_fd(check, expected_size) != expected_hash:
            raise ValueError("entry-content-mismatch")
    finally: os.close(check)


def unlink_if_owned(name, held, allow_linked_absent=False):
    try: opened, opened_metadata = open_existing(name, None)
    except FileNotFoundError:
        try: links = os.fstat(held).st_nlink
        except OSError: return "foreign"
        return "absent" if links == 0 or allow_linked_absent else "stolen"
    except Exception: return "foreign"
    try:
        held_metadata = os.fstat(held)
        if not stat.S_ISREG(held_metadata.st_mode) or held_metadata.st_nlink < 1 or identity(opened_metadata) != identity(held_metadata):
            return "foreign"
        link_count = held_metadata.st_nlink
        os.unlink(name, dir_fd=DIR_FD)
        if os.fstat(held).st_nlink != link_count - 1: raise ValueError("owned-entry-unlink-race")
        return "removed"
    finally: os.close(opened)


def remove_owned_links(descriptor):
    names = os.listdir(DIR_FD)
    if len(names) > MAX_ENTRIES: return False
    for candidate in names:
        try: candidate_metadata = os.stat(candidate, dir_fd=DIR_FD, follow_symlinks=False)
        except FileNotFoundError: continue
        held_metadata = os.fstat(descriptor)
        if stat.S_ISREG(candidate_metadata.st_mode) and identity(candidate_metadata) == identity(held_metadata):
            if unlink_if_owned(candidate, descriptor) != "removed": return False
    return os.fstat(descriptor).st_nlink == 0


def cleanup_record(name, descriptor, allow_linked_absent=False, scan_stolen=False):
    outcome = unlink_if_owned(name, descriptor, allow_linked_absent)
    if outcome in ("absent", "removed"): return True
    if not scan_stolen: return False
    known_foreign = outcome == "foreign"
    return remove_owned_links(descriptor) and not known_foreign


def cleanup_private(states):
    safe = True
    for state in states:
        records = [(state["temporary"], state.get("temp_fd"), state["promoted"], not state["promoted"])]
        if state.get("original"): records.append((state["original"]["backup"], state["original"]["fd"], False, True))
        if state.get("recovery"):
            recovery = state["recovery"]
            records.append((recovery["temporary"], recovery["fd"], recovery["promoted"], not recovery["promoted"]))
        for name, descriptor, allow_linked_absent, scan_stolen in records:
            if descriptor is None: continue
            try: safe = cleanup_record(name, descriptor, allow_linked_absent, scan_stolen) and safe
            except Exception: safe = False
    return safe


def purge_transaction_public(states):
    safe = True
    transaction_descriptors = [state.get("temp_fd") for state in states]
    transaction_descriptors += [state["recovery"]["fd"] for state in states if state.get("recovery")]
    transaction_descriptors = [descriptor for descriptor in transaction_descriptors if descriptor is not None]
    for descriptor in transaction_descriptors:
        try: safe = remove_owned_links(descriptor) and safe
        except Exception: safe = False
    return safe


def emergency_cleanup(states):
    safe = True
    try: safe = purge_transaction_public(states) and safe
    except Exception: safe = False
    try: safe = cleanup_private(states) and safe
    except Exception: safe = False
    try: os.fsync(DIR_FD)
    except Exception: safe = False
    return safe


def require_absent(name):
    try: os.stat(name, dir_fd=DIR_FD, follow_symlinks=False)
    except FileNotFoundError: return
    raise ValueError("originally-absent-target-present")


def failure_point(name):
    raw = os.environ.get(name)
    if raw is None: return 0
    if not re.fullmatch(r"[1-4]", raw): raise ValueError("invalid-test-failure-point")
    return int(raw)


def rollback(states, transaction):
    fail_preparation = failure_point("PHASE9_WRITER_TEST_FAIL_ROLLBACK_PREPARATION")
    fail_promotion = failure_point("PHASE9_WRITER_TEST_FAIL_ROLLBACK_PROMOTION")
    preparation_index = 0
    try:
        for state in states:
            original = state["original"]
            if original is None: continue
            preparation_index += 1
            if fail_preparation == preparation_index: raise OSError("injected-rollback-preparation-failure")
            payload = read_verified_held(original["fd"], 0o600, original["size"], original["hash"], True)
            temporary = f'.{state["name"]}.{transaction}.rollback.tmp'
            descriptor = create_held(temporary, payload, 0o600)
            state["recovery"] = {"temporary": temporary, "fd": descriptor, "promoted": False}
            os.fchmod(descriptor, original["mode"]); sync(descriptor)
            verify_held(descriptor, original["mode"], original["size"], original["hash"])
    except Exception:
        emergency_cleanup(states)
        return False

    promotion_index = 0
    try:
        for state in states:
            original = state["original"]
            if original is None:
                if state["promoted"] and unlink_if_owned(state["name"], state["temp_fd"]) not in ("absent", "removed"):
                    raise ValueError("unsafe-absent-target-recovery")
                state["promoted"] = False; require_absent(state["name"])
                continue
            promotion_index += 1
            if fail_promotion == promotion_index: raise OSError("injected-rollback-promotion-failure")
            recovery = state["recovery"]
            os.rename(recovery["temporary"], state["name"], src_dir_fd=DIR_FD, dst_dir_fd=DIR_FD)
            recovery["promoted"] = True
            verify_exposed(state["name"], recovery["fd"], original["mode"], original["size"], original["hash"])
        os.fsync(DIR_FD)
        for state in states:
            original = state["original"]
            if original is None: require_absent(state["name"])
            else: verify_exposed(state["name"], state["recovery"]["fd"], original["mode"], original["size"], original["hash"])
    except Exception:
        emergency_cleanup(states)
        return False

    for state in states: state["promoted"] = False
    clean = cleanup_private(states)
    os.fsync(DIR_FD)
    for state in states:
        original = state["original"]
        if original is None: require_absent(state["name"])
        else: verify_exposed(state["name"], state["recovery"]["fd"], original["mode"], original["size"], original["hash"])
    return clean


def main():
    if os.environ.get("PHASE9_WRITER_TEST_HANG") == "1": time.sleep(3600)
    raw = sys.stdin.buffer.read(MAX_INPUT + 1)
    if len(raw) > MAX_INPUT: raise ValueError("invalid-protocol")
    request = exact_object(json.loads(raw), ("version", "transaction", "directory", "documents"))
    directory = exact_object(request["directory"], ("dev", "ino", "mode"))
    if request["version"] != 1 or not re.fullmatch(r"[0-9]+-[0-9]+-[a-f0-9]{16}", request["transaction"]): raise ValueError("invalid-protocol")
    if not isinstance(request["documents"], list) or len(request["documents"]) != len(FILES): raise ValueError("invalid-protocol")
    states = []
    for index, item in enumerate(request["documents"]):
        exact_object(item, ("name", "contents"))
        if item["name"] != FILES[index] or not isinstance(item["contents"], str): raise ValueError("invalid-protocol")
        payload = item["contents"].encode("utf-8"); bounded_size(len(payload))
        states.append({
            "name": item["name"], "payload": payload, "hash": hashlib.sha256(payload).hexdigest(),
            "temporary": f'.{item["name"]}.{request["transaction"]}.tmp', "temp_fd": None,
            "original": None, "recovery": None, "promoted": False,
        })
    metadata = os.fstat(DIR_FD)
    if not stat.S_ISDIR(metadata.st_mode) or metadata.st_dev != directory["dev"] or metadata.st_ino != directory["ino"] or stat.S_IMODE(metadata.st_mode) != directory["mode"]: raise ValueError("directory-identity-mismatch")
    inventory(FILES)
    transaction = request["transaction"]
    allowed = set(FILES)
    capture_complete = False
    try:
        for state in states:
            state["temp_fd"] = create_held(state["temporary"], state["payload"])
            allowed.add(state["temporary"]); inventory(allowed)
            if os.environ.get("PHASE9_WRITER_TEST_SIGKILL_AFTER_TEMP") == "1": os.kill(os.getpid(), signal.SIGKILL)
        for state in states:
            try: existing, existing_metadata = open_existing(state["name"])
            except FileNotFoundError: continue
            try:
                bounded_size(existing_metadata.st_size)
                payload_hash = hash_fd(existing, existing_metadata.st_size)
                payload = read_fd(existing, existing_metadata.st_size)
                if hashlib.sha256(payload).hexdigest() != payload_hash: raise ValueError("existing-content-race")
            finally: os.close(existing)
            backup = f'.{state["name"]}.{transaction}.bak'
            backup_fd = create_held(backup, payload, 0o600)
            state["original"] = {
                "backup": backup, "fd": backup_fd, "mode": stat.S_IMODE(existing_metadata.st_mode),
                "size": len(payload), "hash": payload_hash,
            }
            verify_held(backup_fd, 0o600, len(payload), payload_hash)
            allowed.add(backup); inventory(allowed)
        capture_complete = True
        fail_after = failure_point("PHASE9_WRITER_TEST_FAIL_PROMOTION")
        delay_ms = int(os.environ.get("PHASE9_WRITER_TEST_BEFORE_PROMOTION_MS", "0"))
        if delay_ms < 0 or delay_ms > 2000: raise ValueError("invalid-test-delay")
        if delay_ms: time.sleep(delay_ms / 1000)
        for index, state in enumerate(states, 1):
            if fail_after == index: raise OSError("injected-promotion-failure")
            held = state["temp_fd"]; os.fchmod(held, 0o644); sync(held)
            os.rename(state["temporary"], state["name"], src_dir_fd=DIR_FD, dst_dir_fd=DIR_FD)
            state["promoted"] = True; allowed.discard(state["temporary"])
            if index == 1 and os.environ.get("PHASE9_WRITER_TEST_REPLACE_PROMOTION") == "1":
                os.unlink(state["name"], dir_fd=DIR_FD)
                os.link(states[1]["temporary"], state["name"], src_dir_fd=DIR_FD, dst_dir_fd=DIR_FD, follow_symlinks=False)
            if index == 1 and os.environ.get("PHASE9_WRITER_TEST_STEAL_PROMOTION") == "1":
                os.rename(state["name"], f'.{state["name"]}.{transaction}.stolen', src_dir_fd=DIR_FD, dst_dir_fd=DIR_FD)
            verify_exposed(state["name"], held, 0o644, len(state["payload"]), state["hash"]); inventory(allowed)
        os.fsync(DIR_FD)
        for state in states: verify_exposed(state["name"], state["temp_fd"], 0o644, len(state["payload"]), state["hash"])
        expected_final = set(FILES) | {state["original"]["backup"] for state in states if state["original"]}
        if inventory(expected_final) != expected_final: raise ValueError("incomplete-final-inventory")
        if not cleanup_private(states): raise ValueError("owned-artifact-cleanup-uncertain")
        inventory(FILES); os.fsync(DIR_FD)
    except Exception as failure:
        safe = True
        if capture_complete and any(state["promoted"] for state in states):
            try: safe = rollback(states, transaction)
            except Exception:
                emergency_cleanup(states); safe = False
        else:
            try: safe = cleanup_private(states); os.fsync(DIR_FD)
            except Exception: safe = False
        if not safe: raise UnsafeRecovery() from failure
        raise
    finally:
        descriptors = []
        for state in states:
            descriptors.append(state.get("temp_fd"))
            if state.get("original"): descriptors.append(state["original"]["fd"])
            if state.get("recovery"): descriptors.append(state["recovery"]["fd"])
        for descriptor in descriptors:
            if descriptor is None: continue
            try: os.close(descriptor)
            except OSError: pass
    sys.stdout.write('{"ok":true}\n')


if __name__ == "__main__":
    try: main()
    except UnsafeRecovery:
        sys.stderr.write("descriptor-anchored evidence unsafe recovery\n"); sys.exit(2)
    except Exception:
        sys.stderr.write("descriptor-anchored evidence transaction failed\n"); sys.exit(1)
