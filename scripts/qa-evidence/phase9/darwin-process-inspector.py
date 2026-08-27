import argparse
import ctypes
import json
import os
import re
import struct
import sys


MAX_PID_COUNT = 65536
MAX_PROCARGS_BYTES = 2 * 1024 * 1024
MAX_ARG_COUNT = 256
MAX_ARG_BYTES = 16384
MAX_ARGV_BYTES = 262144
MAX_PATH_BYTES = 4096
MAX_ENV_COUNT = 4096
MAX_MARKED_RECORDS = 256
MAX_MARKED_RAW_BYTES = 8 * 1024 * 1024
MAX_SERIALIZED_BYTES = 8 * 1024 * 1024
PROC_PIDTBSDINFO = 3
CTL_KERN = 1
KERN_PROCARGS2 = 49
PROC_FLAG_LP64 = 0x10


class ProcBsdInfo(ctypes.Structure):
    _fields_ = [
        ('pbi_flags', ctypes.c_uint32),
        ('pbi_status', ctypes.c_uint32),
        ('pbi_xstatus', ctypes.c_uint32),
        ('pbi_pid', ctypes.c_uint32),
        ('pbi_ppid', ctypes.c_uint32),
        ('pbi_uid', ctypes.c_uint32),
        ('pbi_gid', ctypes.c_uint32),
        ('pbi_ruid', ctypes.c_uint32),
        ('pbi_rgid', ctypes.c_uint32),
        ('pbi_svuid', ctypes.c_uint32),
        ('pbi_svgid', ctypes.c_uint32),
        ('rfu_1', ctypes.c_uint32),
        ('pbi_comm', ctypes.c_char * 16),
        ('pbi_name', ctypes.c_char * 32),
        ('pbi_nfiles', ctypes.c_uint32),
        ('pbi_pgid', ctypes.c_uint32),
        ('pbi_pjobc', ctypes.c_uint32),
        ('e_tdev', ctypes.c_uint32),
        ('e_tpgid', ctypes.c_uint32),
        ('pbi_nice', ctypes.c_int32),
        ('pbi_start_tvsec', ctypes.c_uint64),
        ('pbi_start_tvusec', ctypes.c_uint64),
    ]


def load_libraries():
    if sys.platform != 'darwin':
        raise RuntimeError('darwin-required')
    libc = ctypes.CDLL(None, use_errno=True)
    libproc = ctypes.CDLL('/usr/lib/libproc.dylib', use_errno=True)
    libproc.proc_pidinfo.argtypes = [
        ctypes.c_int, ctypes.c_int, ctypes.c_uint64, ctypes.c_void_p, ctypes.c_int,
    ]
    libproc.proc_pidinfo.restype = ctypes.c_int
    libproc.proc_pidpath.argtypes = [ctypes.c_int, ctypes.c_void_p, ctypes.c_uint32]
    libproc.proc_pidpath.restype = ctypes.c_int
    libproc.proc_listallpids.argtypes = [ctypes.c_void_p, ctypes.c_int]
    libproc.proc_listallpids.restype = ctypes.c_int
    libc.sysctl.argtypes = [
        ctypes.POINTER(ctypes.c_int), ctypes.c_uint, ctypes.c_void_p,
        ctypes.POINTER(ctypes.c_size_t), ctypes.c_void_p, ctypes.c_size_t,
    ]
    libc.sysctl.restype = ctypes.c_int
    return libc, libproc


def bsd_info(libproc, pid):
    info = ProcBsdInfo()
    size = ctypes.sizeof(info)
    returned = libproc.proc_pidinfo(pid, PROC_PIDTBSDINFO, 0, ctypes.byref(info), size)
    if returned != size or info.pbi_pid != pid or info.pbi_pgid == 0:
        return None
    return (
        int(info.pbi_pid), int(info.pbi_ppid), int(info.pbi_pgid),
        int(info.pbi_start_tvsec), int(info.pbi_start_tvusec),
        8 if int(info.pbi_flags) & PROC_FLAG_LP64 else 4,
    )


def procargs_raw(libc, pid):
    mib = (ctypes.c_int * 3)(CTL_KERN, KERN_PROCARGS2, pid)
    size = ctypes.c_size_t(0)
    if libc.sysctl(mib, 3, None, ctypes.byref(size), None, 0) != 0:
        return None
    if size.value < 5 or size.value > MAX_PROCARGS_BYTES:
        return None
    buffer = ctypes.create_string_buffer(size.value)
    actual = ctypes.c_size_t(size.value)
    if libc.sysctl(mib, 3, buffer, ctypes.byref(actual), None, 0) != 0:
        return None
    if actual.value < 5 or actual.value > size.value:
        return None
    return buffer.raw[:actual.value]


