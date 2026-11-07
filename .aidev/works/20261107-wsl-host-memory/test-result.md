# WSL Windows host memory

Memory-only checkpoint before the additional host-CPU request. Base d5a44227, isolated worktree; no sr-pc operation or user setting changes.

- Optional host memory total/available/sample-time, default-off `hostMemory` field with independent graph/color; WSL VM fields remain unchanged. Web/TUI settings enumerate the shared fields/graphs.
- Kernel-confirmed WSL only. Established fixed Windows PowerShell path, NoLogo/NoProfile/NonInteractive/WindowStyle Hidden, fixed EncodedCommand, owned-child lifetime, timeout3s/output4KiB. Success10s/failure30s asynchronous single-pending cache, no timer and no extra native-Windows/non-WSL probe. WindowStyleHidden is explicit; GUI suppression was not visually inspected, and Linux windowsHide alone is not treated as proof.
- Related24 tests pass; protocol/server/Web/TUI types0; scoped core/server tsc builds0. Unit resource tests mock the new collector to avoid actual interop probes.
- Actual allowed MYNOTEPC WSL readonly numeric CIM sample: host total33413771264 / available4595834880 bytes, WSL VM total16299220992; about647ms. Numeric-only receipt attached. Source: Microsoft Win32_OperatingSystem TotalVisibleMemorySize / FreePhysicalMemory (KiB).
- Actual Chromium generated data: separate VM/host display, field on/off, independent graph on/off, semantic color, dark/light screenshots, old server omission.
- Negative: revert only original protocol formatter/field contract and SystemResources wiring to base, rebuild protocol/core, tests4fail/20pass and browser fails. New collector remains present; this detects old feature absence without manufacturing an obsolete parser. Byte-exact SHA restore both original files, rebuild, tests24pass and same browser pass. Raw logs and two-file restoration attached.

The next additive checkpoint adds host CPU to this same collector/process, independently handles partial results and marks WSL scope separately from probe success.
