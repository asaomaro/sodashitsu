# Server-process restart file continuation (2026-10-29)

Scope is single-file checkpoints across Sodashitsu server process restart/replacement/handoff. Folder persistence is a following phase. OS/kernel crash and power loss durability are excluded explicitly in design/UI/docs. No actual desktop/input/audio, services, driver, trust or existing-user ACL operations. Windows CI's generated validator may harden only its newly created disposable fixture ACL; real current-user DPAPI is used only for its generated metadata key.

## Product and independent review

FileTransfer holds exact root/parent/temporary identity and SHA prefix, restores positionally, discards only an unacknowledged tail after fresh grant/fence, and refuses source/destination replacement. Downloads retain inode/birth/mtime/ctime plus full SHA. A synced prepublication commit intent recovers lost receipts at each link/unlink boundary without replacing existing output. Metadata AES-GCM binds its filename; the32-byte key is owner-file protected on Unix or DPAPI-user protected on Windows. Fixed namespace corruption/missing/zero-byte metadata is rejected without regeneration, hidden volatile fallback or deletion of retained user data.

Handoff freezes synchronously BEFORE source epoch loss, pauses FD expiry, stops keepalive drops, drains loaders and queued work, and closes descriptors without deleting saved data. Rollback drains old epoch objects and cold reloads behind a fresh grant. Settings/endpoint mutations persist generation invalidation before success and balance policy holds even on failure. Epoch/lifetime is captured before newly introduced awaits and checked afterward.

Readonly independent reviews by review_pointer and review_transfer covered design/taskcheck/source/corrections/cross. Reported musts were corrected and re-reviewed: FIFO nonblocking open/fd type checks; exact-temp cleanup; lost publication receipt; stable OFF→ON generation; late-start freeze admission; actual closeClients-before-flush ordering; paused expiry/rollback; download identity; missing/zero namespace; endpoint lifetime after invalidate; failed mutation hold balance. Final shutdown review also required all-entry/all-job cleanup after any descriptor-close failure; this is fixed and re-reviewed. Policy-barrier failure still drains handles, and ordinary server cleanup continues with a fixed warning while handoff failure still propagates. All latest source/correction and root5-file merge reviews clear. No reviewer repeated whole tests.

## Focused and process results

- Focused suites passed during implementation (snapshot/store/registry/settings/endpoint/old FileTransfer/UI); latest shared group45passed before adding direct zero-record cases.
- FileTransfer existing replace fixture now preserves an unknown replacement instead of deleting it. Modification of the original own temporary is still cleaned. This is a deliberate safety correction with runtime source-negative coverage.
- Actual product-built child processes terminated with exit86 at data ACK, before publication link, after link, after temp unlink, after durable receipt and after download prefix. All6 boundaries passed on final rebuilt product, including new permission, accepted prefix, full SHA, nlink1 and no leftover generated temp.
- Early browser server-restart upload/download2cases passed. Final combined suite includes normal/encrypted restart, existing reload/ownership/storage quota cases, and folder regressions; result follows.
- Thirteen actual-product source controls failed intended runtime assertions, exact bytes were restored and corresponding positives passed. Compile/import/timeout errors were not accepted as a negative pass.

## Root preservation

All27 scoped paths passed exact source/root byte preflight before any mutation. Five existing root overlaps were clean3-way merges: docs/remote-desktop.md, composeServer.ts, DesktopProvider.ts, DesktopRelay.ts and RemoteDesktopWindow.vue. Existing local desktop/LAN/error-display/project changes were preserved. review_transfer replayed all5 merges and verified saved merged/root bytes. No root switch/reset/pull/commit. Record-only additions/updates are reflected with their own all-file checks.

## Full verification and delivery

