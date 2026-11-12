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
