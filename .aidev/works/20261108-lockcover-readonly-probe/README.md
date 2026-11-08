# Lock cover routing: read-only diagnostic fixture

Base product: `e15a32972888a5f1da26c09749d9c5fdb3aace6a`. Product source, A/B/C fixtures, OS settings, services and user records are not modified.

This reads actual product predicates by exact zero-argument reflection. It does not copy/reimplement SelectSource/PrepareUserLockScreen conditions. It never calls Main, Wake/Prepare/Dismiss, SendInput, capture, service, Lease, or Share. No PIN/stdin is consumed, image/title/path/SID/logon/token/foreground handle is printed. The three observations are diagnostics, not a live authorization or atomic snapshot.

## Source and compile requirements

Only three C# inputs are required: exact WindowsDesktopUnlock.cs, WindowsDesktopHost.cs, and LockCoverProbe.cs. `source-pins.json` lists all three SHA256 values; `compile.mjs` pins the same values and stages exact copies into a new owned directory before compiling. Host.cs itself defines Dxgi, H264, Cursor, Display, Video* and AgentRegions types. Audio/Microphone/RichClipboard/Virtual*/ProtectedWorker/ResourceFence/CodecProbe are looked up by string reflection in uncalled action paths, not required C# references for these readonly predicates. A lexical source cross-check found no unresolved Soda-prefixed static type identifiers across the two product files. Actual Windows C# compile remains required; no compiler exists on this Linux worker.

The compiler is the fixed Framework64 v4 csc.exe, with six standard .NET Framework references and `/target:winexe /platform:x64 /main:SodaLockCoverProbe`. Full argv is in `compiler-argv.json` for root's Node hidden launcher; no Python is required. No ExecutionPolicy/Bypass, PowerShell or shell interpolation. Do not use a source excerpt or stub to satisfy a missing reference.

From the isolated checkout after placing these fixture files at their project-relative path:

```text
node .aidev/works/20261108-lockcover-readonly-probe/compile.mjs --out-dir C:\<PRIVATE_PARENT>\<NEW_UNIQUE_STAGE>
```

The output directory must not exist; its parent must already be private to the owner. Alternatively root may import `compile(repo, out)` from the exact pinned module using its existing hidden Node runner. The compiler helper never runs the exe. It closes compiler stdin and uses hidden spawn, a45-second deadline and a64KiB/lane cap. stdout/stderr diagnostics are retained in the private output directory, even on failure; public output contains only a fixed failure flag or exit/hash metadata. Keep failed stages for diagnosis, and do not blindly respawn a timed-out compiler.

## Root-owned Windows execution, after independent review

1. Verify copied source hashes and compiler receipt/binary SHA; actual compile exit0 is a separate result from local generated checks.
2. Run the fresh WinExe with only `--self-test` through root's hidden same-session launcher with redirected output and an outer bounded timeout. This exercises generated primitive-return validation, all fixed source/state enums, wrong types, and exact method allowlist/order. It does not call Windows/product predicates.
3. Only after self-test0, root may run only `--observe` once as the normal non-elevated same active-console user. The fixture gates that role before/after each sample. It reads actual product LockState, UserLockScreen, PendingUserLockScreen, InputIsDefault, PendingShellLockScreen, SecureDesktopCandidate, SelectSource, and foreground-zero bool. Three samples are separated by a250ms sleep; SelectSource itself may wait up to about2s, so this is not an exact250ms sampler. A12s watchdog terminates only the fixture process.
4. Consume only fixed booleans/enum plus elapsedMs; no action follows automatically. A source/epoch change requires new native ready/control state before any root-authorized input. Validate own process exit/cleanup; do not touch production processes, panes, default devices, volume, policy, drivers or service state.

`UserLockScreen=true` distinguishes the actual guarded LockApp branch from `PendingUserLockScreen=true` (wake-only branch); `lock_screen_changed` alone does not identify which action previously occurred. No value is called a successful unlock. The dedicated signin service is intentionally inactive for a logged-in locked session.

## Verification status

- Linux Node24 generated compiler-boundary checks:5 passed. Source pins, fixed argv/no execution, private bounded diagnostics, mismatch-before-spawn, no output reuse, and fixed readonly reflection surface covered.
- Node syntax check:0. No product build/type/test repeated.
- Product/source pin listing and compiler staging read-only semantics require final independent review before Windows execution.
- Actual C# compile, C# --self-test and --observe have not been executed by this author. Windows work belongs to root only.
