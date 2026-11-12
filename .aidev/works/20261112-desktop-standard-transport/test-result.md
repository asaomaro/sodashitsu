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
