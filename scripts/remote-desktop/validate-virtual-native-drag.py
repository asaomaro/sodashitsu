#!/usr/bin/env python3
"""WSL/local Windows csc; generated memory-only guards, no OS desktop operations."""
import argparse
import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

SOURCE = Path(__file__).resolve().parent
CSC = (Path(os.environ.get('SystemRoot', 'C:/Windows')) / 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
       if os.name == 'nt' else Path('/mnt/c/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe'))
NAMES = ('WindowsDesktopUnlock.cs', 'WindowsDesktopHost.cs', 'WindowsPointerWitnessChecks.cs')

def win(path):
    return str(path) if os.name == 'nt' else subprocess.check_output(['wslpath', '-w', str(path)]).decode().strip()

def run(folder):
    output = folder / 'checks.exe'
    refs = ('System.dll', 'System.Core.dll', 'System.Drawing.dll', 'System.Windows.Forms.dll', 'System.Web.Extensions.dll', 'System.ServiceProcess.dll')
    command = [str(CSC), '/nologo', '/noconfig', '/warnaserror+', '/target:exe', '/main:SodaPointerWitnessChecks', '/out:' + win(output)]
    command += ['/r:' + ref for ref in refs] + [win(folder / name) for name in NAMES]
    result = subprocess.run(command, capture_output=True, timeout=60)
    print(result.stdout.decode(errors='replace'), end='')
    print(result.stderr.decode(errors='replace'), end='')
    if result.returncode:
        raise RuntimeError('Generated compilation failed: ' + str(result.returncode))
    result = subprocess.run([str(output)], capture_output=True, timeout=30)
    print(result.stdout.decode(errors='replace'), end='')
    print(result.stderr.decode(errors='replace'), end='')
    return result.returncode

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--windows-temp', type=Path, help='Windows-visible temporary directory when running from WSL')
    args = parser.parse_args()
    if os.name != 'nt' and args.windows_temp is None:
        parser.error('--windows-temp is required under WSL')
    if not CSC.is_file() or args.windows_temp is not None and not args.windows_temp.is_dir():
        raise SystemExit('Local Windows csc/temporary folder unavailable; no remote fallback')
    folder = Path(tempfile.mkdtemp(prefix='soda-virtual-native-drag-', dir=args.windows_temp))
    original = {name: (SOURCE / name).read_bytes() for name in NAMES}
    try:
        for name, content in original.items():
            (folder / name).write_bytes(content)
        if run(folder):
            raise RuntimeError('Generated positive checks failed')
        host = folder / 'WindowsDesktopHost.cs'
        text = original[host.name].decode()
        variants = (
            ('old_virtual_admission', '(VirtualLease!=null&&!VirtualNativePointerSource())', 'VirtualLease!=null'),
            ('missing_monitor_scope', 'ActiveMonitors.Bounds==Bounds&&SourceMatches(CaptureDevice)', 'ActiveMonitors.Bounds==Bounds'),
        )
        for label, before, after in variants:
            if text.count(before) != 1:
                raise RuntimeError('Negative target is not unique: ' + label)
            host.write_text(text.replace(before, after))
            if run(folder) == 0:
                raise RuntimeError('Negative guard change did not fail: ' + label)
            print('negative_' + label + '_failed_as_expected')
            host.write_bytes(original[host.name])
            assert host.read_bytes() == original[host.name]
        host.write_bytes(original[host.name])
        assert host.read_bytes() == original[host.name]
        print('byte_exact_restore_sha256=' + hashlib.sha256(host.read_bytes()).hexdigest())
        if run(folder):
            raise RuntimeError('Restored generated checks failed')
    finally:
        for name, content in original.items():
            assert (SOURCE / name).read_bytes() == content, 'Repository source changed during generated checks'
        shutil.rmtree(folder)

if __name__ == '__main__':
    main()
