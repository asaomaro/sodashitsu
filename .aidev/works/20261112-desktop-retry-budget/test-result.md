# Desktop source-change retry budget

Base c9f3f394. Runtime change is one assignment: reset the existing startupRetries counter after a current-epoch frame passes renderDesktopUpdate and canvas draw, at lastDrawn acceptance. Ready alone, rejected decode and stale old-epoch completion do not reach it. No new state, timeout, permission, mode, native or transport change.

Before the fix, successful protected desktop transitions accumulated against a lifetime count: the fourth transition stopped a viewer even though every earlier connection displayed a valid frame. The budget now limits consecutive transitions without a rendered frame. Existing stop/epoch invalidation, readonly reconnect and fresh explicit control requirements remain intact.

The maintained Vue regression covers six rendered source epochs and then four consecutive no-frame transitions. Related reconnect/locked-capture tests:16 PASS after restoration, including ready-only exhaustion, old-epoch decode rejection, explicit control after a fresh frame and close cleanup.

The generated Chromium fixture uses the actual Vue component, frame decoder, DesktopFrameChain and renderDesktopUpdate/createImageBitmap/canvas path. Only the endpoint transport is replaced. It checks actual generated RGB pixels plus browser ACKs for six epochs; a separate ready-only case stops at the existing limit. Both cases PASS, control/input packets0, browser errors0 and browser/Vite cleanup confirmed. No real Windows, desktop, UAC or OS input is involved.

Negative control replaced only RemoteDesktopWindow.vue with exact c9f3 bytes; one Vitest regression failed and the successful-frame browser case failed, while no-frame exhaustion still passed. The fixed Vue bytes were restored exactly (restoration.json), then16 related tests and both browser cases passed again. No production build or whole suite was run; the integration owner will perform the final combined build once.

The first generated fixture expected the shorter status text instead of the existing protected-viewing label. That assertion was corrected before the recorded negative control; production logic remained the same one-line patch.

## Raw old-source Vitest failure

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-retry-budget

 ❯ |@sodashitsu/web| src/components/RemoteDesktopReconnect.test.ts (14 tests | 1 failed) 389ms
   × renews the consecutive retry budget only after a current source frame is rendered 24ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/web| src/components/RemoteDesktopReconnect.test.ts > renews the consecutive retry budget only after a current source frame is rendered
AssertionError: expected 5 to be 6 // Object.is equality

- Expected
+ Received

- 6
+ 5

 ❯ src/components/RemoteDesktopReconnect.test.ts:20:572


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 13 passed (14)
   Start at  08:47:32
   Duration  2.61s (transform 62%, tests 16%, import 11%, environment 11%)


```

## Raw old-source browser failure

```text
{"generatedOnly":true,"windows":false,"osInput":false,"componentSHA256":"3e050c9ac93924b7d5d426da6673e2e155e623f4a1b0db00449ec8ba8ed08537","cases":[{"name":"six rendered epochs keep viewing","ok":false,"error":"page.waitForFunction: Timeout 3500ms exceeded."},{"name":"ready-only failures remain bounded","ok":true,"epochs":4,"actualCanvasPixels":false,"controlOrInputSent":false}],"errors":[],"cleanup":{"browser":true,"vite":true}}
node:internal/modules/run_main:107
    triggerUncaughtException(
    ^

AssertionError [ERR_ASSERTION]: Browser regression failed
    at file:///workspaces/sodashitsu-desktop-retry-budget/.aidev/works/20261112-desktop-retry-budget/browser-check.mjs:80:3 {
  generatedMessage: false,
  code: 'ERR_ASSERTION',
  actual: false,
  expected: true,
  operator: '==',
  diff: 'simple'
}

Node.js v24.22.2

```
