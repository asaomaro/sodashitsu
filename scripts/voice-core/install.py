#!/usr/bin/env python3
"""Install an isolated, replaceable official CORE runtime; official terms prompt is retained."""
import argparse
import hashlib
import json
import os
import platform
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path
from engine_support import install as install_engine_support


def download(url, target, digest=None):
    req = urllib.request.Request(url, headers={"User-Agent": "Sodashitsu-VOICEVOX-setup"})
    h = hashlib.sha256()
    with urllib.request.urlopen(req, timeout=120) as response, open(target, "wb") as output:
        while chunk := response.read(1024 * 1024):
            output.write(chunk)
            h.update(chunk)
    if digest and digest != "sha256:" + h.hexdigest():
        raise RuntimeError("official release digest mismatch")


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--version", default="0.17.1")
    p.add_argument("--onnxruntime-version", default="1.23.2")
    p.add_argument("--models-version", default="0.17.0")
    p.add_argument("--models-pattern", default="*.vvm")
    p.add_argument("--device",choices=("cpu","cuda","directml"),default="cpu")
    p.add_argument("--resources-version", default="0.26.0")
    p.add_argument("--output", required=True, help="new runtime directory (must not exist)")
    a = p.parse_args()
    for version in (a.version, a.onnxruntime_version, a.models_version):
        if not re.fullmatch(r"\d+\.\d+\.\d+(?:[-.][A-Za-z0-9.]+)?", version): p.error("invalid version")
    target = Path(a.output).expanduser().absolute()
    if target.exists(): p.error("output already exists; use a new directory to preserve rollback")
    os_name = {"Linux": "linux", "Darwin": "osx", "Windows": "windows"}.get(platform.system())
    arch = {"x86_64": "x64", "AMD64": "x64", "aarch64": "arm64", "arm64": "arm64"}.get(platform.machine())
    if not os_name or not arch: p.error("unsupported platform")
    if a.device=="directml" and os_name!="windows":p.error("DirectML requires Windows")
    if a.device=="cuda" and os_name=="osx":p.error("CUDA is not provided for macOS")
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".soda-core-", dir=target.parent) as stage:
        root = Path(stage)
        req = urllib.request.Request(f"https://api.github.com/repos/VOICEVOX/voicevox_core/releases/tags/{a.version}", headers={"User-Agent":"Sodashitsu"})
        with urllib.request.urlopen(req, timeout=30) as response: release = json.load(response)
        assets = release["assets"]
        downloader_name = f"download-{os_name}-{arch}" + (".exe" if os_name == "windows" else "")
        wheel_arch = {("linux","x64"):"manylinux_2_34_x86_64",("linux","arm64"):"manylinux_2_34_aarch64",("windows","x64"):"win_amd64",("osx","x64"):"macosx",("osx","arm64"):"macosx"}.get((os_name, arch))
        wheels = [x for x in assets if x["name"].endswith(".whl") and wheel_arch and wheel_arch in x["name"] and (os_name != "osx" or ("arm64" if arch == "arm64" else "x86_64") in x["name"])]
        if len(wheels) != 1: raise RuntimeError("no unique official Python wheel for this platform")
        executable = next(x for x in assets if x["name"] == downloader_name)
        for asset in (executable, wheels[0]): download(asset["browser_download_url"], root / asset["name"], asset.get("digest"))
        downloader = root / downloader_name
        downloader.chmod(0o700)
        # Official interactive terms acceptance; never auto-accept.
        subprocess.run([str(downloader), "--only", "onnxruntime", "dict", "models", *(["additional-libraries"] if a.device!="cpu" else []), "--devices",a.device, "--models-pattern", a.models_pattern, "--models-version", a.models_version, "--onnxruntime-version", a.onnxruntime_version, "-o", str(root / "runtime")], check=True)
        subprocess.run([sys.executable, "-m", "pip", "install", "--no-deps", "--target", str(root / "python"), str(root / wheels[0]["name"])], check=True)
        install_engine_support(root / "runtime",root / "python",a.resources_version,a.models_version,include_song=False)
        (root / "install.json").write_text(json.dumps({"core": a.version, "models": a.models_version, "onnxruntime": a.onnxruntime_version, "python":sys.executable, "resources":a.resources_version,"device":a.device}, indent=2)+"\n")
        downloader.unlink()
        (root / wheels[0]["name"]).unlink()
        # Publish the complete installation without changing the active runtime.
        shutil.move(str(root), str(target))
    print("Installed:", target)
    print("Enable with: soda voice enable --transport ipc --acceleration-mode", "CPU" if a.device=="cpu" else "GPU", "--python", sys.executable, "--python-path", target / "python", "--runtime-dir", target / "runtime")


if __name__ == "__main__": main()
