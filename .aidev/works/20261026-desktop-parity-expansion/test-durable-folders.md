# Durable folder checkpoints — 2026-10-29

Scope: explicit browser-saved folder upload/ZIP download across server-process restart/handoff, fresh manual file grant/attach,15min idle expiry, each-registry8jobs/100MiB and browser combined8jobs/100MiB. No power-loss guarantee or old-version migration. No real screen/input/audio/service/installed ACL changes. Windows validator may harden only its newly-created disposable private fixture and protect a generated key with real current-user DPAPI.

## Implementation and independent reviews

Strict folder snapshots bind approved root/directory identities, partial FileTransfer prefix snapshots, per-file prepublication intent, completed source identity+SHA, empty directories and final receipt. ZIPs reside in the private folder-store namespace and bind original source tree metadata, archive FD/name/parent identity and full SHA. Snapshot restore is serialized with operation/close queues and rechecks admission before adoption. Unknown temporary/ZIP replacements are preserved. Completed folders including empty directories remain after receipt release.

Separate DesktopTransferStore folderRecords mode is bounded2MiB plaintext/3MiB envelope; default single-file45KiB/64KiB limits remain unchanged. The maximum1000 completed-state manifest exceeds1MiB and is tested through encrypted write/new-store read. Both registries freeze synchronously before provider epoch loss; settings/endpoint invalidation/bind, revoke/cold cancel and shutdown drain wait for both. Pending cleanup stays tracked after job removal; all resources are attempted even when one close fails.

Readonly taskcheck/cross/correction reviews by review_pointer and review_transfer cleared all reported musts. Corrections: restore/close serialization; exact-FD ZIP cleanup; immediate FD ownership before final guard await; final receipt cleanup preserving empty dirs; pending cancellation cleanup tracking; archive close independent of transfer-close failure; Relay capability/ready proof projection. Final source reinspection and eleven intended source controls are clear. No reviewer repeated whole tests.

## Verification before final freeze

- Focused shared8files/104tests passed before the last bound-only store adjustment; maximum-manifest/store suite11passed afterward.
- Actual built child processes terminated with exit86 at ACK, before link, after link, after unlink, folder receipt and ZIP-prefix boundaries:6passed. Final rebuilt rerun and Windows CI follow.
- Browser normal/encrypted restart folder upload/ZIP download4passed33.5s before the final cleanup-drain/bound delta; final rerun follows. Browser initially caught a missing Relay capability projection and completed empty-directory deletion; both are corrected with direct regressions.
- Eleven product-source variants each failed intended runtime AssertionErrors, exact original bytes were restored, and corresponding positive runs passed. An initial restore variant retained queue tracking and was insufficient; the corrected variant removes tracking too. An initial ZIP-cleanup negative exposed that clear returned before scheduled cleanup; cleanup tracking and a held-FD regression corrected the product and the observation boundary.

## Final verification and delivery

