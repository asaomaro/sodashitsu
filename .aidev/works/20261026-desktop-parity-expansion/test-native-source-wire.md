# Native source wire validation — 2026-10-30 JST

This is B-side integration. Browser-PC authenticated native helper, browser gesture controller, actual OLE/Explorer target tests and A/B runtime deployment are not completed or claimed.

## Prior phase delivery

PR#302 tested dfac5d195a411bc2de99e261b9a5fd72d8ed844b, merged main ca2cc152b26d08c92fb3bae9d996f867d956880a. Source build/forced server emit/typecheck and12614 tests/844 files passed390.21s. Root build/forced server emit/typecheck and12676 tests/852 files passed393.62s. Related source browser3 passed24.2s, root browser3 passed19.1s. External clean tested-head build/smoke and four exact-head Windows CI jobs passed (runs40921425541/40921425544). Independent19-path fixed-head/source/root check preserved three root overlaps. No A/B runtime restart.

## N5 execution (final receipts appended after freeze)

Generated Windows execution of the actual fixed builder, current-user owner check, memory-backed selection adapter/worker checks and actual product-worker blocked stdin (no request, no desktop API) passed:

```text
explorer_selection_worker_generated_pointer_identity_nonce_revocation_passed_no_real_desktop
explorer_selection_owned_builder_private_owner_blocked_input_exit_passed
```

Core Node process tests use only disposable owned child programs and generated file fixtures. File route tests cover existing explicit grant, retained generation, cleanup failure/wrong epoch/deadline/revoke/abort, pointer changes, source root confinement, immutable manifest/read, folder+emptydir normalization, wrong lease/gesture/origin, replay and a queued root guard cancelled before preparation. Runtime tests cover actual child close before output acceptance, UTF8/output/diagnostic bounds, nonzero exit, abort, timer and clock-only deadline/regression/throw, and retained artifact identity cleanup. Browser file-client tests cover a reserved native abort slot and5s read timeout. Real synthetic-helper WebSocket tests pass pipe/JSON/shared/file and folder offers; private endpoint Backplane tests retain the trusted outer origin and reject a forged origin before selection. This private-backplane test is not an actual encrypted browser native-drop test.

Independent review corrections: physical/logical cursor mismatch, completion deadline recheck, directory SHA/public-schema mismatch, abort-before-state race, trusted-origin plumbing, process-wide snapshot budget and drain. Corrected product review has no remaining must/should. The first sticky-abort source negative survived because the test's pointer timestamp was already stale; it was strengthened to a fresh pointer and is rerun below. Initial builder test attempted to capture Console.WriteLine through a PowerShell pipeline and received no object; fixed builder uses pipeline output and both positive markers passed. Initial prebuild Node typecheck ran before dependency emits and was not used as final evidence.

Frozen full build/typecheck/tests, related browser, final Windows CI, clean smoke and final independent review are pending. Actual Explorer/UIA/DPI and Windows shell behavior remain real-device validation work.

## Final source controls

14 actual TypeScript/C# product-source mutations failed intended runtime assertions, exact original bytes restored, and each corresponding positive rerun passed. Driver/logs: node_modules/.cache/native-selection/negative-controls.py and negative-results.json. The initial ineffective sticky-abort run is excluded; the final fresh-pointer run passed. Core83 tests (before the two added browser cases), runtime artifact/process13, browser file-client9, full relay223 and private-backplane/service33 have passed in scoped executions. Frozen whole checks supersede overlapping counts.

### trusted-origin

```text
 FAIL  |@sodashitsu/server| src/desktop/DesktopNativeFiles.test.ts > does not inspect B selection for a forged browser origin
AssertionError: promise resolved "{ native: { …(3) } }" instead of rejecting

- Expected
+ Received

```

### sticky-abort

```text
 FAIL  |@sodashitsu/server| src/desktop/DesktopNativeFiles.test.ts > cancels a queued DesktopFiles preparation before its root guard completes
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

```

### release-epoch

```text
 FAIL  |@sodashitsu/server| src/desktop/DesktopNativeFiles.test.ts > refuses activation after epoch
AssertionError: promise resolved "{ id: '9897aac9-cab5-4ee0-a24e-6631c…' }" instead of rejecting

- Expected
+ Received

```

### actual-cleanup

```text
 FAIL  |@sodashitsu/server| src/desktop/DesktopNativeFiles.test.ts > keeps file authority after intentional input release and returns exact copied bytes
AssertionError: expected "vi.fn()" to be called once, but got 0 times
 ❯ src/desktop/DesktopNativeFiles.test.ts:29:96
     27| it("keeps file authority after intentional input release and returns e…
     28|  const f=await setup(),offer=(await f.prepare() as any).native;
     29|  await f.run({action:"native_activate",gesture:f.gesture,lease:offer.l…
```

### pointer-still-valid

```text
 FAIL  |@sodashitsu/server| src/desktop/DesktopNativeFiles.test.ts > rejects changed physical pointer after the trusted adapter returns
AssertionError: promise resolved "{ native: { …(3) } }" instead of rejecting

- Expected
+ Received

```

### snapshot-budget

```text
 FAIL  |@sodashitsu/server| src/desktop/DesktopNativeFiles.test.ts > holds the process-wide snapshot slot until an aborted preparation has drained
AssertionError: promise resolved "{ native: { …(3) } }" instead of rejecting

- Expected
+ Received

```

### file-grant

```text
 FAIL  |@sodashitsu/server| src/desktop/DesktopNativeFiles.test.ts > requires the existing explicit file grant and revokes native bytes immediately
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

```

### folder-offer-sha

```text
 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.ts > copies a trusted folder selection through the file lane only after physical cleanup
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

```

### endpoint-outer-origin

```text
 FAIL  |@sodashitsu/server| src/desktop/DesktopEndpointBackplane.test.ts > binds native file offers to the trusted outer origin across the private endpoint backplane
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

```

### child-deadline

```text
 FAIL  |@sodashitsu/server| src/desktop/DesktopNativeSelection.test.ts > rejects deadline on close even before the timer callback
AssertionError: promise resolved "'late success'" instead of rejecting

- Expected:
Error {
  "message": "rejected promise",
```

### abort-slot

```text
 FAIL  |@sodashitsu/web| src/desktop/fileClient.test.ts > gives native abort the reserved slot while selected-file bytes are pending
AssertionError: expected [ 'native_read' ] to deeply equal [ 'native_read', 'native_abort' ]

- Expected
+ Received

```

### native-read-deadline

```text
 FAIL  |@sodashitsu/web| src/desktop/fileClient.test.ts > rejects a missing native read at five seconds without extending to the ordinary file deadline
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

```

### worker-target

```text
System.Exception: generated assertion: accepted window
   �ꏊ ExplorerSelectionWorkerChecks.Reject(Action action, String reason)
   �ꏊ ExplorerSelectionWorkerChecks.Main()
Explorer selection generated checks failed
�����ꏊ \\wsl.localhost\Ubuntu\workspaces\sodashitsu-desktop-native-selection\scripts\remote-desktop\validate-explorer
```

### worker-watchdog

```text
explorer_selection_worker_generated_pointer_identity_nonce_revocation_passed_no_real_desktop
Selection worker stdin watchdog failed
発生場所 \\wsl.localhost\Ubuntu\workspaces\sodashitsu-desktop-native-selection\scripts\remote-desktop\validate-explorer-sel
ection-worker.ps1:29 文字:66
+ ... .ExitCode -ne 124) { throw 'Selection worker stdin watchdog failed' }
+                          ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
```
