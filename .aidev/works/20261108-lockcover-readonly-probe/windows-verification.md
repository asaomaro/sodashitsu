# Root-owned Windows verification (2026-11-08)

Recorded from repository-private coordination receipts, not additional Windows execution by this author. Only whitelisted metadata is copied into `windows-verification.json`; original receipt filenames and byte SHA256 support later private audit. Tokens, cookies, user identifiers, pane IDs, process IDs, individual paths, images and input are omitted.

## Read-only lock-cover probe

- Product revision: `e15a32972888a5f1da26c09749d9c5fdb3aace6a`; probe source fixed at `51617b5f`, independent source review recorded in `66d876c7`.
- Root Windows compile: exit0. Binary SHA256: `3dc3160cd030fec2b0ec791413659ea09b11a40b706f47720f4da4bd9c2ca50a`.
- `rawGitRestored=3`: all three input files had checkout line-ending differences. Before restoring exact git-blob bytes, root confirmed each blob SHA equals its reviewed PINS value. Restoration occurred only in the owned verification checkout; no global core.autocrlf setting or production source change is claimed.
- C# `--self-test`: exit0 / synthetic=true / passed=true.
- C# `--observe`: exit0 / normalActor=true / activeConsole=true / authorization=false.

All three samples returned the same routing predicates:

| Predicate | Observed value |
| --- | --- |
| lockState | 0 (locked) |
| UserLockScreen | true |
| PendingUserLockScreen | false |
| InputIsDefault | true |
| PendingShellLockScreen | false |
| SecureDesktopCandidate | false |
| source | cover |
| foregroundZero | false |

Elapsed times were 281, 807, 1317 ms. These are sequential diagnostics with a 250 ms sleep between samples plus actual predicate execution time, not atomic or exact 250 ms sampling. They establish the guarded visible LockApp branch at those observations, rather than pending wake-only or a secure Winlogon source. They do not authorize a later input, prove that an earlier Enter was delivered, or prove a successful unlock. Root takes a fresh ready/control/epoch before any separate explicit operation; the separate subsequent second-dismiss result is recorded below. Probe itself performs no wake/input/capture/service/lease action and consumes no PIN.

## Windows runtime deployment and isolated smoke

- Source revision e15a3297 was staged with 3395 file SHA checks; 440 files changed and a backup was created. Source clean was confirmed.
- Both existing pane identities were preserved: before 2 / after 2 / missing 0. IDs are intentionally not copied.
- New handoff observed at `2026-11-08T13:30:04.322Z`: adopted 1 / dropped 0. The handoff's adopted count is not the total pane count; it must not be described as adopting both panes. The separate identity check covers both original IDs.
- Ordinary Windows strict server build exceeded its 300-second execution budget. No TypeScript diagnostics were emitted before timeout; this is incomplete verification, not a Windows strict/typecheck pass.
- Runtime-only `--noCheck` emit: exit0. Assistant-host/prune/Web Vite stages: exit0. The prior Linux strict combined build exit 0 remains a separate source/type-check proof and is not replaced by this emit.
- Final isolated Windows native smoke: exit0, authenticated RPC and HTTP/Web index exact check true, actual NodePTY echo true, all 41 assistant-host manifest entries verified, own temporary state removed. Model calls 0. Its receipt explicitly reports `windowsTypecheckPassed=false`.
- This records runtime execution on Windows, not a full Windows compiler/typecheck, signin availability, UAC/microphone reception, or lock/unlock success. Earlier unsuccessful attempts remain in private receipts; only the final successful retry is described as the smoke pass.

No Windows execution, additional live diagnosis, product/A/B/C fixture change, OS setting/device/volume/service/driver change, or user-session input was performed by this documentation task.

## Subsequent root-owned explicit second dismiss

After the three samples confirmed UserLockScreen=true, root obtained a fresh normal viewer ready/control state and explicitly requested one second dismiss. It emitted `lock_screen_changed`. Another fresh viewer still reported secureDesktop=true / lockScreenCover=true and received 0 images. Root then stopped; PIN, arbitrary keys and a third dismiss remained 0.

These are root-supplied metadata observations after the probe, not another probe run by this author. A preceding visible=true sample does not establish the branch or guard at the later command instant. `lock_screen_changed` is shared by wake, successful Enter request, guard loss and source transition paths, so it does not independently prove SendInput execution or delivery. No UIPI/service failure is inferred; no guard/policy change or SYSTEM-to-Default input is attempted.

## Source-only interpretation of the second dismiss

At this revision, existing logs/read-only metadata cannot retrospectively identify the exact action branch or SendInput return for that request:

- `WindowsDesktopUnlock.cs:312/314/322` merges pre-command guard loss, post-exception guard loss, wake success, Enter success, and loop/source change into the same `lock_screen_changed` event.
- `PrepareUserLockScreen` chooses the branch from fresh predicates at execution time. The earlier samples do not preserve those predicate values at the later command instant.
- `WindowsDesktopHost.cs:188` checks the current guard, then requires SendInput's inserted count to equal2. It saves/emits neither the chosen branch nor the return count.
- `SODA_DESKTOP_INPUT_ACK` belongs to `ApplyInput`; the cover's direct guarded dismiss does not call that ACK path. Read-only observations or general lock/unlock events cannot recover a previous SendInput return value from the terminated helper.

To distinguish these cases, a separately reviewed action-time diagnostic would need fixed non-content stage/insert-count metadata attached to the existing guarded action, without changing its authorization or sending extra input. This task implements no such instrumentation and recommends no blind third action. A SendInput count, even if later observed, would mean OS insertion acceptance rather than proof of successful unlock; a failure count alone would not identify UIPI as the cause.
