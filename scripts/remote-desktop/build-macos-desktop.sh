#!/bin/bash
set -euo pipefail
# Compile only. Never opens a capture, asks permission, or posts an event.
cd "$(dirname "$0")"
if [[ "$(uname -s)" != Darwin ]]; then
  echo 'macOS 14+ and Xcode Command Line Tools are required' >&2
  exit 1
fi
umask 077
build_dir=$(mktemp -d "${TMPDIR:-/tmp}/soda-macos-build.XXXXXXXX")
trap 'rm -rf -- "$build_dir"' EXIT
cat macos-rich-clipboard.swift macos-desktop-helper.swift > "$build_dir/main.swift"
MACOSX_DEPLOYMENT_TARGET=14.0 xcrun swiftc -swift-version 5 -O "$build_dir/main.swift" -o "$build_dir/macos-desktop-helper"
# Ad-hoc signature changes only this generated file. No certificates are installed.
codesign --force --sign - --identifier dev.sodashitsu.desktop "$build_dir/macos-desktop-helper"
codesign --verify --strict "$build_dir/macos-desktop-helper"
chmod 700 "$build_dir/macos-desktop-helper"
mv -f "$build_dir/macos-desktop-helper" ./macos-desktop-helper
./macos-desktop-helper --probe
