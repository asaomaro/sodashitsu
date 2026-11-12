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