Product commit: `eeb59f7ba504937325c28e0b30806e5791eb7411`, PR [#295](https://github.com/asaomaro/sodashitsu/pull/295).

- Source build/typecheck passed; whole841files/12,528tests passed in419.64s.
- Root build/typecheck passed; whole849files/12,590tests passed in445.04s.
- Source browser19cases passed before the shutdown delta; final normal/encrypted restart upload/download4passed in51.0s. Root combined file/folder browser19passed in3.3m.
- Generated actual-product child termination6boundaries passed after the final shutdown delta on Linux, and all6passed in the Windows CI using a real generated DPAPI-user metadata key.
- Clean detached exact-product worktree `/workspaces/sodashitsu-desktop-durable-smoke`: frozen-lockfile install, build and smoke passed; git status output0bytes.
- Independent source/taskcheck/correction/cross/merge reviews clear; final records review clear including the final result/merge-receipt delta.
- Exact product head Windows CI4/4SUCCESS: [Node identity + restart boundaries](https://github.com/asaomaro/sodashitsu/actions/runs/40866480704) and [protected boundaries/upgrade/maintenance](https://github.com/asaomaro/sodashitsu/actions/runs/40866480669).
- Main receipt: PR#295 merged at2026-10-29T11:52:13Z as `697421b286b51f2ee84c0d8a93361f439dca137b`; the merge tree equals the tested product commit.

Whole suites were run serially between source and root with maxWorkers4. No whole suite was repeated by the independent reviewers. The first pre-final run caught an old fd.stat test spy that dropped bigint options; the corrected spy forwards arguments and counts the added identity check before safe temporary cleanup. The final shutdown corrections were independently re-reviewed, verified by two additional intended source negatives and included in the final build/typecheck/whole/process/browser checks.

Current live A/B runtime was not restarted or deployed in this phase. This does not complete folder persistence, direct remote Explorer OLE drag, Linux/macOS feature parity or general unproven sign-in crash recovery. OS/kernel crash and power-loss guarantees remain excluded. Durable raw logs are under node_modules/.cache/durable-transfers in source/root, with the external clean logs at /tmp/soda-durable-clean-*.log.

## Raw intended-control excerpts

```text
negative prefix
 FAIL  |@sodashitsu/server| src/work/FileTransferSnapshot.test.ts > rejects changed prefix without overwriting or deleting files
AssertionError: promise resolved "{ …(3) }" instead of rejecting
negative temporary-owner
 FAIL  |@sodashitsu/server| src/desktop/DesktopDurableCheckpoints.test.ts > does not delete a replacement temporary file when a later durable snapshot fails
AssertionError: promise rejected "Error: ENOENT: no such file or directory,… { …(4) }" instead of resolving
negative policy-generation
 FAIL  |@sodashitsu/server| src/desktop/DesktopSettings.test.ts > rejects replayed completed checkpoints after OFF then ON and server replacement
AssertionError: expected true to be false // Object.is equality
negative handoff-freeze
 FAIL  |@sodashitsu/server| src/desktop/DesktopDurableCheckpoints.test.ts > freezes before source epoch loss and preserves pending IO, keepalive and expiry across handoff
 FAIL  |@sodashitsu/server| src/desktop/DesktopDurableCheckpoints.test.ts > freezes before source epoch loss and preserves pending IO, keepalive and expiry across rollback
AssertionError: expected false to be true // Object.is equality
negative zero-generation
 FAIL  |@sodashitsu/server| src/desktop/DesktopTransferStore.test.ts > explicitly rejects a zero-byte generation in an established namespace
AssertionError: promise resolved "[]" instead of rejecting
negative admission-freeze
 FAIL  |@sodashitsu/server| src/desktop/DesktopDurableCheckpoints.test.ts > closes admission across the loaded-ensure microtask before taking the handoff drain snapshot
AssertionError: expected 1 to be +0 // Object.is equality
negative source-identity
 FAIL  |@sodashitsu/server| src/desktop/DesktopDurableCheckpoints.test.ts > rejects a same-content replacement download inode after server replacement
AssertionError: expected true to be false // Object.is equality
negative endpoint-lifetime
 FAIL  |@sodashitsu/server| src/desktop/DesktopEndpointService.test.ts > rejects a policy request whose owner lifetime changed during saved-transfer invalidation
AssertionError: promise resolved "{ available: true, …(4) }" instead of rejecting
negative settings-hold
 FAIL  |@sodashitsu/server| src/desktop/DesktopSettings.test.ts > does not leave saved transfers frozen after a settings write fails then succeeds
AssertionError: expected false to be true // Object.is equality
negative fifo
 FAIL  |@sodashitsu/server| src/work/FileTransferSnapshot.test.ts > rejects a post-lstat FIFO replacement through a bounded restore opener
 FAIL  |@sodashitsu/server| src/work/FileTransferSnapshot.test.ts > rejects a post-lstat FIFO replacement through a bounded published opener
AssertionError: expected false to be true // Object.is equality
negative metadata-aad
 FAIL  |@sodashitsu/server| src/desktop/DesktopTransferStore.test.ts > authenticates record filename and ciphertext and refuses corrupted metadata
AssertionError: promise resolved "[ { …(3) }, { …(3) } ]" instead of rejecting
generated_transfer_process_boundary_data_ack_pass
generated_transfer_process_boundary_before_link_pass
generated_transfer_process_boundary_after_link_pass
generated_transfer_process_boundary_after_unlink_pass
generated_transfer_process_boundary_receipt_pass
generated_transfer_process_boundary_download_pass
generated_transfer_restart_new_grant_exact_prefix_publication_and_receipt_pass
```

## Shutdown negative controls

```text
shutdown-barrier
 FAIL  |@sodashitsu/server| src/desktop/DesktopDurableCheckpoints.test.ts > drains saved transfer descriptors even when the policy barrier rejects
AssertionError: expected false to be true // Object.is equality
shutdown-jobs
 FAIL  |@sodashitsu/server| src/desktop/DesktopDurableCheckpoints.test.ts > waits for every saved job after one descriptor close fails
AssertionError: expected true to be false // Object.is equality
```

Both source variants failed intended runtime assertions, exact bytes were restored, and corresponding positives passed. All six generated process boundaries passed again after the shutdown delta.

## Windows process-boundary raw markers

```text
generated_transfer_process_boundary_data_ack_pass
generated_transfer_process_boundary_before_link_pass
generated_transfer_process_boundary_after_link_pass
generated_transfer_process_boundary_after_unlink_pass
generated_transfer_process_boundary_receipt_pass
generated_transfer_process_boundary_download_pass
generated_transfer_restart_new_grant_exact_prefix_publication_and_receipt_pass
```