def exact_nul_field(raw, value):
    return value in raw[4:].split(b'\0')


def parse_procargs_bytes(raw, marker_name, marker_value, pointer_size):
    marker = (marker_name + '=' + marker_value).encode('utf-8')
    marker_argument = ('--' + marker_name + '=' + marker_value).encode('utf-8')
    marker_in_raw = exact_nul_field(raw, marker) or exact_nul_field(raw, marker_argument)

    def failed(kind='parseFailure'):
        return {
            'argv': None, 'markerPresent': marker_in_raw,
            'markerArgumentPresent': exact_nul_field(raw, marker_argument),
            'parseError': True, 'inspectionErrorKind': kind,
        }

    if len(raw) < 5 or len(raw) > MAX_PROCARGS_BYTES or pointer_size not in (4, 8):
        return failed()
    try:
        argc = struct.unpack_from('=i', raw, 0)[0]
    except struct.error:
        return failed()
    if argc < 1 or argc > MAX_ARG_COUNT:
        return failed()
    cursor = 4
    executable_end = raw.find(b'\0', cursor)
    if executable_end <= cursor:
        return failed()
    cursor = executable_end + 1
    executable_field_bytes = executable_end - 4 + 1
    structural_padding = (-executable_field_bytes) % pointer_size
    if cursor + structural_padding > len(raw) or any(
        value != 0 for value in raw[cursor:cursor + structural_padding]
    ):
        return failed()
    cursor += structural_padding
    argv_bytes = []
    total = 0
    for _index in range(argc):
        end = raw.find(b'\0', cursor)
        if end < cursor:
            return failed()
        value = raw[cursor:end]
        if len(value) > MAX_ARG_BYTES:
            return failed()
        total += len(value)
        if total > MAX_ARGV_BYTES:
            return failed()
        argv_bytes.append(value)
        cursor = end + 1
    if argv_bytes[0] == b'':
        return failed('argv0Ambiguous')
    marker_in_environment = False
    environment_count = 0
    while cursor < len(raw):
        while cursor < len(raw) and raw[cursor] == 0:
            cursor += 1
        if cursor >= len(raw):
            break
        end = raw.find(b'\0', cursor)
        if end < cursor:
            return failed()
        value = raw[cursor:end]
        if len(value) > MAX_ARG_BYTES:
            return failed()
        environment_count += 1
        if environment_count > MAX_ENV_COUNT:
            return failed()
        if value == marker:
            marker_in_environment = True
        cursor = end + 1
    try:
        argv = [value.decode('utf-8', 'strict') for value in argv_bytes]
    except UnicodeDecodeError:
        return failed()
    return {
        'argv': argv,
        'markerPresent': marker_in_environment or marker_argument in argv_bytes,
        'markerArgumentPresent': marker_argument in argv_bytes,
        'parseError': False, 'inspectionErrorKind': '',
    }


def sanitize_argument(value, marker_name, marker_value):
    exact_marker_argument = '--' + marker_name + '=' + marker_value
    if value == exact_marker_argument:
        return None
    return value.replace(marker_value, ':guardian-marker-value:').replace(
        marker_name, ':guardian-marker-name:',
    )


def executable_path_is_safe(value, marker_name, marker_value):
    if marker_name in value or marker_value in value:
        return False
    return re.search(
        r'(?:credential|fixture|qa-phase7-|bearer|password|passwd|secret|access[-_ ]?token|refresh[-_ ]?token|authorization|cookie)',
        value, re.IGNORECASE,
    ) is None


def executable_path(libproc, pid):
    buffer = ctypes.create_string_buffer(MAX_PATH_BYTES)
    length = libproc.proc_pidpath(pid, buffer, MAX_PATH_BYTES)
    if length <= 0 or length >= MAX_PATH_BYTES:
        return None
    raw = buffer.raw[:length]
    try:
        value = raw.decode('utf-8', 'strict')
    except UnicodeDecodeError:
        return None
    return value if value.startswith('/') and '\x00' not in value else None


def list_pids(libproc):
    count = libproc.proc_listallpids(None, 0)
    if count <= 0 or count > MAX_PID_COUNT:
        raise RuntimeError('pid-list-invalid')
    capacity = min(MAX_PID_COUNT, count + 1024)
    values = (ctypes.c_int * capacity)()
    returned = libproc.proc_listallpids(values, ctypes.sizeof(values))
    if returned <= 0 or returned > capacity:
        raise RuntimeError('pid-list-invalid')
    return sorted(set(int(values[index]) for index in range(returned) if values[index] > 0))


