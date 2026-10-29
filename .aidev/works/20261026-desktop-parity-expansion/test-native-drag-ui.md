# N7 native drag UI / CLI verification
## Scope

No real Explorer selection/drop, OLE target, clipboard, OS input, driver/service installation or A/B runtime deployment was performed. User confirms no Linux/macOS desktop device; WSL is available on both Windows PCs and is not native Linux/macOS desktop validation.
## Generated positive checks

- Browser production Controller/FileClient/Bridge/Host/DesktopFiles with generated70000-byte source and actual memory-target process: plain and encrypted lanes, two contiguous chunks, different B anti-replay request UUIDs, native per-file correlation preserved and actual close before completion. Encrypted public frames do not expose native request/source names.
- Separate actual built Vue desktop page: file grant UI → manual helper → trusted mouse down/ACK → buffered move → input/control and pointer capture release → completion DOM. Generated desktop/file peer; no OS. Native pointerup/blur do not cancel asynchronous extraction.
- Component and RPC unit tests cover revoke, retained prepared helper, late locator/bridge cleanup and30s owner-bound keepalive. Core covers750ms window, exact release, reentrant cancellation and retiring native process.
- Actual compiled CLI, unclaimed Gateway: locator stdout, SIGINT, Gateway cleanup, exit0. This test does not spawn a native worker.
## Actual product-source negative controls

Each mutation was applied to the production source, the targeted test run, and original bytes restored exactly. Logs are locally retained under `.cache/native-drag-ui/negative-*.log`. Each failed at an intended runtime assertion; compile/import/harness timeouts do not count. Full positive rerun:30 tests passed.

### negative-grant-watch

```text
 FAIL  |@sodashitsu/web| src/components/DesktopNativeTransfer.test.ts > revokes transfer immediately while retaining the prepared helper for a fresh grant
AssertionError: Target cannot be null or undefined.
 ❯ src/components/DesktopNativeTransfer.test.ts:22:129


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 3 skipped (4)
   Start at  04:31:22
   Duration  1.33s (transform 61%, environment 18%, import 18%, tests 2%)

```

### negative-late-bridge

```text
 FAIL  |@sodashitsu/web| src/components/DesktopNativeTransfer.test.ts > closes a late local bridge even when it ignores Abort during initialization
AssertionError: expected "vi.fn()" to be called once, but got 0 times
 ❯ src/components/DesktopNativeTransfer.test.ts:28:389


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 3 skipped (4)
   Start at  04:31:24
   Duration  1.21s (transform 60%, import 18%, environment 17%, tests 4%, worker 1%)

```

### negative-late-selection

```text
 FAIL  |@sodashitsu/web| src/desktop/nativeDrag.test.ts > does not revive a selection returned after its pointer was released
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/desktop/nativeDrag.test.ts:34:456


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 9 skipped (10)
   Start at  04:31:19
   Duration  949ms (transform 64%, environment 18%, import 15%, worker 2%, tests 1%)
```

### negative-reentrant-handoff

```text
 FAIL  |@sodashitsu/web| src/desktop/nativeDrag.test.ts > does not start native work if handoff reentrantly cancels its scope
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/desktop/nativeDrag.test.ts:28:161


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 9 skipped (10)
   Start at  04:31:21
   Duration  1.03s (transform 56%, import 21%, environment 21%, tests 1%)
```

### negative-release-result

```text
 FAIL  |@sodashitsu/web| src/desktop/nativeDrag.test.ts > does not admit a wrong-release selection
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/desktop/nativeDrag.test.ts:37:326


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 9 skipped (10)
   Start at  04:31:15
   Duration  918ms (transform 61%, environment 21%, import 17%, tests 1%)
```

### negative-retiring-child

```text
 FAIL  |@sodashitsu/web| src/desktop/nativeDrag.test.ts > blocks another gesture until the cancelled native process actually closes
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/desktop/nativeDrag.test.ts:31:165


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 9 skipped (10)
   Start at  04:31:17
   Duration  1.03s (transform 57%, environment 24%, import 17%, tests 1%)
```

### negative-rpc-heartbeat

```text
 FAIL  |@sodashitsu/web| src/desktop/nativeHelperRpc.test.ts > uses only this page's direct origin and keeps its own helper alive without creating another
AssertionError: expected { id: '3', …(2) } to match object { …(2) }
(1 matching property omitted from actual)

- Expected
+ Received

  {
-   "method": "desktop.native_helper.touch",
+   "method": "desktop.native_helper.start",
    "params": {
      "viewerId": "1a3964d3-c9f8-432b-bfaa-3990e0a68df2",
    },
  }

 ❯ src/desktop/nativeHelperRpc.test.ts:11:65


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
```

### negative-touch-origin

```text
 FAIL  |@sodashitsu/server| src/desktop/DesktopNativeHelpers.test.ts > checks keepalive ownership without creating or renewing a helper
AssertionError: expected [Function] to throw an error
 ❯ src/desktop/DesktopNativeHelpers.test.ts:46:465


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 9 skipped (10)
   Start at  04:31:28
   Duration  830ms (transform 74%, import 24%, tests 2%)

```

## Independent review

Pointer reviewer and transfer reviewer completed separate fragile taskcheck and whole-diff reviews: no must. Both requested actual Vue integration in addition to the controller fixture; it was added and the delta reviewed with no further findings. CLI Gateway cleanup wording was clarified.

## Frozen delivery

Source and integrated-root build, forced server emit and typecheck passed. Related Chromium suite: source11/11 PASS39.3s, integrated root11/11 PASS45.9s. The first actual-Vue fixture iteration needed its settings panel opened before clicking file controls; this was fixture sequencing, and the corrected real UI path passed. Root23-path guarded reflection preserves three overlaps (remote-desktop docs, RemoteDesktopWindow and the bundled sodactl skill); the initial22 were independently replayed and byte-verified, with the documentation-only23rd path awaiting its delta check. Whole suites run serially at maxWorkers4. Initial source full suite:854 files passed, one CLI documentation test failed (12709 passed/1 failed,372.66s): the new native-helper command was absent from the bundled sodactl skill. Runtime tests passed. The usage entry was added, then skill+actual CLI tests passed14/14 (1.33s). This correction changes documentation only; the initial whole run is not labelled wholly green. Root full suite, clean smoke and exact-head CI receipts follow.
