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

Final source build/typecheck passed; whole source tests are running. All20 scoped paths passed exact-byte source/root preflight before any root write;4 existing overlaps were clean3-way merges preserving unrelated root changes. Root build/typecheck, final browser/process suites, external clean build/smoke and exact-head CI/PR/main delivery remain pending until recorded below. Logs: node_modules/.cache/durable-folders in the source/root worktrees. Remaining tasks after this phase are direct remote Explorer OLE drag, Linux/macOS parity, general unproven signin crash recovery, actual-device validation and deployment.

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