def inspect_pid(libc, libproc, pid, marker_name, marker_value):
    before = bsd_info(libproc, pid)
    if before is None:
        return None
    raw = procargs_raw(libc, pid)
    path = executable_path(libproc, pid)
    after = bsd_info(libproc, pid)
    marker = (marker_name + '=' + marker_value).encode('utf-8')
    marker_argument_bytes = ('--' + marker_name + '=' + marker_value).encode('utf-8')
    raw_marker_present = raw is not None and (
        exact_nul_field(raw, marker) or exact_nul_field(raw, marker_argument_bytes)
    )
    if after is None or before != after:
        if raw_marker_present:
            raise RuntimeError('marked-identity-unstable')
        return None
    if raw is None:
        raise RuntimeError('stable-procargs-unavailable')
    parsed = parse_procargs_bytes(raw, marker_name, marker_value, before[5])
    if not parsed['markerPresent']:
        return None
    if parsed['parseError'] or path is None or not executable_path_is_safe(path, marker_name, marker_value):
        error_kind = parsed['inspectionErrorKind'] if parsed['parseError'] else (
            'inspectionUnavailable' if path is None else 'unsafeExecutablePath'
        )
        return ({
            'pid': before[0],
            'ppid': before[1],
            'pgid': before[2],
            'startSec': before[3],
            'startUsec': before[4],
            'argv': [],
            'executable': '',
            'markerPresent': True,
            'markerArgumentPresent': bool(parsed.get('markerArgumentPresent', raw_marker_present)),
            'inspectionError': True,
            'inspectionErrorKind': error_kind,
        }, len(raw))
    argv = [
        sanitized for value in parsed['argv']
        if (sanitized := sanitize_argument(value, marker_name, marker_value)) is not None
    ]
    return ({
        'pid': before[0],
        'ppid': before[1],
        'pgid': before[2],
        'startSec': before[3],
        'startUsec': before[4],
        'argv': argv,
        'executable': path,
        'markerPresent': True,
        'markerArgumentPresent': parsed['markerArgumentPresent'],
        'inspectionError': False,
        'inspectionErrorKind': '',
    }, len(raw))


def encode_bounded_document(records):
    encoded_records = []
    serialized_bytes = len('{"records":[],"status":"ok","version":2}\n')
    for record in records:
        if len(encoded_records) >= MAX_MARKED_RECORDS:
            raise RuntimeError('aggregate-limit')
        encoded = json.dumps(
            record, ensure_ascii=True, separators=(',', ':'), sort_keys=True,
        )
        encoded_size = len(encoded.encode('ascii')) + (1 if encoded_records else 0)
        if serialized_bytes + encoded_size > MAX_SERIALIZED_BYTES:
            raise RuntimeError('aggregate-limit')
        encoded_records.append(encoded)
        serialized_bytes += encoded_size
    return '{"records":[' + ','.join(encoded_records) + '],"status":"ok","version":2}\n'


def parse_cli():
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument('--marker-name', required=True)
    parser.add_argument('--marker-value', required=True)
    parser.add_argument('--pids')
    args = parser.parse_args()
    if args.marker_name != 'PHASE9_GUARDIAN_RUN_MARKER':
        raise RuntimeError('marker-name-invalid')
    if len(args.marker_value) != 64 or any(value not in '0123456789abcdef' for value in args.marker_value):
        raise RuntimeError('marker-value-invalid')
    if args.pids is None:
        return args, None
    parts = args.pids.split(',')
    if not parts or len(parts) > MAX_PID_COUNT or any(not value.isdigit() for value in parts):
        raise RuntimeError('pid-list-invalid')
    pids = [int(value) for value in parts]
    if any(value <= 0 for value in pids) or len(set(pids)) != len(pids):
        raise RuntimeError('pid-list-invalid')
    return args, sorted(pids)


def main():
    args, requested = parse_cli()
    libc, libproc = load_libraries()
    pids = list_pids(libproc) if requested is None else requested
    records = []
    marked_raw_bytes = 0
    for pid in pids:
        if pid in (os.getpid(), os.getppid()):
            continue
        inspected = inspect_pid(libc, libproc, pid, args.marker_name, args.marker_value)
        if inspected is not None:
            record, raw_bytes = inspected
            marked_raw_bytes += raw_bytes
            if len(records) >= MAX_MARKED_RECORDS or marked_raw_bytes > MAX_MARKED_RAW_BYTES:
                raise RuntimeError('aggregate-limit')
            records.append(record)
    records.sort(key=lambda value: value['pid'])
    sys.stdout.write(encode_bounded_document(records))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        sys.exit(1)
