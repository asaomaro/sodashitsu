#!/usr/bin/env python3
"""Prepare an unsigned, auditable signing submission. Never install or sign."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import stat
import struct

NAMES = ("SodaVirtualDisplay.inf", "SodaVirtualDisplay.dll", "SodaVirtualDisplay.cat", "SodaVirtualDisplay.pdb")


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def local_path(path):
    absolute = path.absolute()
    # Preserve the original path while inspecting every ancestor; resolve() alone
    # would hide a symlink and accidentally bless a different input/output root.
    for part in (absolute, *absolute.parents):
        if part.is_symlink() or (part.exists() and getattr(part.lstat(), "st_file_attributes", 0) & stat.FILE_ATTRIBUTE_REPARSE_POINT):
            raise ValueError("Symlinks/junctions are not accepted")
    if any(c in str(absolute) for c in '\r\n"') or str(absolute).startswith(("\\\\", "//")):
        raise ValueError("A local path without quotes/newlines is required")
    return absolute


def prepare(package, symbols, output, source_commit):
    if not re.fullmatch(r"[0-9a-f]{40}", source_commit):
        raise ValueError("Full lowercase source commit SHA required")
    package, symbols, output = map(local_path, (package, symbols, output))
    sources = {}
    for name in NAMES:
        # The WDK output uses a lowercase catalog on disk. Windows is case
        # insensitive; locating that exact alternative also supports Linux audits.
        path = symbols if name.endswith(".pdb") else package / name
        if name.endswith(".cat") and not path.exists():
            path = package / name.lower()
        path = local_path(path)
        if not path.is_file() or path.stat().st_size == 0:
            raise ValueError("Missing/empty submission file: " + name)
        sources[name] = path
    inf = sources[NAMES[0]].read_text(encoding="utf-8-sig")
    if "$ARCH$" in inf or "$UMDFVERSION$" in inf:
        raise ValueError("Use the built/stamped INF, not the source template")
    if not re.search(r"(?im)^\s*%DeviceName%\s*=\s*MyDevice_Install,\s*Sodashitsu\\VirtualDisplayV1\s*$", inf):
        raise ValueError("Unexpected Sodashitsu hardware ID")
    if not re.search(r"(?im)^\[Standard\.NTamd64\.10\.0\.\.\.22000\]\s*$", inf):
        raise ValueError("Expected Windows 11 x64 INF")
    dll = sources[NAMES[1]].read_bytes()
    if len(dll) < 64 or dll[:2] != b"MZ":
        raise ValueError("Expected x64 PE driver binary")
    offset = struct.unpack_from("<I", dll, 60)[0]
    if offset + 6 > len(dll) or dll[offset:offset+4] != b"PE\0\0" or struct.unpack_from("<H", dll, offset+4)[0] != 0x8664:
        raise ValueError("Expected x64 PE driver binary")
    # Validate everything before creating output. Never overwrite another release.
    output.mkdir(parents=False, exist_ok=False)
    payload = output / "SodaVirtualDisplay"
    payload.mkdir()
    hashes = {}
    for name, source in sources.items():
        target = payload / name
        shutil.copyfile(source, target)
        hashes[name] = sha256(target)
        if hashes[name] != sha256(source):
            raise ValueError("Input changed while copying: " + name)
    metadata = {"version": 1, "sourceCommit": source_commit, "state": "unsigned-submission-only", "architecture": "x64", "minimumWindowsBuild": 22000, "hardwareId": "Sodashitsu\\VirtualDisplayV1", "files": hashes}
    (output / "submission.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    # Relative paths avoid embedding build-machine paths. Run makecab from output.
    lines = ['.OPTION EXPLICIT', '.Set CabinetNameTemplate=SodaVirtualDisplay-unsigned-submission.cab', '.Set DiskDirectoryTemplate=.', '.Set CompressionType=MSZIP', '.Set Cabinet=on', '.Set Compress=on', '.Set DestinationDir=SodaVirtualDisplay']
    lines += ['"SodaVirtualDisplay/' + name + '"' for name in NAMES]
    (output / "submission.ddf").write_text("\r\n".join(lines) + "\r\n", encoding="ascii")
    return metadata


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--package", type=Path, required=True)
    parser.add_argument("--symbols", type=Path, required=True, help="Matching WDK output SodaVirtualDisplay.pdb")
    parser.add_argument("--output", type=Path, required=True, help="New directory under an existing parent")
    parser.add_argument("--source-commit", required=True)
    args = parser.parse_args()
    result = prepare(args.package, args.symbols, args.output, args.source_commit)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
