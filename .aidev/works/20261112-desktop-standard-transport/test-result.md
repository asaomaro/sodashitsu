# TS transport phase 1

Removed native human draw-age permission gate and its timestamp maps. Native frame ACKs remain media credits; explicit agent observation checks remain in DesktopAgentAccess. JPEG deferral derives from existing Share.video and helper deferNativeSnapshots capability, without nativeDraw marker.

Targeted NativeVideo/NativeAdaptive/AgentAccess: 52 PASS. Relay stopped-video/input and source ACK credit checks: 2 PASS.

Negative control before implementation (native draw gate retained):

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-transport-zero-custom

 ❯ |@sodashitsu/server| src/desktop/DesktopRelay.test.ts (347 tests | 1 failed | 346 skipped) 251ms
   × accepts human input after native video stops without requiring a draw receipt 249ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.ts > accepts human input after native video stops without requiring a draw receipt
AssertionError: expected '{"kind":"text","text":"ACCEPT_OLD_IMA…' to contain 'ACCEPT_STOPPED'

- Expected
+ Received

- ACCEPT_STOPPED
+ {"kind":"text","text":"ACCEPT_OLD_IMAGE"}
+ {"kind":"text","text":"ACCEPT_NATIVE"}
+ {"kind":"text","text":"ACCEPT_NATIVE_DEFER"}
+ {"kind":"text","text":"ACCEPT_IMAGE_WITH_OPTIN"}
+ {"kind":"text","text":"ACCEPT_IMAGE"}
+

 ❯ src/desktop/DesktopRelay.test.ts:361:43
    359|   inject(5,"ACCEPT_STOPPED",true);inject(6,"ACCEPT_IMAGE");
    360|   await expect.poll(async()=>(await readFile(f.record,"utf8")).include…
    361|   expect(await readFile(f.record,"utf8")).toContain("ACCEPT_STOPPED");
       |                                           ^
    362|   await expect.poll(()=>localAcks.mock.calls.some(([data])=>typeof dat…
    363|   } finally {helperWrites.mockRestore();localAcks.mockRestore();}

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 346 skipped (347)
   Start at  21:59:53
   Duration  2.05s (transform 71%, import 15%, tests 13%)


```

## Final regressions and helper lifecycle

The final native regression exercises browser input at Relay, before any draw receipt. Native helper polling removal: 30 related tests PASS; actual localhost bridge closure remains DesktopNativeTransfer.closed callback. Touch returned an existence check and never renewed a lease.

The native input regression FAILS with baseline Relay AND ProviderCore (capability producer) restored; helper polling regression FAILS with baseline browser helper RPC restored. Production files restored and byte-compared to saved versions. Raw outputs:

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-transport-zero-custom

 ❯ |@sodashitsu/server| src/desktop/DesktopRelay.test.ts (348 tests | 1 failed | 347 skipped) 1193ms
   × accepts human native input without any painted-frame receipt 1190ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.ts > accepts human native input without any painted-frame receipt
AssertionError: expected '' to contain 'NO_DRAW_RECEIPT'

- Expected
+ Received

- NO_DRAW_RECEIPT

 ❯ src/desktop/DesktopRelay.test.ts:375:85
    373|  server.media={id:crypto.randomUUID(),generation:1,seq:0,native:true,p…
    374|  viewer.send({type:"input",seq:1,frameSeq:server.seq,input:{kind:"text…
    375|  await expect.poll(async()=>readFile(f.record,"utf8").catch(()=>""),{t…
       |                                                                                     ^
    376| });
    377| it("reconnects when an installed worker ends after secure ready and th…

Caused by: Error: Matcher did not succeed in time.
 ❯ src/desktop/DesktopRelay.test.ts:375:2

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 347 skipped (348)
   Start at  22:09:52
   Duration  3.03s (transform 49%, tests 41%, import 10%)


```

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-transport-zero-custom

 ❯ |@sodashitsu/web| src/desktop/nativeHelperRpc.test.ts (3 tests | 1 failed | 2 skipped) 21ms
   × uses only this page's direct origin and relies on socket lifetime without polling the helper 19ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/web| src/desktop/nativeHelperRpc.test.ts > uses only this page's direct origin and relies on socket lifetime without polling the helper
AssertionError: expected [ { id: '1', …(2) }, …(2) ] to have a length of 2 but got 3

- Expected
+ Received

- 2
+ 3

 ❯ src/desktop/nativeHelperRpc.test.ts:11:58


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed | 1 passed (2)
      Tests  1 failed | 1 passed | 349 skipped (351)
   Start at  22:09:22
   Duration  2.38s (transform 70%, import 15%, tests 8%, environment 7%)


```

## Phase 3 ordinary helper command completion

Coordinated with native source commits f77b3874, 272c6574 and b64f2235. These native commits were cherry-picked only into this isolated worktree to supply matching synthetic-helper protocol fixtures; integration should use the original native SHAs separately.

Removed resource_epoch/resource_fence/terminal cleanup wire messages, ownership epochs, cleanup receipts, global fault, five-second timer, clock latches, wrapper stdin/stdout buffering and duplicate source JSON parsing. The remaining adapter uses the real child streams and the existing Provider/SharedCapture JSON parser. Native control commands/replies carry an ordinary source-local seq; clipboard uses existing generation; microphone uses its existing stream id. Existing same-viewer pending-control intent remains a boolean and is rechecked after completion. Source close retires only its own ownership.

Native drag pointer fields now only x/y/HWND/PID, bound in TS to actual source and input seq. Native selection keeps its existing nonce. File source generation reuses gesture UUID. Activation waits ordinary control completion, without a receipt epoch.

Validation:

- Targeted protocol/client-core compilation passed. No server/global build or Windows operation was run here.
- Nine related unit files: 146 PASS (owner/source channel, pointer ACKs, native files, selection, virtual schema, shared capture and physical-close reconnect).
- Related Relay control/pointer/clipboard/microphone/virtual-drag tests: 69 PASS. One existing `refuses control when B is readonly and closes an unacknowledged share` fails at its old eight-second closure expectation; this was already documented at baseline. No repeated baseline investigation.
- After deleting the duplicate stream parser: 12 focused tests PASS, covering stale/unsolicited control replies, clipboard/mic operation identity, same-source FIFO, different-helper handoff, physical-close boundary and queued same-viewer reacquisition.
- E2E takeover fixture changed from the removed fence marker to an ordinary control release marker. It still observes browser control status and sent/received frames; E2E execution is reserved for integrated build.

Dependency correction: initial worktree node_modules symlinks resolved parent protocol dist, giving false virtual-drag schema failures. Replaced only this worktree package links to its own protocol/client-core outputs and reran targeted compilation/tests. Parent build outputs were not changed.

Raw final related Relay output (known baseline failure included):

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-transport-zero-custom

 ❯ |@sodashitsu/server| src/desktop/DesktopRelay.test.ts (348 tests | 1 failed | 278 skipped) 24008ms
   × refuses control when B is readonly and closes an unacknowledged share 8121ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.ts > refuses control when B is readonly and closes an unacknowledged share
AssertionError: expected 1 to be 3 // Object.is equality

- Expected
+ Received

- 3
+ 1

 ❯ src/desktop/DesktopRelay.test.ts:473:63
    471|   a.send({ type: "input", seq: 1, frameSeq: 1, input: { kind: "text", …
    472|   a.send({ type: "heartbeat" });
    473|   await expect.poll(() => a.ws.readyState, { timeout: 8000 }).toBe(Web…
       |                                                               ^
    474|   await expect(readFile(f.record, "utf8")).rejects.toThrow();
    475| }, 12000);

Caused by: Error: Matcher did not succeed in time.
 ❯ src/desktop/DesktopRelay.test.ts:473:3

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 69 passed | 278 skipped (348)
   Start at  22:27:54
   Duration  25.81s (tests 93%, transform 5%, import 1%)


```

Raw focused post-parser-removal validation:

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-transport-zero-custom


 Test Files  4 passed (4)
      Tests  12 passed | 347 skipped (359)
   Start at  22:31:27
   Duration  2.54s (transform 64%, tests 23%, import 12%)

  Transform  |@sodashitsu/server| transforming modules took 3.42s · 64% of tracked time, re-done on every run
             persist transforms across runs with fsModuleCache: true
             learn more: https://vitest.dev/guide/improving-performance#caching-between-reruns


```

## Phase 4 ordinary human input and app RPC reuse

Removed human input.frameSeq (including strict schema and ordinary browser/Relay/Provider/signin TS producer/consumer checks). Capture/frame ACK ordering and agent observation.frameSeq remain. Removed dead SourceIdle.fresh clock/proof/reset state, browser receiver.active from canInput, per-operation Provider lastSeen<5s admission and blanket human input500ms expiry. Existing session/source12s liveness remains.

nativeHelperRpc reuses app Connection to the fixed page origin; the private raw parser/request map/sequence/15s request timers are deleted. The existing Connection.onClosed callback disconnects before its reconnect branch, with a regression proving no helper restart after close. No new connection mode/retry guard is added.

Optional input expiry is supported in Linux/Swift/synthetic helpers; native author supplies the matching Windows parser. The signin author supplies native Worker/Scope human frameSeq removal. These counterpart changes must integrate before a full build. Swift uses its existing expires=0 sentinel; malformed supplied Linux expiry is still rejected.

Validation:

- Protocol/client-core targeted compile PASS.
- SourceIdle/signin WorkerProcess/endpoint backplane/app RPC:58 PASS.
- Web helper RPC + native-transfer component:8 PASS.
- Ordinary JPEG input at3s/6.2s without a new image, native input before draw receipt, quiet Linux input and stale-agent rejection:5 PASS.
- Linux InputGuard18 PASS, including missing expiry accepted and supplied invalid/expired expiry rejected. Full portable suite has2 environmental failures from unavailable GStreamer GstVideo namespace (plus2 skips); no actual portal/input device operation was attempted.
- Swift optional-input regression added to its existing pure selftests. Swift/macOS compiler is unavailable in this container, so this is source-only here.
- Negative control: restored only Linux InputGuard implementation to pre-change source, new missing-expiry test FAILED; restored modified bytes and compared exactly, then all18 guards PASS. Raw output follows.

```text
F
======================================================================
FAIL: test_human_input_has_no_optional_operation_deadline (__main__.Guards.test_human_input_has_no_optional_operation_deadline)
----------------------------------------------------------------------
Traceback (most recent call last):
  File "/workspaces/sodashitsu-transport-zero-custom/scripts/remote-desktop/test-linux-portal-helper.py", line 131, in test_human_input_has_no_optional_operation_deadline
    self.assertTrue(g.input(command));self.assertTrue(c);self.assertEqual(g.seq,1)
    ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
AssertionError: False is not true

----------------------------------------------------------------------
Ran 1 test in 0.001s

FAILED (failures=1)

```

## Phase 5 bounded media flow and ordinary transport events

Removed3s format-barrier age tests across Relay/NativeVideo/web receiver;2.5s outstanding-ACK and5s silent-video teardown plus dead NativeVideo.tick/active.at; web2s frozen-frame,12s startup and2s codec-reset age teardown plus dead timestamps. Native media still enforces stream id/generation/baseSeq/order and finite frame credit. No replacement timer, retry loop or fallback was added. Actual transport/channel close, failed ICE and decoder errors remain failure events. RTC startup7s/8s timers were removed; transient disconnected no longer tears native transport down (W3C WebRTC2025, disconnected is recoverable).

Provider now reuses desktopSavedBinding/createDesktopSavedTransferState; duplicated hash, path and checkpoint-registry construction are removed. Durable-transfer metadata maps to RustDesk TransferSerde persisted jobs and resume/digest/offset checks, with Soda file-root/endpoint policy binding. Generic atomicFile lacks equivalent fsync/private-store protections; no new persistence framework was introduced.

Validation:

- MediaReceiver/feedback, NativeVideo/Adaptive and NativeDatagrams:49 PASS.
- Saved checkpoints/folders/Provider:38 PASS.
- Negative controls: restored only old mediaReceiver, NativeVideo and NativeDatagrams source;5 tests FAIL for healthy static WSS/UDP, delayed decoder format, delayed exact format ACK and artificial ICE startup timeout. Restored modified sources and byte-compared; same5 PASS. Raw OLD FAIL and final PASS summaries follow.
- Matching Windows producer age gates are removed by native phase755ada9b. Portable producer age gates are audited and removed in the next phase; existing portable-specific docs still describe them until that matching source change.

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-transport-zero-custom

 ❯ |@sodashitsu/server| src/desktop/DesktopNativeAdaptive.test.ts (12 tests | 1 failed | 11 skipped) 13ms
   × accepts an exact delayed format ACK and ignores it after explicit stop 12ms
 ❯ |@sodashitsu/server| src/desktop/DesktopNativeDatagrams.audio.test.ts (2 tests | 1 failed | 1 skipped) 59ms
   × waits for ICE state instead of a short startup timeout or transient disconnect 58ms
 ❯ |@sodashitsu/web| src/desktop/mediaReceiver.test.ts (19 tests | 3 failed | 16 skipped) 16ms
   × keeps a healthy static video without an age-based fallback for datagrams=false 9ms
   × keeps a healthy static video without an age-based fallback for datagrams=true 3ms
   × waits for a correlated decoder format without accepting retired decoder callbacks 3ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 5 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/web| src/desktop/mediaReceiver.test.ts > keeps a healthy static video without an age-based fallback for datagrams=false
 FAIL  |@sodashitsu/web| src/desktop/mediaReceiver.test.ts > keeps a healthy static video without an age-based fallback for datagrams=true
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ src/desktop/mediaReceiver.test.ts:49:29


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/5]⎯

 FAIL  |@sodashitsu/web| src/desktop/mediaReceiver.test.ts > waits for a correlated decoder format without accepting retired decoder callbacks
Error: Unexpected native format
 ❯ DesktopMediaReceiver.nativeStream src/desktop/mediaReceiver.ts:190:130
    188|     if(this.stopped||this.codecFallbackAt!==undefined)return;if(datagr…
    189|     if(!datagrams){this.peer?.close();this.peer=undefined;}
    190|     if(baseSeq!==undefined&&(!this.barrier||generation!==this.barrier.…
       |                                                                                                                                  ^
    191|     this.native?.stop();this.native=undefined;this.releaseSource();thi…
    192|     this.generation=generation;this.sequence=baseSeq??0;
 ❯ src/desktop/mediaReceiver.test.ts:116:111

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/5]⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopNativeAdaptive.test.ts > accepts an exact delayed format ACK and ignores it after explicit stop
AssertionError: expected last "vi.fn()" call to have been called with [ { …(4) } ]

- Expected
+ Received

  [
    {
-     "baseSeq": 1,
+     "bitrateKbps": 2500,
+     "fps": 30,
      "generation": 2,
+     "height": 600,
      "id": "48e36e22-c30c-4c20-922e-0f3baf3e4057",
-     "type": "native_profile_resume",
+     "type": "native_profile",
+     "width": 960,
    },
  ]

 ❯ src/desktop/DesktopNativeAdaptive.test.ts:43:96


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/5]⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopNativeDatagrams.audio.test.ts > waits for ICE state instead of a short startup timeout or transient disconnect
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times

Received:

  1st vi.fn() call:

    Array []


Number of calls: 1

 ❯ src/desktop/DesktopNativeDatagrams.audio.test.ts:18:125


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/5]⎯


 Test Files  3 failed (3)
      Tests  5 failed | 28 skipped (33)
   Start at  22:56:30
   Duration  1.16s (transform 71%, import 18%, environment 7%, tests 3%)


```

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-transport-zero-custom


 Test Files  3 passed (3)
      Tests  5 passed | 28 skipped (33)
   Start at  22:58:41
   Duration  1.19s (transform 73%, import 18%, environment 7%, tests 3%, worker 1%)


```

## Phase 6

Python native-video:41 tests passed,5 environment/codec skips. Portal NativeVideoReplacement and Guards:22 passed. Signin WorkerProcess:27 passed. macOS source selftests updated; Swift compiler unavailable here. Old source negative controls restore only production files, retain new tests, then restore/byte-compare: delayed ACK, delayed publication/profile,1100 stream requests and delayed actual encoder close fail before the change (`/tmp/transport-phase6-old-fail.log`). Healthy signin beyond120s fails on old source (`/tmp/transport-phase6-worker-old-fail.log`). Raw OLD FAIL evidence:

```text
 of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-transport-zero-custom

 ❯ |@sodashitsu/server| src/desktop/DesktopSigninWorkerProcess.test.ts (27 tests | 1 failed | 26 skipped) 15ms
   × checks startup deadline and actual owner loss without a healthy lifetime cap 14ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSigninWorkerProcess.test.ts > checks startup deadline and actual owner loss without a healthy lifetime cap
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times

Received:

  1st vi.fn() call:

    Array []


Number of calls: 1

 ❯ src/desktop/DesktopSigninWorkerProcess.test.ts:49:109
     47| it("checks startup deadline and actual owner loss without a healthy li…
     48|   vi.useFakeTimers();const f=fixture();f.clock(10000);f.output(ready);…
     49|   const g=fixture();g.output(ready);g.clock(600000);g.process.send({ty…
       |                                                                                                             ^
     50|   const h=fixture();h.lose();h.output(ready);expect(h.records).toHaveL…
     51| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 26 skipped (27)
   Start at  23:29:52
   Duration  867ms (transform 76%, import 21%, tests 2%)


```

Portable OLD FAIL evidence:

```text
EFEF
======================================================================
ERROR: test_delayed_ack_returns_credit_on_the_current_stream (__main__.Flow.test_delayed_ack_returns_credit_on_the_current_stream)
----------------------------------------------------------------------
Traceback (most recent call last):
  File "/workspaces/sodashitsu-transport-zero-custom/scripts/remote-desktop/test-linux-native-video.py", line 159, in test_delayed_ack_returns_credit_on_the_current_stream
    self.assertEqual(self.flow.current["pending"],[])
                     ~~~~~~~~~~~~~~~~~^^^^^^^^^^^
TypeError: 'NoneType' object is not subscriptable

======================================================================
ERROR: test_many_distinct_streams_do_not_exhaust_a_healthy_helper (__main__.Flow.test_many_distinct_streams_do_not_exhaust_a_healthy_helper)
----------------------------------------------------------------------
Traceback (most recent call last):
  File "/workspaces/sodashitsu-transport-zero-custom/scripts/remote-desktop/test-linux-native-video.py", line 303, in test_many_distinct_streams_do_not_exhaust_a_healthy_helper
    for _ in range(1100):self.start();self.flow.stop(False)
                         ^^^^^^^^^^^^
  File "/workspaces/sodashitsu-transport-zero-custom/scripts/remote-desktop/test-linux-native-video.py", line 36, in start
    self.flow.start({"type": "native_video", "enabled": True, "id": identifier,
  File "/workspaces/sodashitsu-transport-zero-custom/scripts/remote-desktop/linux-native-video.py", line 267, in start
    raise VideoFailure("settings")
owned_video.VideoFailure: settings

======================================================================
FAIL: test_delayed_admitted_publication_keeps_its_source_identity (__main__.Flow.test_delayed_admitted_publication_keeps_its_source_identity)
----------------------------------------------------------------------
Traceback (most recent call last):
  File "/workspaces/sodashitsu-transport-zero-custom/scripts/remote-desktop/test-linux-native-video.py", line 120, in test_delayed_admitted_publication_keeps_its_source_identity
    self.assertTrue(valid())
AssertionError: False is not true

======================================================================
FAIL: test_matching_profile_resume_survives_delayed_publication (__main__.Profiles.test_matching_profile_resume_survives_delayed_publication)
----------------------------------------------------------------------
Traceback (most recent call last):
  File "/workspaces/sodashitsu-transport-zero-custom/scripts/remote-desktop/test-linux-native-video.py", line 389, in test_matching_profile_resume_survives_delayed_publication
    self.assertIsNotNone(self.flow.current);self.assertEqual(sum(value["type"]=="native_frame" for value,_ in self.output),2)
    ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
AssertionError: unexpectedly None

----------------------------------------------------------------------
Ran 4 tests in 0.006s

FAILED (failures=2, errors=2)
E
======================================================================
ERROR: test_healthy_pending_start_waits_for_actual_encoder_close (__main__.NativeVideoReplacement.test_healthy_pending_start_waits_for_actual_encoder_close)
----------------------------------------------------------------------
Traceback (most recent call last):
  File "/workspaces/sodashitsu-transport-zero-custom/scripts/remote-desktop/test-linux-portal-helper.py", line 88, in test_healthy_pending_start_waits_for_actual_encoder_close
    identifier=self.start(h);clock[0]=60000;h.pump_native();factory.assert_not_called();self.assertEqual(h.native.current["id"],identifier)
                                                                                                         ~~~~~~~~~~~~~~~~^^^^^^
TypeError: 'NoneType' object is not subscriptable

----------------------------------------------------------------------
Ran 1 test in 0.014s

FAILED (errors=1)

```

## Phase 7

Plaintext regression:2 tests passed (shared/unshared) using a helper that never answers the first request, cancellation, and successful fresh copy under the same grant. Shared route regression proves late old response ignored. Rich tests prove existing3s end-to-end deadline, late response retirement and fresh request without grant loss; healthy transaction survives idle time until actual cancel. Portal rich tests9 passed. Swift source selftests updated; compiler unavailable. OLD source negative control restores only Provider/SharedClipboard/RichClipboard production files, retains new tests, then restores/byte-compares:5 regressions fail before and pass after.

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-transport-zero-custom

 ❯ |@sodashitsu/server| src/desktop/DesktopRichClipboard.test.ts (7 tests | 2 failed | 5 skipped) 14ms
   × keeps a healthy idle transaction until explicit cancellation, then accepts a new ID 9ms
   × uses the existing three-second request budget and ignores late old replies without revoking permission 4ms
 ❯ |@sodashitsu/server| src/desktop/DesktopSharedClipboard.test.ts (8 tests | 1 failed | 7 skipped) 8ms
   × cancels a plaintext route without revoking its grant and ignores its late response 7ms
 ❯ |@sodashitsu/server| src/desktop/DesktopRelay.test.ts (350 tests | 2 failed | 348 skipped) 2399ms
   × cancels only a timed-out plaintext request and retries without regrant, shared=false 1237ms
   × cancels only a timed-out plaintext request and retries without regrant, shared=true 1160ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 5 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.ts > cancels only a timed-out plaintext request and retries without regrant, shared=false
 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.ts > cancels only a timed-out plaintext request and retries without regrant, shared=true
AssertionError: expected 1 to be +0 // Object.is equality

- Expected
+ Received

- 0
+ 1

 ❯ src/desktop/DesktopRelay.test.ts:2141:1245


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/5]⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopRichClipboard.test.ts > keeps a healthy idle transaction until explicit cancellation, then accepts a new ID
AssertionError: expected undefined to be '22222222-2222-4222-8222-222222222222' // Object.is equality

- Expected:
"22222222-2222-4222-8222-222222222222"

+ Received:
undefined

 ❯ src/desktop/DesktopRichClipboard.test.ts:120:46
    118|     f.result("begin", { size: 3 });
    119|     await vi.advanceTimersByTimeAsync(5001);
    120|     expect((f.clipboard as any).current?.id).toBe(id);
       |                                              ^
    121|     f.request("cancel");
    122|     const next = "33333333-3333-4333-8333-333333333333";

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/5]⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopRichClipboard.test.ts > uses the existing three-second request budget and ignores late old replies without revoking permission
AssertionError: expected last "vi.fn()" call to have been called with [ ObjectContaining{…} ]

- Expected
+ Received

  [
    {
-     "expiresAt": 1794494224234,
+     "expiresAt": 1794494222234,
+     "generation": 1,
+     "id": "22222222-2222-4222-8222-222222222222",
+     "operation": "read",
+     "type": "clipboard_rich",
    },
  ]

 ❯ src/desktop/DesktopRichClipboard.test.ts:132:192


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/5]⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSharedClipboard.test.ts > cancels a plaintext route without revoking its grant and ignores its late response
AssertionError: expected 2 to be +0 // Object.is equality

- Expected
+ Received

- 0
+ 2

 ❯ src/desktop/DesktopSharedClipboard.test.ts:183:362


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/5]⎯


 Test Files  3 failed (3)
      Tests  5 failed | 360 skipped (365)
   Start at  23:37:00
   Duration  4.11s (transform 49%, tests 40%, import 11%)

  Transform  |@sodashitsu/server| transforming modules took 3.02s · 49% of tracked time, re-done on every run
             persist transforms across runs with fsModuleCache: true
             learn more: https://vitest.dev/guide/improving-performance#caching-between-reruns


```

## Phase 8

Agent/headless/regional/snapshot targeted suite21 passed before final assertion strengthening. Real Provider/Relay regression holds an already-captured JPEG before requesting capture, delivers it without the requestID, proves promise stays pending, ACKs it through the actual bounded source, then accepts matching new capture. SharedCapture test concurrent members: blocked member cannot lose or leak its ID; real member ACK triggers reissue. Linux Guards19 passed including existing pipeline barrier and old-ID ACK preserving newer request; discard retains pending IDs. OLD production Relay/SharedCapture fail2 regressions, and old Linux producer fails snapshot barrier regression. Files restored and byte-compared. Swift compiler unavailable. Windows/signin producer changes supplied by respective owners.

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-transport-zero-custom

 ❯ |@sodashitsu/server| src/desktop/DesktopRelay.test.ts (351 tests | 1 failed | 350 skipped) 238ms
   × requires a capture-correlated full image after an agent snapshot request, ignoring queued old pixels 236ms
 ❯ |@sodashitsu/server| src/desktop/DesktopSharedCapture.test.ts (91 tests | 1 failed | 90 skipped) 1017ms
   × routes concurrent fresh snapshot IDs without stealing a blocked member's request 1016ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.ts > requires a capture-correlated full image after an agent snapshot request, ignoring queued old pixels
TypeError: Cannot read properties of undefined (reading 'id')
 ❯ src/desktop/DesktopRelay.test.ts:2142:946


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSharedCapture.test.ts > routes concurrent fresh snapshot IDs without stealing a blocked member's request
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ src/desktop/DesktopSharedCapture.test.ts:522:526


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯


 Test Files  2 failed (2)
      Tests  2 failed | 440 skipped (442)
   Start at  23:46:42
   Duration  2.57s (transform 57%, tests 30%, import 13%)

  Transform  |@sodashitsu/server| transforming modules took 2.38s · 57% of tracked time, re-done on every run
             persist transforms across runs with fsModuleCache: true
             learn more: https://vitest.dev/guide/improving-performance#caching-between-reruns

F
======================================================================
FAIL: test_snapshot_request_uses_existing_pipeline_pts_boundary_and_ack_keeps_newer_request (__main__.Guards.test_snapshot_request_uses_existing_pipeline_pts_boundary_and_ack_keeps_newer_request)
----------------------------------------------------------------------
Traceback (most recent call last):
  File "/workspaces/sodashitsu-transport-zero-custom/scripts/remote-desktop/test-linux-portal-helper.py", line 183, in test_snapshot_request_uses_existing_pipeline_pts_boundary_and_ack_keeps_newer_request
    self.assertIsNone(helper.queued);self.assertEqual(helper.barrier,1134);self.assertEqual(helper.snapshot_ids,{one})
    ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
AssertionError: (b'old JPEG',) is not None

----------------------------------------------------------------------
Ran 1 test in 0.001s

FAILED (failures=1)

```