Product head: `5da798838e4c8f9b2583fbc4c9cd48657c6872c1`. PR [#297](https://github.com/asaomaro/sodashitsu/pull/297) merged2026-10-29T13:39:09Z as `c1e5c763d41f807171e793c5fd8d0f37c23b5435`; merge tree equals the tested head.

- Corrected source build/typecheck passed;843files/12,556tests passed340.77s.
- Corrected root build/typecheck passed;851files/12,618tests passed335.43s.
- Final normal/encrypted folder restart browser4passed37.3s; root combined single-file/folder browser23passed2.8m.
- Final built Linux child boundaries: single-file6 + folder6passed. Windows CI also passed all single-file6 + folder6 with generated DPAPI keys, without desktop/input/service activity.
- Exact head CI4/4SUCCESS: [Node/DPAPI/process boundaries](https://github.com/asaomaro/sodashitsu/actions/runs/40881169344), [protected boundaries/upgrade/maintenance](https://github.com/asaomaro/sodashitsu/actions/runs/40881169374).
- Clean detached exact head at `/workspaces/sodashitsu-desktop-durable-smoke`: install/build and final corrected build/smoke passed, status0bytes. Raw external logs `/tmp/soda-durable-folders-clean-final-*.log`.
- All20 source/root paths byte-checked,4 existing overlaps independently replayed from saved base/root/source; all clean and current root matches. Existing local connection, LAN HTTP permission, failure messages and UI/docs changes remain.
- Independent source/taskcheck/correction/cross/root review clear; final receipt-only record delta review clear.

The initial pre-Windows-fix candidate whole12,555 passed354.16s. Real Windows CI caught EPERM on restored ZIP read-only fsync after5upload boundaries passed. ZIP construction keeps its writable sync; the redundant restore-checkpoint sync was removed. A direct generated EPERM regression and12th intended source negative verify this. The old root whole was gracefully cancelled130, then BOTH corrected whole suites rerun serially with maxWorkers4. No compile/import/timeouts counted as intended source-negative success; no reviewer repeated whole tests.

This phase did not deploy/restart the live A/B servers. Remaining direct remote Explorer OLE drag, Linux/macOS parity, general unproven signin crash recovery and actual-device validation continue as separate bounded work. Logs are under node_modules/.cache/durable-folders in source/root.


## Raw intended-control excerpts

```text
prefix
 FAIL  |@sodashitsu/server| src/desktop/DesktopFolderSnapshot.test.ts > rejects changed prefix identity/content and preserves unknown data
AssertionError: promise resolved "{ …(5) }" instead of rejecting
restore-queue
 FAIL  |@sodashitsu/server| src/desktop/DesktopFolderSnapshot.test.ts > serializes restore with shutdown and cannot adopt descriptors after shutdown completes
AssertionError: expected true to be false // Object.is equality
publication-intent
 FAIL  |@sodashitsu/server| src/desktop/DesktopFolderSnapshot.test.ts > records the complete original temporary identity before publishing each file
AssertionError: expected [] to have a length of 1 but got +0
zip-cleanup
 FAIL  |@sodashitsu/server| src/desktop/DesktopFolderSnapshot.test.ts > preserves an unknown ZIP replacement during warm cancellation
 FAIL  |@sodashitsu/server| src/desktop/DesktopFolderSnapshot.test.ts > preserves an unknown ZIP replacement during restored cancellation
AssertionError: promise rejected "Error: ENOENT: no such file or directory,… { …(4) }" instead of resolving
default-bound
 FAIL  |@sodashitsu/server| src/desktop/DesktopTransferStore.test.ts > allows bounded folder metadata without raising the default single-file limit
AssertionError: promise resolved "undefined" instead of rejecting
source-identity
 FAIL  |@sodashitsu/server| src/desktop/DesktopFolderSnapshot.test.ts > rejects a retained ZIP rewritten in place even when its bytes are unchanged
AssertionError: promise resolved "{ …(5) }" instead of rejecting
fd-ownership
 FAIL  |@sodashitsu/server| src/desktop/DesktopFolderSnapshot.test.ts > closes the restored archive FD when the final scratch-directory guard fails
AssertionError: promise resolved "Stats{ dev: 2096, mode: 33152, …(12) }" instead of rejecting
complete-tree
 FAIL  |@sodashitsu/server| src/desktop/DesktopDurableFolders.test.ts > keeps the completed folder and its empty directories when releasing the saved receipt
AssertionError: promise rejected "Error: ENOENT: no such file or directory,… { …(4) }" instead of resolving
cancel-drain
 FAIL  |@sodashitsu/server| src/desktop/DesktopFolderSnapshot.test.ts > waits for cancelled ZIP cleanup even after its job is removed from the map
AssertionError: expected true to be false // Object.is equality
resource-drain
 FAIL  |@sodashitsu/server| src/desktop/DesktopFolderSnapshot.test.ts > still closes the ZIP descriptor when closing its transfer fails
AssertionError: expected "close" to be called 1 times, but got 0 times
admission
 FAIL  |@sodashitsu/server| src/desktop/DesktopDurableFolders.test.ts > closes start admission across a loaded-ensure microtask before handoff drain
AssertionError: expected 1 to be +0 // Object.is equality
```

## Windows read-only ZIP correction control

```text
 FAIL  |@sodashitsu/server| src/desktop/DesktopFolderSnapshot.test.ts > checkpoints a restored read-only ZIP without attempting a Windows-invalid fsync
AssertionError: promise rejected "Error: generated Windows read-only sync { code: '…' }" instead of resolving
```

This is the12th intended product-source negative. Independent correction review is clear.

## Windows corrected process-boundary raw markers

```text
generated_folder_process_boundary_data_ack_pass
generated_folder_process_boundary_before_link_pass
generated_folder_process_boundary_after_link_pass
generated_folder_process_boundary_after_unlink_pass
generated_folder_process_boundary_receipt_pass
generated_folder_process_boundary_download_pass
generated_folder_restart_fresh_grant_exact_tree_zip_and_receipt_pass
```
